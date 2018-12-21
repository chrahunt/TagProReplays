/* global chrome:false */
const $ = require('jquery');
// Set global since bootstrap assumes it.
window.$ = window.jQuery = $;
require('popper.js'); // required for popovers
require('bootstrap');
// Relinquish control back to existing version if needed.
$.noConflict(true);

require('chrome-storage-promise');
const moment = require('moment');
const reader = require('promise-file-reader');

const Cookies = require('util/cookies');
const logger = require('util/logger')('content');
const Replays = require('modules/replay-collection');
const Textures = require('modules/textures');
const track = require('util/track');
const {Viewer} = require('modules/previewer');

// Components
const ActivityDialog = require('modules/activity-dialog');
const Table = require('modules/table');
const Upload = require('modules/upload');
const Search = require('modules/search');

const url = new URL(document.URL);
// Get URL for setting cookies, assumes a domain of *.hostname.tld:*/etc
var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//)[1];

// Moment calendar customization for date display.
moment.updateLocale('en', {
  calendar: {
    lastDay: '[Yesterday at] LT',
    sameDay: 'LT',
    nextDay: '[Tomorrow at] LT',
    lastWeek: 'lll',
    nextWeek: 'lll',
    sameElse: 'lll'
  }
});

// Inserts Replay button in main page
function createReplayPageButton() {
  if ($('#userscript-home').length) {
    $('#play-now').after('<a class="btn" id="ReplayMenuButton">Replays');
    $('#ReplayMenuButton').append('<span class="sub-text">watch yourself');
  } else {
    $('div.buttons > a[href="/boards"]').after('<a class="button" id="ReplayMenuButton">Replays');
    $('#ReplayMenuButton').append('<span>watch yourself');
  }

  $('#ReplayMenuButton').click(function () {
    // Show menu.
    if ($('#menuContainer').length) {
      $('#menuContainer').modal('show');
    }
  });
}

// Set up multi-modal fix
// http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
function modalFix() {
  // Track backdrops to overcome duplicate bootstrap code causing problems.
  var backdrops = new Map();
  $(function () {
    $('.modal').on('hidden.bs.modal', function () {
      $(this).removeClass('fv-modal-stack');
      $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') - 1);
      if (backdrops.has(this)) {
        backdrops.get(this).remove();
        backdrops.delete(this);
      }
    });

    $('.modal').on('shown.bs.modal', function () {
      // keep track of the number of open modals
      if (typeof($('#tpr-container').data('open_modals')) == 'undefined') {
        $('#tpr-container').data('open_modals', 0);
      }

      // if the z-index of this modal has been set, ignore.
      if ($(this).hasClass('fv-modal-stack')) {
        return;
      }

      $(this).addClass('fv-modal-stack');

      $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') + 1);

      $(this).css('z-index', 1040 + (10 * $('#tpr-container').data('open_modals')));

      $('.modal-backdrop').not('.fv-modal-stack').css(
        'z-index', 1039 + (10 * $('#tpr-container').data('open_modals')));

      var these_backdrops = $('.modal-backdrop').not('.fv-modal-stack');
      backdrops.set(this, these_backdrops);
      these_backdrops.addClass('fv-modal-stack');
    });
  });
}

// Inject menu html into page.
function injectMenu() {
  return new Promise((resolve) => {
    var insert_point;
    if ($('#userscript-home').length) {
      insert_point = $('body');
    } else {
      insert_point = $('article');
    }
    // Create Container for Replay Menu.
    insert_point.append('<div id="tpr-container" class="bootstrap-container jquery-ui-container">');

    // Retrieve html of all items
    $('#tpr-container').load(
      chrome.extension.getURL("html/menus.html"), resolve);
  });
}

// Initialize settings and texture picker.
function initSettings() {
  // Settings container.
  $('#settings-title').text('TagPro Replays v' + chrome.runtime.getManifest().version);
  setFormTitles();
  let settings = [{
    name: 'fps',
    id: 'fpsInput',
    type: 'number'
  }, {
    name: 'duration',
    id: 'durationInput',
    type: 'number'
  }, {
    name: 'record',
    id: 'recordCheckbox',
    type: 'checkbox'
  }, {
    name: 'custom_textures',
    id: 'useTextureCheckbox',
    type: 'checkbox'
  }, {
    name: 'hotkey_enabled',
    id: 'recordKeyChooserInput',
    get: $elt => $elt.data('record'),
    set: ($elt, val) => $elt.data('record', val)
  }, {
    name: 'hotkey',
    id: 'recordKeyChooserInput',
    get: $elt => {
      if ($elt.text() == 'None') return null;
      return $elt.text().charCodeAt(0);
    },
    set: ($elt, val) => {
      if ($elt.data('record')) {
        $elt.text(String.fromCharCode(val));
        $('#record-key-remove').show();
      } else {
        $elt.val('None');
        $('#record-key-remove').hide();
      }
    }
  }, {
    name: 'splats',
    id: 'useSplatsCheckbox',
    type: 'checkbox'
  }, {
    name: 'spin',
    id: 'useSpinCheckbox',
    type: 'checkbox'
  }, {
    name: 'ui',
    id: 'useClockAndScoreCheckbox',
    type: 'checkbox'
  }, {
    name: 'chat',
    id: 'useChatCheckbox',
    type: 'checkbox'
  }, {
    name: 'tile_previews',
    id: 'useTilePreviewsCheckbox',
    type: 'checkbox'
  }, {
    name: 'canvas_width',
    id: 'canvasWidthInput',
    type: 'number'
  }, {
    name: 'canvas_height',
    id: 'canvasHeightInput',
    type: 'number'
  }].map((setting) => {
    // Custom getter/setter.
    if (!setting.type) return setting;
    if (setting.type == 'number') {
      setting.get = $elt => {
        let val = Number($elt.val());
        // We allow no non-zero values.
        if (isNaN(val) || !val) return null;
        return val;
      }
      setting.set = ($elt, val) => $elt.val(val);
    } else if (setting.type == 'checkbox') {
      setting.get = $elt => $elt.prop('checked');
      setting.set = ($elt, val) => $elt.prop('checked', val);
    }
    return setting;
  });

  // Save form fields.
  function saveSettings() {
    let options = {};
    for (let setting of settings) {
      let $elt = $(`#${setting.id}`);
      let result = setting.get($elt);
      if (result !== null) {
        options[setting.name] = result;
      } else {
        logger.warn(`Value not valid for field ${setting.id}.`);
      }
    }
    // Save options.
    chrome.storage.promise.local.get('options').then((items) => {
      if (!items.options) {
        throw new Error('Existing options not found in chrome storage');
      }
      let new_options = Object.assign(items.options, options);
      chrome.storage.promise.local.set({
        options: new_options
      }).then(() => {
        logger.info('Options set.');
      });
    });

    chrome.runtime.sendMessage({
      method: 'cleanRenderedReplays'
    });
    $('#settingsContainer').modal('hide');
  }

  $('#saveSettingsButton').click(saveSettings);

  // Set value of settings when dialog opened, using default values if
  // none have yet been set.
  function setSettings() {
    return chrome.storage.promise.local.get('options').then((items) => {
      logger.info('Options: ', items);
      if (!items.options) {
        throw new Error('Options not found.');
      }
      for (let setting of settings) {
        let $elt = $(`#${setting.id}`);
        setting.set($elt, items.options[setting.name]);
      }
    }).catch((err) => {
      logger.error(err);
      throw err;
    });
  }

  $('#settingsContainer').on('show.bs.modal', setSettings);
  // Set settings so other areas that use the settings directly from the
  // elements will work properly.
  setSettings().then(() => {
    logger.info('Settings set.');
  });

  // Record key input.
  function keyListener(e) {
    $('#recordKeyChooserInput').text(String.fromCharCode(e.which))
    $('#recordKeyChooserInput').data('record', true);
    $('#record-key-remove').show();
    stopInputting();
  }

  function stopInputting() {
    $('#record-key-input-container').removeClass('focused');
    $(document).off("keypress", keyListener);
  }

  $('#record-key-input-container').click(function () {
    $(this).addClass('focused');
    $(document).on("keypress", keyListener);
  });

  $('#record-key-remove').click(function (e) {
    e.stopPropagation();
    $('#recordKeyChooserInput').data('record', false);
    $('#recordKeyChooserInput').text('None');
    $('#record-key-remove').hide();
    return false;
  });

  $(document).click(function (e) {
    if (!$(e.target).parents().addBack().is('#record-key-input-container')) {
      stopInputting();
    }
  });

  $('#textureSaveButton').click(function () {
    // Load image files, if available, from file fields.
    let imageSources = {
      tilesInput:        "tiles",
      portalInput:       "portal",
      speedpadInput:     "speedpad",
      speedpadredInput:  "speedpadred",
      speedpadblueInput: "speedpadblue",
      splatsInput:       "splats"
    };
    let textures = {};
    Promise.all(Object.keys(imageSources).map((id) => {
      let input = document.getElementById(id);
      if (!input) {
        return Promise.reject(`Could not find input with id: ${id}`);
      }
      let file = input.files[0];
      if (!file) return;
      return reader.readAsDataURL(file).then((data) => {
        textures[imageSources[id]] = data;
      });
    })).then(() => {
      return Textures.set(textures);
    }).then(() => {
      $('#textureContainer').modal('hide');
    }).catch((err) => {
      logger.error('Error saving textures: ', err);
    });
  });
}


// Initialize replay table.
let replay_table = new Table({
  collection: Replays,
  // Rendering the individual row from a template and the replay.
  render: ($row, replay) => {
    // Set playback link text
    $row.find('a.playback-link').text(replay.name);
    if (replay.rendered) {
      $row.find('.rendered-check').text('✓');
      $row.find('.download-movie-button').prop('disabled', false);
    } else {
      $row.find('.rendered-check').text('');
      $row.find('.download-movie-button').prop('disabled', true);
    }
    let duration = moment(replay.duration * 1000);
    $row.find('.duration').text(duration.format('mm:ss'));
    let recorded = moment(replay.recorded);
    $row.find('.replay-date').text(recorded.calendar());
    let titleText = formatMetaDataTitle(replay);
    $row.attr('title', titleText);
  },
  sort_fields: {
    default: {
      name: 'recorded',
      dir: 'desc'
    },
    name: {
      id: 'nameHeader',
      text: 'Name',
      sort: (a, b) => a.name.localeCompare(b.name)
    },
    recorded: {
      id: 'dateHeader',
      text: 'Date',
      sort: (a, b) => a.recorded - b.recorded
    },
    duration: {
      id: 'durationHeader',
      text: 'Duration',
      sort: (a, b) => a.duration - b.duration
    },
    rendered: {
      id: 'renderedHeader',
      text: 'Rendered',
      sort: (a, b) => a.rendered - b.rendered
    }
  }
});

let viewer = new Viewer();
// Initialize the menu.
function initMenu() {
  logger.info("Menu loaded.");
  modalFix();
  initSettings();
  replay_table.init();
  viewer.init();
  let activity_dialog = new ActivityDialog($('#activity-container'));

  let menu_opened = false;
  // Update list of replays when menu is opened.
  $('#menuContainer').on('show.bs.modal', function () {
    if (!menu_opened) {
      menu_opened = true;
      track("Menu Opened");
    }
    replay_table.update();
  });

  replay_table.add_collection_action('#renderSelectedButton', (replays) => {
    if (!confirm('Are you sure you want to render these replays?'
      + ' The extension will be unavailable until the movies'
      + ' are rendered.')) {
      return;
    }
    let unrendered = replays.filter((replay) => {
      return !replay.rendered;
    });
    if (!unrendered.length) {
      alert('You must select at least one unrendered replay.');
      return;
    }
    // Update UI.
    unrendered.each((replay) => {
      let $row = replay_table.get_row(replay.id);
      $row.find('.rendered-check').text('Queued');
    });
    // Render replays in sequence.
    render_loop(0);
    function render_loop(index) {
      if (index === unrendered.length) {
        logger.info('Rendering completed for all replays.');
        return;
      }
      let replay = unrendered.get(index);
      let $row = replay_table.get_row(replay.id);
      $row.find('.rendered-check').html('<progress class="progressbar">');
      replay.render().progress((progress) => {
        let progress_bar = $row.find('.progressbar')[0];
        progress_bar.value = progress;
      }).catch((err) => {
        if (err.name == 'AlreadyRendering') {
          alert(`Error rendering replays: ${err.message}`);
          // Replay render status on all selected replays.
          for (let i = index; i < unrendered.length; i++) {
            let $row = replay_table.get_row(unrendered.get(i).id);
            $row.find('.rendered-check').html('<span style="color:red">ERROR');
          }
          // Re-throw to abort the rest of the renders.
          throw err;
        } else {
          // Only error for the single replay.
          $row.find('.rendered-check').html('<span style="color:red">ERROR');
        }
      }).then(() => {
        render_loop(++index);
      });
    }
  });

  replay_table.add_collection_action('#deleteSelectedButton', (replays) => {
    if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
      logger.info(`Requesting deletion of: ${replays.ids}`);
      replays.delete().catch((err) => {
        logger.error('Error deleting replays: ', err);
      });
    }
  });

  /**
   * Callback for replay download button.
   * 
   * Raw data is zipped on the background page,
   * this just sends the request and then manages
   * the progress modal.
   */
  replay_table.add_collection_action('#downloadRawButton', (replays) => {
    logger.info(`Requesting download for: ${replays.ids}`);
    if (replays.length === 1) {
      replays.get(0).download().catch((err) => {
        alert(`Error downloading replay: ${err.message}`);
      });
      return;
    }
    // Initialize activity dialog.
    activity_dialog.set({
      dismissable: false,
      progress: true
    });
    activity_dialog.header('Replay Export');
    activity_dialog.text('Preparing download');
    activity_dialog.progress(0);
    activity_dialog.show();
    // Zipping messages override 
    let zipping = 0;
    // Update activity dialog progress.
    function update_dialog(activity) {
      let {action, value} = activity;
      if (action == 'progress') {
        activity_dialog.progress(value);
        if (!zipping) {
          activity_dialog.text('Adding files to zip.');
        }
      } else if (action == 'state') {
        // Zip updates.
        // Stop zipping.
        if (value.startsWith('!')) {
          zipping--;
          if (!zipping) {
            activity_dialog.text('Downloading zip...');
          }
        } else {
          zipping++;
          if (value == 'zip:intermediate') {
            activity_dialog.text('Generating intermediate zip file.');
          } else if (value == 'zip:final') {
            activity_dialog.text('Generating final zip.');
          }
        }
      }
    }
    replays.download().progress((progress) => {
      update_dialog(progress);
    }).then(() => {
      activity_dialog.text('Replays exported.');
    }).catch((err) => {
      activity_dialog.text(`Replay export failed, reason: ${err.message}`);
    }).then(() => {
      activity_dialog.update({
        dismissable: true
      });
    });
  });

  replay_table.add_row_action('.playback-link', (replay) => {
    logger.info(`Playback link clicked for ${replay.id}`);
    $('#menuContainer').hide();
    viewer.load(replay);
  });

  replay_table.add_row_action('.download-movie-button', (replay) => {
    logger.info(`Movie download button clicked for ${replay.id}`);
    replay.download_movie().then(() => {
      logger.debug('Movie download completed.');
    }).catch((err) => {
      alert(`Download failed. Most likely you haven't rendered that movie yet.\nReason: ${err.message}`);
    });
  });

  replay_table.add_row_action('.rename-button', (replay) => {
    logger.info(`Rename button clicked for ${replay.id}`);
    let name = replay.name;
    let new_name = prompt(`Please enter a new name for ${name}`, name);
    if (new_name === null) return;
    replay.rename(new_name).catch((err) => {
      logger.error('Error renaming replay: ', err);
      alert(`Replay renaming failed: ${err.message}`);
    });
  });

  // Raw data import.
  let resume;
  $('#import-alert').on('hidden.bs.modal', () => {
    if (resume) {
      resume();
      resume = null;
    }
  });

  function showImportAlert(filename, reason) {
    return new Promise((resolve) => {
      resume = resolve;
      $('#import-alert .filename').text(filename);
      $('#import-alert .reason').text(reason);
      $('#import-alert').modal({
        backdrop: false
      });
    });
  }

  let import_start, import_end, total_size, total;
  function report_stats() {
    let duration = import_end - import_start;
    logger.info(`Import Statistics:\nStart: ${import_start}\n`
      + `End: ${import_end}\nDuration: ${duration}\nTotal files:`
      + ` ${total}\nSize: ${total_size}`);
  }
  function readImportedFile(files, i) {
    if (!i) {
      // Reset stats.
      total = files.length;
      total_size = 0;
      import_start = performance.now();
    }
    if (i == files.length) {
      import_end = performance.now();
      report_stats();
      return;
    }
    let file = files[i++];
    total_size += file.size;
    return reader.readAsText(file).then((text) => {
      return Replays.import({
        name: file.name,
        data: text
      });
    }).then(() => {
      logger.info(`Replay ${file.name} imported.`);
    }).catch((err) => {
      if (err.name == 'ValidationError') {
        // Wait for dialog before proceeding.
        return showImportAlert(file.name, err.message);
      }
      // Re-throw if not due to validation.
      throw err;
    }).then(() => {
      return readImportedFile(files, i);
    });
  }
    
  // Track whether we're importing, keep table from updating if so.
  let importing = false;
  let upload = new Upload('raw-upload-button');
  upload.on('files', (files) => {
    importing = true;
    readImportedFile(files, 0).then(() => {
      logger.info('Done importing.');
      // Update table to reflect newly-imported replays.
      replay_table.update();
    }).catch((err) => {
      alert(`Error importing: ${err.message}`);
    }).then(() => {
      importing = false;
    })
  });

  // Listen for search sumissions
  let search = new Search();
  search.on('submit', (query) => {
    logger.info('Submitting search query.');
    replay_table.filter_replays(query);
  });
  search.on('reset', () => {
    logger.info('Resetting search query.');
    replay_table.reset();
  });


  // Table update listeners.
  Replays.on('added', (replay) => {
    if (importing) return;
    replay_table.add_replay(replay);
  });

  Replays.on('deleted', (ids) => {
    replay_table.remove_replays(ids);
  });

  Replays.on('updated', (id, replay) => {
    replay_table.update_replay(id, replay);
  });
} // end initMenu

// Function to set UI titles.
function setFormTitles() {
  let fpsTitle = 'Use this to set how many times per second data are recorded from the tagpro game.\n' +
    'Higher fps will create smoother replays.\n\nIf you experience framerate drops during gameplay,' +
    ' or if your replays are sped up, try reducing this value.';
  $('#fpsTxt').prop('title', fpsTitle);
  $('#fpsInput').prop('title', fpsTitle);

  let durationTitle = 'Use this to set how long the replay will be in seconds. Values greater than 60' +
    ' seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect' +
    ' replays that have already been recorded';
  $('#durationText').prop('title', durationTitle);
  $('#durationInput').prop('title', durationTitle);

  let recordTitle = 'This controls whether the extension is capable of recording replays during a tagpro game.\n\n' +
    'Uncheck to disable the extension.';
  $('#recordTxt').prop('title', recordTitle);
  $('#recordCheckbox').prop('title', recordTitle);

  let useTextureTitle = 'This controls whether custom texture files will be used in rendered movies.\n\n' +
    'Check to use textures, uncheck to use vanilla.\n\nThis only applies to rendered movies.';
  $('#useTextureTxt').prop('title', useTextureTitle);
  $('#useTextureCheckbox').prop('title', useTextureTitle);

  let textureMenuButtonTitle = 'This button allows you to upload your custom texture files';
  $('#textureMenuButton').prop('title', textureMenuButtonTitle);

  let recordKeyTitle = 'This allows you to designate a key that acts exactly like clicking' +
    ' the record button with the mouse.\n\nDon\'t use keys that have other uses in the' +
    ' game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all,' +
    ' because the extension will listen for that key even if you are typing in chat.';
  $('#recordKeyTxt').prop('title', recordKeyTitle);
  $('#recordKeyCheckbox').prop('title', recordKeyTitle);

  let useSplatsTitle = 'This toggles whether to show splats or not.\n\nCheck the box if you' +
    ' want to show splats in the replay';
  $('#useSplatsTxt').prop('title', useSplatsTitle);
  $('#useSplatsCheckbox').prop('title', useSplatsTitle);
    
  let canvasWidthAndHeightTitle = 'Set the width and height of the .webm movie file. The default is 1280 by 800,' +
    ' but set it to 1280 by 720 for true 720p resolution';
  $('#canvasWidthInput').prop('title', canvasWidthAndHeightTitle);
  $('#canvasHeightInput').prop('title', canvasWidthAndHeightTitle);
}

// This is an easy method wrapper to dispatch events
function emit(event, data) {
  var e = new CustomEvent(event, {detail: data});
  window.dispatchEvent(e);
}

// function to format metadata to put into title text
function formatMetaDataTitle(replay) {
  let title = `Map: ${replay.info.map}\n`;
  title    += `FPS: ${replay.info.fps}\n`;
  title    += `Red Team:\n\t${replay.info.red_team.join('\n\t')}\n`;
  title    += `Blue Team:\n\t${replay.info.blue_team.join('\n\t')}\n`;
  return title;
}

// this function sets up a listener wrapper
function listen(event, listener) {
  window.addEventListener(event, function (e) {
    listener(e.detail);
  });
}

// set up listener for info from injected script
// if we receive data, send it along to the background script for storage
// Listens for recorded replay from recording script.
// info is an object with:
// @property {string} data  JSON formatted data
// @property {string?} name  optional name
listen('replay.save', function (info) {
  logger.info('Received recording, sending to background page.');
  chrome.runtime.sendMessage({
    method: 'replay.save_record',
    data: info.data,
    name: info.name
  }, (result) => {
    emit('replay.saved', {
      failed: result.failed
    });
  });
});

// Set options for the recording script.
function set_record_options(options) {
  Cookies.set('tpr_fps', options.fps, cookieDomain);
  Cookies.set('tpr_duration', options.duration, cookieDomain);
  Cookies.set('tpr_record', options.record, cookieDomain);
  Cookies.set('tpr_hotkey_enabled', options.hotkey_enabled, cookieDomain);
  Cookies.set('tpr_hotkey', options.hotkey, cookieDomain);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.options) {
    if (changes.options.newValue) {
      logger.info('Updating options for record script.');
      set_record_options(changes.options.newValue);
    }
  }
});

chrome.storage.promise.local.get('options').then((items) => {
  if (!items.options) {
    throw new Error('No options set.');
  }
  set_record_options(items.options);
});

function injectScript(path) {
  var script = document.createElement('script');
  script.setAttribute("type", "application/javascript");
  script.src = chrome.extension.getURL(path);
  script.onload = removeScript;
  (document.head || document.documentElement).appendChild(script);
}

function removeScript() {
  this.parentNode.removeChild(this);
}

function injectStyleSheet(path) {
  var link = document.createElement('link');
  link.setAttribute("rel", "stylesheet");
  link.href = chrome.extension.getURL(path);
  //script.onload = removeScript;
  (document.head || document.documentElement).appendChild(link);
}

// if we're on the main tagpro server screen, run the createReplayPageButton function
if ($('#userscript-home').length !== 0) {
  // make the body scrollable
  $('body')[0].style.overflowY = "scroll"
  // make the button
  createReplayPageButton();
  injectMenu().then(initMenu);
  // Include custom bootstrap.css scoped to #tpr-container
  injectStyleSheet("css/bootstrap.css");
  injectStyleSheet("css/menu.css");
} else if (url.port !== ''
        || url.pathname === '/game') {
  injectScript('js/recording.js');
}

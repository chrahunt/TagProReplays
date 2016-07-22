var $ = require('jquery');
var Storage = require('./storage');
var Textures = require('./textures');

// ============================================================================
// Settings.
// ============================================================================
// Set header.
var version = chrome.runtime.getManifest().version;
$('#settings-title').text(`TagPro Replays v${version}`);

// Set form titles.
var titles = [{ // fps
  elts: ["#fpsTxt", "#fpsInput"],
  text: 'Use this to set how many times per second data are recorded from the tagpro game.\n' +
'Higher fps will create smoother replays.\n\nIf you experience framerate drops during gameplay,' +
'or if your replays are sped up, try reducing this value.'
}, { // duration
  elts: ["#durationText", "#durationInput"],
  text: 'Use this to set how long the replay will be in seconds. Values greater than 60 ' +
'seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect' +
'replays that have already been recorded'
}, { // record
  elts: ["#recordTxt", "#recordCheckbox"],
  text: 'This controls whether the extension is capable of recording replays during a tagpro game.\n\n' +
'Uncheck to disable the extension.'
}, { // custom textures
  elts: ["#useTextureTxt", "#useTextureCheckbox"],
  text: 'This controls whether custom texture files will be used in rendered movies.\n\n' +
'Check to use textures, uncheck to use vanilla.\n\nThis only applies to rendered movies.'
}, { // record hotkey
  elts: ["#recordKeyTxt", "#recordKeyCheckbox"],
  text: 'This allows you to designate a key that acts exactly like clicking ' +
'the record button with the mouse.\n\nDon\'t use keys that have other uses in the ' +
'game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all, ' +
'because the extension will listen for that key even if you are typing in chat.'
}, { // splats
  elts: ["#useSplatsTxt", "#useSplatsCheckbox"],
  text: 'This toggles whether to show splats or not.\n\nCheck the box if you ' +
'want to show splats in the replay'
}, { // canvas size
  elts: ["#canvasWidthInput", "#canvasHeightInput"],
  text: 'Set the width and height of the .webm movie file. The default is 1280 by 800, ' +
'but set it to 1280 by 720 for true 720p resolution'
}];

titles.forEach((title) => {
  title.elts.forEach((elt) => {
    $(elt).prop("title", title.text);
  });
});

// Saving settings.
$('#saveSettingsButton').click(() => {
  chrome.storage.local.get("options", (items) => {
    var options;
    if (items.options) {
      options = items.options;
    } else {
      options = getDefaultOptions();
    }
    var inputs = {
      fps: $('#fpsInput')[0].value,
      duration: $('#durationInput')[0].value,
      record: $('#recordCheckbox')[0].checked,
      custom_textures: $('#useTextureCheckbox')[0].checked,
      shortcut_key_enabled: $('#recordKeyChooserInput').data('record'),
      shortcut_key: $('#recordKeyChooserInput').text(),
      splats: $('#useSplatsCheckbox')[0].checked,
      spin: $('#useSpinCheckbox')[0].checked,
      ui: $('#useClockAndScoreCheckbox')[0].checked,
      chat: $('#useChatCheckbox')[0].checked,
      canvas_width: Number($('#canvasWidthInput').val()),
      canvas_height: Number($('#canvasHeightInput').val())
    };

    if (!isNaN(inputs.fps) && inputs.fps !== "") {
      options.fps = +inputs.fps;
    }
    if (!isNaN(inputs.duration) && inputs.duration !== "") {
      options.duration = +inputs.duration;
    }
    options.record = inputs.record;
    options.custom_textures = inputs.custom_textures;
    options.shortcut_key_enabled = inputs.shortcut_key_enabled;
    if (inputs.shortcut_key !== 'None') {
      options.shortcut_key = inputs.shortcut_key.charCodeAt(0);
    }
    options.splats = inputs.splats;
    options.spin = inputs.spin;
    options.ui = inputs.ui;
    options.chat = inputs.chat;
    if (!isNaN(inputs.canvas_width) && inputs.canvas_width !== "") {
      options.canvas_width = inputs.canvas_width;
    }
    if (!isNaN(inputs.canvas_height) && inputs.canvas_height !== "") {
      options.canvas_height = inputs.canvas_height;
    }

    chrome.storage.local.set({
      options: options
    }, () => {
      $('#settingsContainer').modal('hide');
    });
  });
});

// Update settings.
function setSettings(options) {
  $('#fpsInput')[0].value = options.fps;
  $('#durationInput')[0].value = options.duration;
  if (options.shortcut_key_enabled) {
    $('#recordKeyChooserInput').text(
            String.fromCharCode(options.shortcut_key));
    $('#recordKeyChooserInput').data('record', true);
    $('#record-key-remove').show();
  } else {
    $('#recordKeyChooserInput').text('None');
    $('#recordKeyChooserInput').data('record', false);
    $('#record-key-remove').hide();
  }
  $('#useTextureCheckbox')[0].checked = options.custom_textures;
  $('#useSplatsCheckbox')[0].checked = options.splats;
  $('#recordCheckbox')[0].checked = options.record;
  $('#useSpinCheckbox')[0].checked = options.spin;
  $('#useClockAndScoreCheckbox')[0].checked = options.ui;
  $('#useChatCheckbox')[0].checked = options.chat;
  $('#canvasWidthInput').val(options.canvas_width);
  $('#canvasHeightInput').val(options.canvas_height);
}

// Set initial settings values.
Storage.get("options").then((items) => {
  if (items.options) {
    setSettings(items.options);
  }
});

// Update options fields if options are updated.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (changes.options && changes.options.newValue) {
    setSettings(changes.options.newValue);
  }
});

$('#textureSaveButton').click(() => {
  Textures.saveSettings();
  $('#textureContainer').modal('hide');
});

// Record key functionality.
function keyListener(e) {
  currentRecordKey = e.which;
  $('#recordKeyChooserInput').text(String.fromCharCode(e.which));
  $('#recordKeyChooserInput').data('record', true);
  $('#record-key-remove').show();
  stopInputting();
}

function stopInputting() {
  $('#record-key-input-container').removeClass('focused');
  $(document).off("keypress", keyListener);
}

$('#record-key-input-container').click(function (e) {
  $(this).addClass('focused');
  $(document).on("keypress", keyListener);
});

$('#record-key-remove').click((e) => {
  e.stopPropagation();
  $('#recordKeyChooserInput').data('record', false);
  $('#recordKeyChooserInput').text('None');
  $('#record-key-remove').hide();
  return false;
});

$(document).click((e) => {
  if (!$(e.target).parents()
                  .andSelf().is('#record-key-input-container')) {
    stopInputting();
  }
});
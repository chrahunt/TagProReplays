var EventEmitter = require('events').EventEmitter;
var moment = require('moment');
var page = require('page');
var Mustache = require('mustache');
var util = require('util');
var $ = require('jquery');
require('jquery.actual');
require('jquery-ui');
require('bootstrap');
require('bootstrap-material-design');
require('snackbarjs');

var sanitize = require('sanitize-filename');
var saveAs = require('file-saver');

var Data = require('./data');
var Messaging = require('./messaging');
var NotificationList = require('./notification-list');
var Overlay = require('./overlay');
var Progress = require('./progress');
var Replays = require('./replays');
var Renders = require('./renders');
var Status = require('./status');
var Table = require('./card-table');
var Templates = require('./templates');
var Viewer = require('./viewer');
var Constraints = require('./constraints');
var Upload = require('./upload');
var Util = require('./util');

var logger = require('./logger')('menu');

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

var viewer = new Viewer();
var progress = new Progress('progress-dialog');

// UI-specific code
// Handling multiple modals
// http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
$(() => {
  $('.modal').on('hidden.bs.modal', function () {
    $(this).removeClass('fv-modal-stack');
    $('#tpr-container').data('open_modals',
            $('#tpr-container').data('open_modals') - 1);
  });

  $('.modal').on('shown.bs.modal', (e) => {
    // keep track of the number of open modals
    if (typeof($('#tpr-container').data('open_modals')) == 'undefined') {
      $('#tpr-container').data('open_modals', 0);
    }

    // if the z-index of this modal has been set, ignore.
    if ($(this).hasClass('fv-modal-stack')) {
      return;
    }

    $(this).addClass('fv-modal-stack');

    $('#tpr-container').data('open_modals',
            $('#tpr-container').data('open_modals') + 1);

    $(this).css('z-index',
            1040 + (10 * $('#tpr-container').data('open_modals')));

    $('.modal-backdrop').not('.fv-modal-stack').css(
            'z-index',
            1039 + (10 * $('#tpr-container').data('open_modals'))
        );

    $('.modal-backdrop').not('fv-modal-stack')
            .addClass('fv-modal-stack');
  });
});

// ============================================================================
// Routing
// ============================================================================

page('/', () => {
  logger.info("Page: main page.");
  page('/replays');
});

page('/replays', () => {
  logger.info("Page: replays.");
  cardSwitch("replays");
});

page('/renders', () => {
  logger.info("Page: renders.");
  cardSwitch("renders");
});

page('/failed', () => {
  logger.info("Page: failed.");
  cardSwitch("failed");
});

page('/settings', () => {
  logger.info("Page: settings.");
    //togglePanel(".nav-failed", "#failed-replays");
});

page('*', () => {
  logger.warn("Page: not found!");
  page('/');
});

page.base("/main.html#!");

page.start();

// Takes selector for nav item and panel.
function cardSwitch(name) {
  var nav_class = `.nav-${name}`;
  $(`.nav li:not(${nav_class})`).removeClass("active");
  $(nav_class).addClass("active");
  var card_id = `#${name}`;
  $(card_id).show();
  $(`.card:not(${card_id})`).hide();
}

// ============================================================================
// Replay import.
// ============================================================================
// TODO: pause table update while importing.
// TODO: disable upload when full.
var upload = new Upload("replay-import");

upload.on('disabled', () => {
  upload.$.css({
    color: "#aaa",
    cursor: "default"
  });
  upload.$.attr("title", "delete some replays first");
});

upload.on('enabled', () => {
  upload.$.css({
    color: "",
    cursor: ""
  });
  upload.$.attr("title", "");
});

// adheres to activity spec but has view-specific information
// e.g. description.
function ImportActivityView(activity) {
  EventEmitter.call(this);
  this.message = Templates.importing.start;
  this.cancellable = true;
  this.cancel = activity.cancel.bind(activity);
  this.cancel_message = "cancel";
  this._activity = activity;
  this._errors = [];
  this.progress = {
    total: 0,
    progress: 0
  };
  this._activity.on('update', () => {
    this.progress.total = this._activity.progress.total;
    this.progress.progress = this._activity.progress.current;
  });

  // Track upload errors.
  this._activity.on('error', (err) => {
    this._errors.push(err);
  });

  this._activity.on('done', () => {
    var errors = this._errors.length !== 0;
    var text = "";
    if (errors) {
      var errs = this._errors
                     .map((err) => `${err.name}-${err.reason}`)
                     .join("\n");
      var url = Util.textToDataUrl(errs);
      text = Mustache.render(
        Templates.replay_list.import.error_result, {
          url: url
        });
    }
    if (this._activity.state == "fulfilled") {
      if (errors) {
        text = `Replay import complete.\n${text}`;
        this.message = text;
      } else {
        progress.close();
        return;
      }
    } else if (this._activity.state == "rejected") {
      if (errors) {
        text = `Replay import cancelled.\n${text}`;
        this.message = text;
      } else {
        progress.close();
        return;
      }
    } else {
      logger.error("Error, activity was done but not fulfilled.");
    }
  });
}
util.inherits(ImportActivityView, EventEmitter);

upload.on('files', (files) => {
  Replays.import(files)
  .then((activity) => {
    var view = new ImportActivityView(activity);
    progress.open(view);
  }).catch((err) => {
    // Errors that we can know about before upload.
    if (err.name == "db_full") {
      alert(Templates.replay_list.full);
    } else {
      logger.error("Uncaught error in import.");
      logger.error(err);
    }
  });
});

upload.on('files', () => {
  logger.info("hi");
});

// ============================================================================
// Upgrade behavior.
// ============================================================================

// Display upgrading page with progress.
Status.on("upgrading", () => {
  overlay.set({
    title: "Upgrading Database",
    description: "The database is being upgraded, please do not close Chrome while this is being carried out.",
    progress: true,
    message: "Initializing..."
  });
  overlay.show();
});

// Display upgrading result page.
Status.on("upgrading->active", () => {
  overlay.update({
    description: "The database has been upgraded!",
    actions: [{
      text: "dismiss",
      action: function () {
        overlay.hide();
      }
    }]
  });
});

// TODO: to template
function getContact(error, subject) {
  var man = chrome.runtime.getManifest();
  var ver = man.hasOwnProperty("version_name") ? man.version_name
                                               : man.version;
  var github = "<a href=\"https://github.com/chrahunt/TagProReplays/issues\">here</a>";
  var reddit = "<a href=\"https://www.reddit.com/message/compose?to=snaps_&subject=" +
        encodeURIComponent(subject + " (" + ver + ")") + "\">here</a>";
  var contact = error + ", please report the error " + github + " and include the version number " + ver + " or send a message " +
        reddit + " with any details and for further instruction.";
  return contact;
}

// Display error overlay.
// TODO: Transition to new state.
Status.on("error.upgrade", () => {
  overlay.set({
    title: "Database Upgrade Error",
    progress: false,
    message: getContact("Error upgrading database", "TPR Upgrade Error")
  });
    // In case it isn't showing already.
  overlay.show();
});

Messaging.listen("upgradeProgress", (message) => {
  overlay.update({
    progress: message.progress / message.total,
    message: `Converted replay ${message.progress} of ${message.total}`
  });
});

// Display error overlay.
// TODO: Transition to new state.
Status.on("error.db", () => {
  overlay.set({
    title: "Database Error",
    description: getContact("A database error was encountered, please try to enable/disable the extension and see if the issue persists. If it continues", "TPR Database Error"),
    progress: false
  });
    // In case it isn't showing already.
  overlay.show();
});

// ============================================================================
// Replay management.
// ============================================================================

var replay_table = new Table({
  id: "replay-table",
    // Card header.
  header: {
    selector: "#replays .card-header",
    singular: "replay",
    plural: "replays",
    title: "Replays"
  },
  ajax: function (data) {
    return Replays.query(data).then((result) => {
      var list = result.data.map((replay) => {
        return {
          name: replay.name,
          date: moment(replay.dateRecorded),
          duration: moment.utc(replay.duration)
                                    .format('mm:ss'),
          rendered: replay.rendered,
          id: replay.id,
          rendering: replay.rendering,
          replay: replay
        };
      });
            // TODO: Move this.
      $(".nav-home .badge").text(result.total);
      return {
        data: list,
        total: result.total
      };
    }).catch((err) => {
      logger.error("Could not retrieve list: %O", err);
            // Rethrow.
      throw err;
    });
  },
  columns: [
    { // Checkbox.
      type: "checkbox",
      data: "rendering",
      render: function (data, type, row, meta) {
        return data ? '<span class="glyphicon glyphicon-lock" title="This replay is rendering"></span>'
                            : Templates.table.checkbox;
      }
    },
    { // Editable name.
      type: "editable",
      className: "row-name fixed-cell",
      data: "name",
      // Callback for editable field.
      callback: (id, text) => {
        logger.info(`Renaming replay ${id} to ${text}.`);
        if (text === "") {
          return Promise.reject(new Error("Name must not be empty."));
        } else {
          return Replays.get(id).rename(text);
        }
      },
      // TODO: actually implement.
      enabled: function (data, type, row, meta) {
        return !row.rendering;
      }
    },
    { // Rendered.
      className: "data-cell",
      data: "rendered",
      orderable: false,
      render: function (data) {
        return data ? '<i class="material-icons">done</i>'
                    : '';
      }
    },
    { // Duration.
      className: "data-cell",
      data: "duration"
    },
    { // Date recorded.
      className: "data-cell",
      data: "date",
      render: function (date) {
        return date.calendar();
      }
    },
    { // Row actions.
      type: "actions",
      data: "rendered",
      orderable: false,
      actions: [{
        name: "download",
        icon: "file_download",
        title: (data) => {
          return data.rendered ? "download movie"
                               : "render replay first!"
        },
        enabled: (data) => data.rendered,
        callback: (id) => {
          logger.info(`Requesting movie download for replay ${id}.`);
          return Renders.get(id).download().then((data) => {
            saveAs(data.data, data.name);
          }).catch((err) => {
            logger.error("Error retrieving movie for download: ", err);
          });
        }
      }, {
        name: "preview",
        icon: "play_arrow",
        title: "preview",
        enabled: true,
        callback: (id) => {
          logger.info("Starting preview.");
          // TODO: Some kind of transition.
          return viewer.preview(id);
        }
      }]
    }
  ],
  order: [[1, 'asc']],
  // Set title text on row with additional replay information.
  rowCallback: function (row, data) {
    var replay = data.replay;
    var title = '';
    title += "Map: " + replay.mapName + "\n";
    title += "FPS: " + replay.fps + "\n";
    var red = [];
    var blue = [];
    $.each(replay.players, (id, player) => {
      var name = id === replay.player ? player.name + " (*)"
                                      : player.name;
      if (player.team === 1) {
        red.push(name);
      } else {
        blue.push(name);
      }
    });
    title += replay.teamNames[1] + ":\n\t" + red.join('\n\t') + "\n";
    title += replay.teamNames[2] + ":\n\t" + blue.join('\n\t') + "\n";
    row.title = title;
  }
});

////////////////////////////
// Table header controls. //
////////////////////////////
// Rendering replays.
$('#replays .card-header .actions .render').click(() => {
  var ids = replay_table.selected();
  replay_table.deselect(ids);
  Replays.select(ids).render().catch((err) => {
    // TODO: Handle error.
  });
});

// Deleting replays.
$('#replays .card-header .actions .delete').click(() => {
  var ids = replay_table.selected();
  logger.info("Deleting replays.");
  replay_table.deselect(ids);
  Replays.select(ids).remove().then((task) => {
    // TODO: create undo panel and associate undo with it.
    $.snackbar({
      content: "Replays deleted",
      timeout: 5000,
      onClose: () => {
        task.complete().catch((err) => {
          // TODO: Dialog error.
        });
      },
      action_message: "undo",
      action_function: () => {
        task.undo().then(() => {
          // TODO: Reload table.
        }).catch((err) => {
          // TODO: Dialog error.
        });
      }
    });
  }).catch((err) => {
    // internal error
    // empty selection.
  });
});

// Downloading raw replays.
$('#replays .card-header .actions .download-raw').click(() => {
  var ids = replay_table.selected();
  /*Replays.select(ids).download().then((progress) => {
    // TODO: hook into progress for UI update.
  }).catch((err) => {

  });*/
  // set up download progress dialog.
  $("#progress").modal('show');
  // dismissable
});

/////////////////////////////
// Downloading raw replays //
/////////////////////////////
var download = {
  error: null
};

Messaging.listen("zipProgress", (message) => {
  overlay.update({
    progress: message.current / message.total,
    message: `Adding replays...`
  });
});

Messaging.listen("intermediateZipDownload", () => {
  overlay.update({
    message: "Zip file reached capacity, downloading..."
  });
});

Messaging.listen("finalZipDownload", () => {
  overlay.update({
    message: "Downloading final zip file..."
  });
});

Messaging.listen("downloadError", (message) => {
  download.error = message.reason;
});

// Display json downloading message.
Status.on("json_downloading", () => {
  overlay.set({
    title: 'Downloading Raw Data',
    description: 'Zip files are being generated containing your raw data.',
    message: 'Initializing zip file generation...',
    progress: true
  });
  overlay.show();
});

// Display finish message.
Status.on("json_downloading->active", () => {
  var error = download.error;
  download.error = null;
  if (error) {
        // Change overlay to display error.
        // add dismiss
    overlay.set({
      description: `There was an error downloading your replays: ${error}.`,
      actions: [{
        text: "dismiss",
        action: function () {
          overlay.hide();
        }
      }]
    });
  } else {
    overlay.hide();
  }
});

//////////////////////////////////////
// Dynamic CSS and content updates. //
//////////////////////////////////////
// Re-set menu dimensions on window resize.
$(window).resize(() => {
  replay_table.recalcMaxHeight();
});

var replay_notification_list = new NotificationList("#replays .header");
replay_notification_list.addListener(() => {
  replay_table.recalcMaxHeight();
});

// Listen for updates.
Messaging.listen(["replayUpdated", "replaysUpdated", "renderUpdated", "rendersUpdated"],
function () {
    // Don't update if importing.
  if (!paused) {
    replay_table.reload();
    updateFullNotifications();
  }
});

var notifications = {
  full: null,
  warning: null
};

function removeNotification(name) {
  var id = notifications[name];
  if (id && replay_notification_list.exists(id)) {
    replay_notification_list.remove(id);
  }
}

function updateFullNotifications() {
  Messaging.send("getNumReplays", function (info) {
    if (info.replays >= Constraints.max_replays_in_database) {
      if (!replay_notification_list.exists(notifications.full)) {
        notifications.full = replay_notification_list.add("The replay database is full " +
                    "and some actions are disabled. Download and delete replays " +
                    "to free up space!", "danger");
      }
      removeNotification("warning");
    } else if (info.replays > Constraints.max_replays_in_database * 0.8) {
      if (!replay_notification_list.exists(notifications.warning)) {
        notifications.warning = replay_notification_list.add("The replay database is getting full, download and delete replays to prevent issues!", "warning", true);
      }
      removeNotification("full");

    } else {
      if (replay_notification_list.exists(notifications.full)) {
        removeNotification("full");
      }
      if (replay_notification_list.exists(notifications.warning)) {
        removeNotification("warning");
      }
    }
  });
}

// Database size warnings / information.
Status.once("active", function () {
  updateFullNotifications();
});

// ============================================================================
// Failed replay card.
// ============================================================================

// Init table.
var failed_replay_table = new Table({
  id: "failed-replay-table",
  header: {
    selector: "#failed-replays .card-header",
    singular: "failed replay",
    plural: "failed replays",
    title: "Failed Replays"
  },
  ajax: function (data) {
    var args = {
      length: data.length,
      start: data.start
    };
        // TODO: Transition to promise.
    return Promise.resolve({
      data: [],
      total: 0
    });
    Messaging.send("getFailedReplayList", args, (response) => {
      var list = response.data.map((info) => {
        return {
          id: info.id,
          name: info.name
        };
      });
      if (response.total === 0) {
                // Remove table.
        self.failed_replay_table.table.destroy(true);
      } else {
        $(".nav-failed .badge").text(response.total);
        callback({
          data: list,
          total: response.tota
        });
      }
    });
  },
  columns: [
    { // checkbox
      type: "checkbox",
      data: null
    },
    { // id, hidden
      data: "id",
      visible: false
    },
    { // name
      className: "fixed-cell",
      data: "name",
      orderable: false
    }
  ],
    // Order by id.
  order: [[1, 'asc']]
});

// Headers should automatically have the associated table.
// Download listener.
$('#failed-replays .card-header .actions .download').click(function () {
  var ids = failed_replay_table.selected();
  if (ids.length > 0) {
    logger.info('Requesting raw json download for ' + ids + '.');
    Messaging.send("downloadFailedReplays", {
      ids: ids
    }, (response) => {
      if (response.failed) {
        alert("Failed replay download failed: " + response.reason);
      }
    });
  }
});

$('#failed-replays .card-header .actions .delete').click(() => {
  var ids = failed_replay_table.selected();
  failed_replay_table.deselect(ids);

  if (ids.length > 0) {
    if (confirm('Are you sure you want to delete these failed replays? This cannot be undone.')) {
      logger.info(`Requesting deletion of ${ids}`);
      Messaging.send("deleteFailedReplays", {
        ids: ids
      });
    }
  }
});

function update() {
  failed_replay_table.reload();
}
Status.on("active", update);

// Clean up after table gets destroyed.
failed_replay_table.table.on("destroy", () => {
  Status.removeListener("active", update);
  if ($(".nav-failed").hasClass("active")) {
    $(".nav-home").click();
  }
    // Remove nav.
  $(".nav-failed").remove();
});

Messaging.listen("failedReplaysUpdated", () => {
  failed_replay_table.reload();
});

// Download-relevant listeners.
var download = {
  error: null
};

Messaging.listen("failed.zipProgress", (message) => {
  overlay.update({
    progress: message.current / message.total,
    message: "Adding failed replay " + message.current + " of " + message.total + "."
  });
});

Messaging.listen("failed.intermediateZipDownload", () => {
  overlay.update({
    message: "Zip file reached capacity, downloading..."
  });
});

Messaging.listen("failed.finalZipDownload", () => {
  overlay.update({
    message: "Downloading final zip file..."
  });
});

var downloadError = false;
Messaging.listen("failed.downloadError", (message) => {
  download.error = message.reason;
});

// Display json downloading message.
// TODO: new states for this.
Status.on("failed.json_downloading", () => {
  overlay.set({
    title: 'Downloading Raw Data',
    description: 'Zip files are being generated containing the data from your failed replays.',
    message: 'Initializing zip file generation...',
    progress: true
  });
  overlay.show();
});

// Display finish message.
// TODO: new states for this.
Status.on("failed.json_downloading->idle", () => {
  var error = download.error;
  download.error = null;
  if (error) {
    var reason = error;
        // Change overlay to display error.
        // add dismiss
    overlay.set({
      description: "There was an error downloading your replays: " + error + ".",
      message: "",
      actions: [{
        text: "dismiss",
        action: function () {
          overlay.hide();
        }
      }]
    });
  } else {
    overlay.set({
      description: "Your failed replays will be downloading shortly (depending on file size). " +
                "There is either an error with the replay itself or something unexpected was encountered. " +
                "If you send me a message through one of the options on the Help menu, we can get it figured out!",
      message: "",
      actions: [{
        text: "dismiss",
        action: function () {
          overlay.hide();
        }
      }]
    });
  }
});

// ============================================================================
// Render list card.
// ============================================================================
var render_table = new Table({
  id: "render-table",
  header: {
    selector: "#rendering .card-header",
    singular: "task",
    plural: "tasks",
    title: "Render Tasks"
  },
  ajax: function (data, callback) {
    var args = {
      length: data.length,
      dir: data.dir,
      start: data.start
    };
        // TODO: Actual promise implementation.
    return Promise.resolve({
      data: [],
      total: 0
    });

    Messaging.send("getRenderList", args, (response) => {
      var list = response.data.map((task) => {
        return {
          name: task.data.name,
          date: moment(task.data.date),
          id: task.replay_id,
          DT_RowData: {
            id: task.replay_id
          },
          DT_RowId: "render-" + task.replay_id
        };
      });
      $(".nav-render .badge").text(response.total);
      callback({
        data: list,
        draw: data.draw,
        recordsTotal: response.total,
        recordsFiltered: response.filtered
      });
    });
  },
  columns: [
    { // Checkbox.
      type: "checkbox",
      data: null,
    },
    { // id, hidden
      data: "id",
      visible: false
    },
    { // name
      className: "fixed-cell",
      data: "name",
      orderable: false
    },
    { // date recorded
      className: "data-cell",
      data: "date",
      orderable: false,
      render: function (date) { return date.calendar(); }
    },
    { // status
      className: "data-cell",
      data: null,
      defaultContent: '<span class="render-status">Queued</span>',
      orderable: false
    },
    { // Progress indicator.
      className: "data-cell",
      data: null,
      defaultContent: '<div class="render-progress"></div>',
      orderable: false
    },
    { // Action buttons.
      data: null,
      defaultContent: '<div class="actions"><div class="cancel-render"><i class="material-icons">cancel</i></div></div>',
      orderable: false
    }
  ],
  order: [[1, 'asc']]
});

// Single cancellation buttons.
$("#render-table tbody").on("click", ".cancel-render", function () {
  var id = $(this).closest('tr').data("id");
  render_table.deselect(id);
  logger.info(`Requesting render cancellation for replay ${id}.`);
  Messaging.send("cancelRender", {
    id: id
  });
});

// Multi-cancellation buttons.
$('#rendering .card-header .actions .cancel').click(() => {
  var ids = render_table.selected();
  render_table.deselect(ids);
  if (ids.length > 0) {
    Messaging.send("cancelRenders", {
      ids: ids
    });
  }
});

Status.on("active", () => {
  render_table.reload();
});

/**
 * Notification that a replay is in the process of being rendered.
 * Create/update progress bar and ensure editing functionality for
 * the specific replay is disabled.
 */
Messaging.listen("replayRenderProgress", (message, sender) => {
  var id = message.id;
  logger.debug(`Received notice that ${id} is being rendered.`);
    // Check that render row exists.
  var row = $(`#render-${id}`);
    // TODO: Better progress bar.
    // TODO: Estimated time remaining.
  if (row.length === 1) {
    var rendering = row.data("rendering");
    if (!rendering) {
      row.find(".render-status").text("Rendering...");
      row.find(".render-progress").html("<div class='progress'>" +
                "<div class='progress-bar'></div></div>");
      row.data("rendering", true);
    }
    $(`#render-${id} .progress-bar`).css("width", (message.progress * 100) + "%");
  } // else render table not yet set up.
});

Messaging.listen(["renderUpdated", "rendersUpdated"], () => {
  render_table.reload();
});

// Force status to call listeners set in other functions.
Status.force();

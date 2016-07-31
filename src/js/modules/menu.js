var EventEmitter = require('events').EventEmitter;
var moment = require('moment');
var page = require('page');
var Mustache = require('mustache');
var saveAs = require('file-saver');
var util = require('util');
var $ = require('jquery');
require('jquery.actual');
require('jquery-ui');
require('bootstrap');
require('bootstrap-material-design');

var CardTable = require('./card-table');
var Constraints = require('./constraints');
var Dialog = require('./dialog');
var FailedReplays = require('./failed-replays');
var Messaging = require('./messaging');
var NotificationList = require('./notification-list');
var Progress = require('./progress');
var Replays = require('./replays');
var Renders = require('./renders');
var Status = require('./status');
var Templates = require('./templates');
var Toast = require('./toast');
var Viewer = require('./viewer');
var Upload = require('./upload');
var Util = require('./util');

var logger = require('./logger')('menu');

logger.info('Starting Menu');

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
var dialog = new Dialog('dialog');

// Testing.

$('#example-error-test').click(() => {
  logger.info('Error test clicked.');
  Messaging.send('test.error').then((err, result) => {
    logger.info('Error test returned.');
    if (err) {
      logger.info(err);
    }
  });
})
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

/*page('/settings', () => {
  logger.info("Page: settings.");
  //togglePanel(".nav-failed", "#failed-replays");
});*/

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
    current: 0
  };
  this._activity.on('update', () => {
    logger.trace('Received import update.');
    this.progress.total = this._activity.progress.total;
    this.progress.current = this._activity.progress.current;
    this.emit('update');
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
      if (this._activity.state == "fulfilled") {
        text = `Replay import complete.\n${text}`;
      } else {
        text = `Replay import cancelled.\n${text}`;
      }
      this.message = text;
      this.cancel_message = "close";
      this.emit('update');
    } else {
      this.emit('done');
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
      dialog.open({
        type: "warning",
        title: 'Database full',
        message: Templates.replay_list.full
      });
    } else {
      dialog.open({
        type: "error",
        title: "Uncaught import error",
        error: err
      });
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

var replay_table = new CardTable({
  id: "replays",
  // Card header.
  header: {
    language: {
      title: "Replays",
      singular: "replay",
      plural: "replays"
    },
    actions: [{
      name: "render",
      icon: 'movie_creation',
      title: 'render selected',
      callback: (ids) => {
        logger.info("Rendering replays.");
        Replays.select(ids).render().catch((err) => {
          dialog.open({
            type: 'error',
            message: 'Error starting rendering',
            error: err
          });
        });
      }
    }, {
      name: "delete",
      icon: 'delete',
      title: 'delete selected',
      callback: (ids) => {
        logger.info("Deleting replays.");
        Replays.select(ids).remove().then((task) => {
          replay_table.reload();
          var timeout = 10000;
          var clear = setTimeout(() => {
            task.do().catch((err) => {
              dialog.open({
                type: 'error',
                title: 'Error removing replays',
                error: err
              })
            })
          }, timeout);
          var toast = new Toast({
            duration: timeout / 2,
            id: 'toast',
            text: 'Replays deleted',
            action: 'undo',
            action_fn: () => {
              clearTimeout(clear);
              task.undo().then(() => {
                replay_table.reload();
              }).catch((err) => {
                dialog.open({
                  type: 'error',
                  message: 'Error restoring replays',
                  error: err
                });
              });
            }
          });
        }).catch((err) => {
          dialog.open({
            type: 'error',
            message: 'Error deleting replays',
            error: err
          });
        });
      }
    }, {
      name: "download",
      icon: 'file_download',
      title: 'download selected',
      callback: (ids) => {
        Replays.select(ids).download().then((activity) => {
          progress.open(activity);
        }).catch((err) => {
          dialog.open({
            type: "error",
            message: "Error downloading replays",
            error: err
          });
        });
      }
    }]
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
      return {
        data: list,
        total: result.total
      };
    }).catch((err) => {
      logger.error("Could not retrieve list: ", err);
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

Replays.on('update', () => {
  // Don't update if importing.
  replay_table.reload();
  updateFullNotifications();
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
var failed_replay_table = new CardTable({
  id: "failed",
  header: {
    language: {
      singular: "failed replay",
      plural: "failed replays",
      title: "Failed Replays"
    },
    actions: [{
      name: 'download',
      icon: 'file_download',
      title: 'download selected',
      callback: (ids) => {
        logger.info(`Requesting raw json download for ${ids}`);
        FailedReplays.select(ids).download().then((activity) => {
          progress.open(activity);
        }).catch((err) => {
          dialog.open({
            type: 'error',
            title: 'Error downloading failed replays',
            error: err
          });
        });
      }
    }, {
      name: 'delete',
      icon: 'delete',
      title: 'delete selected',
      callback: (ids) => {
        if (confirm('Are you sure you want to delete these failed replays? This cannot be undone.')) {
          logger.info(`Requesting deletion of ${ids}`);
          Messaging.send("deleteFailedReplays", {
            ids: ids
          });
        }
      }
    }]
  },
  ajax: function (data) {
    var args = {
      length: data.length,
      start: data.start
    };

    return FailedReplays.query(args).then((response) => {
      var list = response.data.map((info) => {
        return {
          id: info.id,
          name: info.name
        };
      });
      if (response.total === 0) {
        // Remove table.
        failed_replay_table.table.destroy(true);
      } else {
        return {
          data: list,
          total: response.tota
        };
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

// ============================================================================
// Render list card.
// ============================================================================
var render_table = new CardTable({
  id: "renders",
  header: {
    language: {
      singular: "task",
      plural: "tasks",
      title: "Render Tasks"
    },
    actions: [{
      name: 'cancel',
      icon: 'cancel',
      callback: (ids) => {
        Renders.select(ids).cancel().catch((err) => {
          dialog.open({
            type: 'error',
            title: 'Error cancelling renders',
            error: err
          });
        });
      }
    }]
  },
  ajax: function (data) {
    var args = {
      length: data.length,
      dir: data.dir,
      start: data.start
    };
    return Renders.query(args).then((result) => {
      var list = result.data.map((task) => {
        return {
          name: task.data.name,
          date: moment(task.data.date),
          id: task.replay_id
        };
      });
      return {
        data: list,
        total: result.total
      };
    }).catch((err) => {
      dialog.open({
        type: 'error',
        title: 'Error retrieving render list',
        error: err
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
      type: "actions",
      actions: [{
        name: 'cancel',
        icon: 'cancel',
        title: '',
        enabled: true,
        callback: (id) => {
          logger.info(`Requesting render cancellation for replay ${id}.`);
          Renders.select(id).cancel().catch((err) => {
            dialog.open({
              type: 'error',
              title: 'Error cancelling render',
              error: err
            });
          })
        }
      }]
    }
  ],
  order: [[1, 'asc']]
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

Renders.on('update', () => {
  render_table.reload();
});

// Force status to call listeners set in other functions.
Status.force();

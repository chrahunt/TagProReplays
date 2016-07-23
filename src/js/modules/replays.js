var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Constraints = require('./constraints');
var Data = require('./data');
var FileListStream = require('./html5-filelist-stream');
var Messaging = require('./messaging');
var ReplayImportStream = require('./replay-import-stream');

var logger = require('./logger')('replays');

// TODO: prevent upgrade occurring on foreground page.
Data.init().then(() => {
  logger.info("Data initialized.");
});

function Replays() {
  EventEmitter.call(this);
  // Listen for db changes
  // - emit full
  // - emit
}
util.inherits(Replays, EventEmitter);

// select multiple replays.
Replays.prototype.select = function (ids) {
  if (typeof ids === "string") {
    ids = [ids];
  }
  // Throw can't find
  // Else return selection which can have actions done.
  return new Selection(ids);
};

// select 1 replay.
Replays.prototype.get = function (id) {
  return new Replay(id);
};

// ============================================================================
// info
// ============================================================================
// replays + failed
// public api, only active, unmarked
Replays.prototype.count = function () {
  logger.info("Replays#count");
};

Replays.prototype.query = function (args) {
  logger.info("Replays#query");
  return Data.getReplayInfoList(args).then((data) => {
    logger.debug("Query returned.");
    return {
      data: data[1],
      total: data[0]
    };
  });
};

module.exports = new Replays();
// ============================================================================
// events
// ============================================================================
// only update when not importing.
//this.emit("update");
//this.emit("full");

function Selection(ids) {
  this.ids = ids;
}

// ============================================================================
// activities
// ============================================================================
// replays
Selection.prototype.render = function () {
  // Check if rendering/rendered
  // return progress
  return new Promise((resolve, reject) => {
    Messaging.send("renderReplays", {
      ids: this.ids
    }, function (response) {
      // TODO: reject if bad.
      // empty
      // other error
      // already rendering.
      resolve();
    });
  });
};

// replays + failed
// TODO: undo-able.
Selection.prototype.remove = function () {
  logger.info("Selection#remove");
  // Cancel any in-progress renders.
  return Messaging.send("cancelRenders", {
    ids: this.ids
  }).then((err) => {
    // TODO: proper API between background page and us.
    if (err) throw err;
  }).then(() => {
    return Data.deleteReplays(this.ids).catch((err) => {
      logger.error("Error deleting replays: %O", err);
      throw err;
    });
  }).then(() => {
    // Future interface for undo.
    return new DestructiveTask(
      () => Promise.resolve(),
      () => Promise.reject());
  });
};

// replays + failed
// remove x oldest marked items
Selection.prototype._clean = function () {

};

// replays
Replays.prototype.add = function () {

  // check constraints
  // clean up removed
  // add
};

/**
 * Imports a number of replays.
 * returns a promise that resolves to an
 * Activity.
 */
Replays.prototype.import = function (files) {
  logger.info("Replays#import");
  var num_files = files.length;
  return Data.getDatabaseInfo().then((info) => {
    // Error if it would fill up the database.
    if (info.replays + num_files > Constraints.max_replays_in_database) {
      var e = new Error("");
      e.name = "db_full";
      throw e;
    }
  }).then(() => {
    logger.info(`Importing ${files.length} replays.`);
    var activity = new Activity({
      cancellable: true
    });

    var fls = new FileListStream(files, {
      max_file_size: Constraints.max_replay_upload_size
    });
    fls.on('error', (err) => {
      // File size error.
      activity.emit('error', err);
    });
    fls.on("end", () => {
      // Don't complete activity, wait for importstream.
      logger.debug("File list stream ended.");
    });

    var send = ReplayImportStream({
      highWaterMark: Constraints.max_replay_upload_size * 2
    });
    send.on('error', (err) => {
      // Other errors: validation, conversion, saving.
      activity.emit('error', err);
    });
    send.on('finish', () => {
      logger.info("Replay import finished");
      activity.complete();
    });
    var total = files.length;
    var current = 0;
    send.on('progress', () => {
      activity.update(total, current);
    });

    fls.pipe(send);

    activity.on("cancelled", () => {
      fls.unpipe();
      send.stop();
    });

    return activity;
  });
};

// replays + failed
Selection.prototype.download = function () {
  logger.info("Selection#download");
  return new Promise((resolve, reject) => {
    // TODO: need an a progress id.
    Messaging.send("downloadReplays", { ids: this.ids }, (response) => {
      if (response.failed) {
        reject(response.reason);
      } else {
        resolve(new Progress());
      }
    });
  });
  // return progress
};

// ============================================================================
// Single replay
// ============================================================================
function Replay(id) {
  this.id = id;
}

Replay.prototype.rename = function (new_name) {
  logger.info("Replay#rename");
  // validate name is nonempty?
  //
  return Data.renameReplay(this.id, new_name);
};

Replay.prototype.data = function () {
  return Data.getReplay(this.id);
};

Replay.prototype.crop = function () {

};

Replay.prototype.save = function () {
  // Check for render, remove if rendered.
};

Replay.prototype.saveAs = function (name) {

};

//////////
// ongoing action
//////////
/**
 * Activity represents an ongoing action.
 * Events:
 * - update - some change occurred
 * Properties:
 * - state - fulfilled, rejected, pending
 * - substate - activity-specific value, can be used as a map to some
 *   display text.
 * - cancellable - boolean
 * - cancel - if above is true, cancels the activity.
 * - progress
 * -- total - 0 if indetermindate
 * -- progress
 * -- known - i.e. determinate
 */
function Activity(spec) {
  if (typeof spec == "undefined") spec = {};
  EventEmitter.call(this);
  this.cancellable = spec.cancellable;
  this.state = "pending";
  this.progress = {
    total: 0,
    current: 0
  };
}
util.inherits(Activity, EventEmitter);

/**
 * Fires and indicates whether activity was cancelled.
 * @event Activity#done
 * @type {boolean}
 */
Activity.prototype.cancel = function () {
  this.state = "rejected";
  this.emit("done");
};

/**
 * Update activity progress.
 * @fires Activity#update
 */
Activity.prototype.update = function (total, current) {
  this.progress.total = total;
  this.progress.current = current;
  this.emit("update");
};

/**
 * Indicate activity completion.
 * @fires Activity#done
 */
Activity.prototype.complete = function () {
  this.state = "fulfilled";
  this.emit("done");
};

function Progress() {
  // inherits eventemitter
  // events:
  // - done
  // - progress
  // - err

}

// Wrap a destructive task.
function DestructiveTask(_do, undo) {
  this._do = _do;
  this._undo = undo;
}

// Returns promise.
DestructiveTask.prototype.undo = function () {
  logger.info("Undoing.");
  return this._undo();
};

// Returns promise.
DestructiveTask.prototype.complete = function () {
  logger.info("Doing");
  return this._do();
};

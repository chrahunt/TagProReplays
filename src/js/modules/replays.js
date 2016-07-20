var util = require('util');
var EventEmitter = require('events').EventEmitter;

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

Replays.prototype.import = function (files) {
  // Take files
  // return progress
  // error if it would put us over.
  //
  var file_summary = {
    number: files.length,
    size: 0
  };
  for (var i = 0; i < files.length; i++) {
    file_summary.size += files[i].size;
  }
  var mb = 25;
  var sizeLimit = 1024 * 1024 * mb;
  // File size filter.
  /*files = files.filter(function (file) {
    if (file.size > sizeLimit) {
      self.importing.errors.push({
          name: file.name,
          reason: "file too big, max file size is " + mb + "MB."
      });
      self.importing.finished++;
      return false;
    } else {
      return true;
    }
  });*/
  return new Promise((resolve, reject) => {
    var state = {
      total: 0,
      current: 0
    };

    var activity = new Activity();

    var cancelled = false;

    Messaging.send("startImport", { total: files.length }, (result) => {
      if (!result.failed) {
        console.group("Importing %d replays.", files.length);
        state.total = files.length;
        console.time("Replay import");
        var fls = FileListStream(files);
        var send = ReplayImportStream({
          highWaterMark: sizeLimit
        });
        fls.pipe(send);
        activity.on("cancelled", () => {
          cancelled = true;
          fls.unpipe();
          send.stop();
          Messaging.send("cancelImport");
        });

        send.on('finish', function () {
          console.timeEnd("Replay import");
          console.groupEnd();
          activity.complete();
          if (!state.cancelled) {
            Messaging.send("endImport");
          }
        });
        fls.on("end", function () {
          logger.debug("File list stream ended.");
        });
        resolve(activity);
      } else {
        reject(result.type);
      }
    });

    Messaging.listen("importProgress", () => {
      if (cancelled) return;
      console.log("Received import progress.");
      state.current++;
      activity.progress(state);
    });

    Messaging.listen("importError", (message) => {
      if (cancelled) return;
      activity.warn(message);
      state.current++;
      activity.progress(state);
    });
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

function Activity(spec) {
  EventEmitter.call(this);
  this._cancelled = false;
}
util.inherits(Activity, EventEmitter);

Activity.prototype.cancel = function () {
  this._cancelled = true;
  this.emit("cancelled");
};

// Indicate progress.
// total / current
Activity.prototype.progress = function (info) {
  this.emit("progress", {
    total: info.total,
    current: info.current
  });
};

// Indicate complete.
Activity.prototype.complete = function () {
  this.emit("done", this._cancelled);
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

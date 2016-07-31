var EventEmitter = require('events').EventEmitter;

var Data = require('./data');
var Messaging = require('./messaging');
var ZipFiles = require('./zip-files');

var logger = require('./logger')('replays');

logger.info('Starting FailedReplays');

class FailedReplays extends EventEmitter {
  select(ids) {
    if (typeof ids === "string") {
      ids = [ids];
    }
    // Throw can't find
    // Else return selection which can have actions done.
    return new Selection(ids);
  }

  query(args) {
    logger.info('FailedReplays#query');
    return Data.getFailedReplayInfoList(args).then((data) => {
      logger.debug('Query returned');
      return {
        data: data[1],
        total: data[0]
      };
    });
  }
}
module.exports = new FailedReplays();

class Selection {
  constructor(ids) {
    this.ids = ids;
  }

  /**
   * Puts selected items into removal db and
   * returns a DestructiveTask for undoing if needed.
   */
  // TODO: Make failed-replay-specific.
  remove() {
    logger.info("Selection#remove");
    // Cancel any in-progress renders.
    return Messaging.send("cancelRenders", {
      ids: this.ids
    }).then((err) => {
      // TODO: proper API between background page and us.
      if (err) throw err;
    }).then(() => {
      return Data.recycleReplays(this.ids).catch((err) => {
        logger.error("Error recycling replays: ", err);
        throw err;
      });
    }).then((ids) => {
      return new DestructiveTask(() => {
        return Data.emptyRecycled(ids);
      }, () => {
        return Data.restoreReplays(ids);
      });
    });
  }

  download() {
    logger.info("Selection#download");
    var activity = new Activity({
      cancellable: false
    });
    var files = 0;
    activity.update(this.ids.length, files);
    var zipfiles = new ZipFiles({
      default_name: "replay",
      zip_name: "replays"
    });
    zipfiles.on("generating_int_zip", () => {
      // TODO: Update message.
      addReasons();
    });
    zipfiles.on("generating_final_zip", () => {
      // TODO: Update message.
      addReasons();
    });
    zipfiles.on("file", () => {
      activity.update(this.ids.length, ++files);
    });
    // Reset download state.
    zipfiles.on("end", () => {
      activity.complete();
    });
    var reasons = [];
    function addReasons() {
      var text = reasons.map((info) => {
        return `${info.name} (${info.failure_type}) [${info.timestamp}]: ${info.message}`;
      }).join("\n");
      zipfiles.addFile({
        filename: "failure_info",
        ext: "txt",
        contents: text
      });
      reasons = [];
    }
    Data.getFailedReplayInfoById(this.ids).then((info) => {
      return Data.forEachFailedReplay(this.ids, (data, id) => {
        reasons.push(info[id]);
        zipfiles.addFile({
          filename: data.name,
          ext: "json",
          contents: data.data
        });
      });
    }).then(() => {
      zipfiles.done();
    }).catch((err) => {
      // TODO: Send message about failure.
      Messaging.send("downloadError", err);
      // err.message
      logger.error("Error compiling raw replays into zip: ", err);
      zipfiles.done(true);
    });
    return Promise.resolve(activity);
  }
}

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
class Activity extends EventEmitter {
  constructor(spec) {
    super();
    if (typeof spec == "undefined") spec = {};
    EventEmitter.call(this);
    this.cancellable = spec.cancellable;
    this.state = "pending";
    this.progress = {
      total: 0,
      current: 0
    };
  }

  /**
   * Fires and indicates whether activity was cancelled.
   * @event Activity#done
   * @type {boolean}
   */
  cancel() {
    this.state = "rejected";
    this.emit("done");
  }

  /**
   * Update activity progress.
   * @fires Activity#update
   * @param {number} total The total number of items.
   * @param {number} current The current item that has been processed.
   */
  update(total, current) {
    this.progress.total = total;
    this.progress.current = current;
    this.emit("update");
  }

  /**
   * Indicate activity completion.
   * @fires Activity#done
   */
  complete() {
    this.state = "fulfilled";
    this.emit("done");
  }
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
DestructiveTask.prototype.do = function () {
  logger.info("Doing");
  return this._do();
};

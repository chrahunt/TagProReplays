var $ = require('jquery');
var Dexie = require('dexie');
var EventEmitter = require('events');

var convert = require('./convert');
var fs = require('./filesystem');
var Constraints = require('./constraints');
var reader = require('./file-reader');
var Util = require('./util');

var logger = require('./logger')('data');

/**
 * This module has utilities for working with the replay data, and
 * provides an interface on top of the IndexedDB and FileSystem storage
 * services.
 *
 * Everywhere a replay id is needed, it refers to the replay info id.
 * @module Data
 */

/**
 * @fires "db:upgrade"
 * @fires "db:upgrade:progress" - {total, progress}
 * @fires "db:open"
 * @fires "db:err" - {reason}
 * @fires "db:err:upgrade" - {reason}
 */
var bus = exports.events = new EventEmitter();

var db = new Dexie("ReplayDatabase");
// TODO: better way to track this, shouldn't rely on being open at all.
var open = false;
exports.db = db;

// Logging.
var events = ["ready", "error", "populate", "blocked", "versionchange"];
events.forEach((e) => {
  db.on(e, () => {
    logger.info(`Dexie callback: ${e}`);
  });
});

db.on("blocked", () => {
  bus.emit("db:err", "blocked");
});

// Hold upgrade information until version is decided by Data.init.
var version_holder = {
  version: function (version) {
    logger.debug(`Adding version: ${version}`);
    var o = {
      version: version
    };
    this._versions.push(o);
    this._max_version = Math.max(version, this._max_version);
    logger.trace(`Total versions added: ${this._versions.length}`);
    return {
      stores: function (defs) {
        o.stores = defs;
        return this;
      },
      upgrade: function (callback) {
        o.upgrade = callback;
        return this;
      }
    };
  },
  _versions: [],
  _max_version: 0,
  init: function (db, version) {
    if (!version) {
      version = this._max_version;
    }
    logger.debug(`Initializing with versions <= ${version}`);
    var versions = this._versions.filter((o) => o.version <= version);
    logger.trace(`Versions selected: ${versions.length}`);
    versions.forEach((o) => {
      db.version(o.version)
        .stores(o.stores)
        .upgrade(o.upgrade);
    });
  }
};

// Initial versions of the database may be either 1 or 2 with
// a 'positions' object store and an empty 'savedMovies' object
// store.
version_holder.version(0.1).stores({
  positions: '',
  savedMovies: ''
});

version_holder.version(0.2).stores({
  positions: '',
  savedMovies: ''
});

// Batch process for a table.
function batch_process(table, batch_size, iteratee) {
  var total;
  // start - position in table to start.
  // returns promise
  function inner_loop(start) {
    logger.trace(`Executing inner loop on ${start}`);
    // Index of the end of this sequence of items.
    var n = Math.min(batch_size, total - start);
    // whether this is the last iteration.
    var last = start + batch_size >= total;
    return new Dexie.Promise(
    function inner_loop_promise(resolve, reject) {
      var dones = 0;
      var looped = false;
      function check(err) {
        // check looped to ensure that the table looping
        // is complete.
        // or is that redundant with checking n?
        if (dones === n && looped) {
          // reject only when looped?
          if (err) {
            reject(err);
          } else if (!last) {
            // recurse
            resolve(inner_loop(start + n));
          } else {
            resolve();
          }
        }
      }

      table.offset(start)
           .limit(n)
      .each(function iteratee_caller(item, cursor) {
        var data = {
          key: cursor.key,
          value: item
        };
        iteratee(data).then(function iteratee_callback(err) {
          dones++;
          check(err);
        });
      }).then(function inner_loop_callback() {
        looped = true;
        // check here in case this finishes after each of the
        // individual transactions.
        // e.g. if everything of the transactions are synchronous.
        check();
      });
    });
  }

  return table.count().then((t) => {
    if (!t) {
      return Dexie.Promise.resolve();
    } else {
      total = t;
      return inner_loop(0);
    }
  });
}

// Current version.
version_holder.version(3).stores({
  info: '++id,&replay_id,name,rendered,duration,dateRecorded',
  replay: '++id,&info_id',
  failed_info: '++id,&replay_id',
  failed_replays: '++id,&info_id',
  deleted: '++id',
  positions: null,
  savedMovies: null
}).upgrade(function upgrade_3(trans) {
  logger.info("Doing upgrade.");
  // TODO: Error transition if too big.
  // Set upgrading status.
  bus.emit("db:upgrade");

  trans.on('complete', () => {
    logger.info("Upgrade transaction completed.");
  });

  trans.on('abort', (err) => {
    logger.warn("Transaction aborted");
    bus.emit("db:err:upgrade", err);
  });

  trans.on('error', (err) => {
    logger.warn("Transaction had error.");
    bus.emit("db:err:upgrade", err);
  });

  // Num done.
  var numberDone = 0;
  // Item #.
  var n = 0;
  var total;

  // Worker processes replay conversions.
  // Handles one replay at a time.
  // - converts
  // - adds info
  // - adds replay
  // - adds info with replay id
  function worker(data) {
    // Skip null values.
    if (data.value === null) {
      logger.trace("Skipping null value.");
      return Dexie.Promise.resolve();
    }

    var name = data.key;
    var item = data.value;
    var i = n++;

    logger.debug(`Iterating item: ${i}`);
    try {
      data = convert({
        name: name,
        data: JSON.parse(item)
      });
    } catch(e) {
      // Problem with conversion.
      logger.debug(`Failed replay: ${i}.`);
      // Catch replay conversion or save error.
      logger.debug("Couldn't convert %s due to: %O.", name, e);
      logger.debug(`Saving ${name} to failed replay database.`);
      var failedInfo = {
        name: name,
        failure_type: "upgrade_error",
        timestamp: Date.now(),
        message: e.message
      };
      return trans.table("failed_info")
                  .add(failedInfo)
      .then((info_id) => {
        logger.debug(`Added failed info: ${i}.`);
        return {
          info_id: info_id,
          name: name,
          data: item
        };
      }).then((failedReplay) => {
        return trans.table("failed_replays")
                    .add(failedReplay);
      }).then((replay_id) => {
        logger.debug(`Added failed replay: ${i}.`);
        return trans.table("failed_info")
                    .update(info_id, {
                      replay_id: replay_id
                    });
      }).then(() => {
        bus.emit("db:upgrade:progress", {
          total: total,
          progress: ++numberDone
        });
        logger.debug(`Saved failed replay: ${i} (${numberDone}).`);
      }).catch((err) => {
        // TODO: Necessary?
        // Save error, abort transaction.
        logger.error("Aborting upgrade due to database error: %O.", err);
        trans.abort();
        throw new Error("error: " + err);
      });
    }
    // Save converted replay.
    var replay = data.data;
    var info = generateReplayInfo(replay);
    // Errors here would bubble up to the transaction.
    logger.debug(`Adding info: ${i}`);
    return trans.table("info")
                .add(info)
    .then(function w_info_add_1(info_id) {
      logger.debug(`Added info: ${i}`);
      replay.info_id = info_id;
      return trans.table("replay").add(replay);
    }).then(function w_replay_add(replay_id) {
      logger.debug(`Added replay: ${i}`);
      info.replay_id = replay_id;
      return trans.table("info").update(replay.info_id, {
        replay_id: replay_id
      });
    }).then(function w_info_add_2() {
      // Console alert that replay was saved, progress update.
      bus.emit("db:upgrade:progress", {
        total: total,
        progress: ++numberDone
      });
      logger.debug(`Finished replay: ${i} (${numberDone}).`);
    });
  }

  trans.table("positions").count().then((t) => {
    if (t > Constraints.max_replays_in_database) {
      // TODO: Set error message somehow
      // set("db_full")
      logger.error(
        "Aborting upgrade due to database size (replays: %d, max: %d).",
        t, Constraints.max_replays_in_database);
      trans.abort();
    } else if (t === 0) {
      logger.info("Empty database, nothing to do.");
    } else {
      logger.info(`Database has ${t} replays to upgrade.`);
      total = t;
      var num_workers = 5;
      batch_process(trans.table("positions"), num_workers, worker);
    }
  });
});

/**
 * Call to initialize database. Idempotent within a single page
 * context.
 * @param {number} [version] - Version of database to use, only for
 *   testing.
 * @param {bool} [events] - Whether to emit events for this init call.
 * @return {Promise} - Promise that resolves on open or rejects on open
 *   error.
 */
exports.init = function (version, events) {
  if (open) return Promise.resolve();
  if (typeof events === "undefined") {
    events = true;
  }
  logger.info("In Data#init");
  version_holder.init(db, version);
  return db.open().then(() => {
    if (events) {
      logger.debug("Emitting db:open");
      bus.emit("db:open");
    }
  }).catch((err) => {
    logger.error("Error opening database: %O.", err);
    if (events)
      bus.emit("db:err", "unknown");
    // Re-throw.
    throw err;
  });
};

/**
 * Generates the replay metadata that is stored in a separate object
 * store.
 * @param {Replay} replay - The replay to generate information for.
 * @return {ReplayInfo} - The information for the replay.
 */
function generateReplayInfo(replay) {
    // Copy replay information.
    // Add player information.
    // Add duration.
  var info = Util.clone(replay.info);
  info.duration = Math.round(
        (1e3 / info.fps) * replay.data.time.length);
  info.players = {};
    // Get player information.
  Object.keys(replay.data.players).forEach((id) => {
    var player = replay.data.players[id];
    info.players[id] = {
      name: player.name.find((v) => v !== null),
      team: player.team.find((v) => v !== null),
      id: player.id
    };
  });
  info.rendered = false;
  info.render_id = null;
  info.rendering = false;
  return info;
}

/**
 * Crops a replay to the given start and end frames.
 * @param {Replay} replay - The replay to crop
 * @param {integer} startFrame - The frame to use for the start of the
 *   new replay.
 * @param {integer} endFrame - The frame to use for the end of the new
 *   replay.
 * @return {Replay} - The cropped replay.
 */
function cropReplay(replay, startFrame, endFrame) {
    // Don't do anything if this replay is already the correct size.
  if (startFrame === 0 && endFrame === replay.data.time.length)
    return replay;

  var startTime = replay.data.time[startFrame],
    endTime = replay.data.time[endFrame];

    // Crop an array that only contains information for each frame
    // and impacts no later.
  function cropFrameArray(ary) {
    return ary.slice(startFrame, endFrame + 1);
  }

    // Remove events from provided array that occur after the end
    // of the cropped replay, or far enough in advance of the start
    // that they are not relevant.
  function cropEventArray(ary, cutoff) {
    if (typeof cutoff == "undefined") cutoff = null;
    return ary.filter((event) =>
      event.time < endTime &&
      (cutoff === null || startTime - event.time < cutoff)
    );
  }

    // Crop the arrays for a player, returning the player or null
    // if this results in the player no longer being relevant.
  function cropPlayer(player) {
    var name = cropFrameArray(player.name);
    var valid = name.some((val) => val !== null);
    if (!valid) return null;
    var newPlayer = {
      auth: cropFrameArray(player.auth),
      bomb: cropFrameArray(player.bomb),
      dead: cropFrameArray(player.dead),
      degree: cropFrameArray(player.degree),
      draw: cropFrameArray(player.draw),
      flag: cropFrameArray(player.flag),
      // Necessary to clone?
      flair: cropFrameArray(player.flair).map(Util.clone),
      grip: cropFrameArray(player.grip),
      id: player.id,
      name: name,
      tagpro: cropFrameArray(player.tagpro),
      team: cropFrameArray(player.team),
      x: cropFrameArray(player.x),
      y: cropFrameArray(player.y)
    };
    if (player.hasOwnProperty("angle")) {
      newPlayer.angle = cropFrameArray(player.angle);
    }
    return newPlayer;
  }

    // Return a dynamic tile with its value array cropped.
  function cropDynamicTile(tile) {
    return {
      x: tile.x,
      y: tile.y,
      value: cropFrameArray(tile.value)
    };
  }

    // Crop array of spawns, taking into account the waiting period
    // for the cutoff.
  function cropSpawns(spawns) {
    return spawns.filter((spawn) => {
      return spawn.time <= endTime &&
             startTime - spawn.time <= spawn.wait;
    }).map(Util.clone);
  }

    // New, cropped replay.
  var newReplay = {
    info: Util.clone(replay.info),
    data: {
      bombs: cropEventArray(replay.data.bombs, 200),
      chat: cropEventArray(replay.data.chat, 3e4),
      dynamicTiles: replay.data.dynamicTiles.map(cropDynamicTile),
      endTimes: replay.data.endTimes.filter(
        (time) => time >= startTime),
      map: Util.clone(replay.data.map),
      players: {},
      // necessary to clone?
      score: cropFrameArray(replay.data.score).map(Util.clone),
      spawns: cropSpawns(replay.data.spawns),
      splats: cropEventArray(replay.data.splats),
      time: cropFrameArray(replay.data.time),
      wallMap: Util.clone(replay.data.wallMap)
    },
    version: "2"
  };

  var gameEnd = replay.data.gameEnd;
  if (gameEnd && gameEnd.time <= endTime) {
    newReplay.data.gameEnd = Util.clone(gameEnd);
  }

  // Crop player properties.
  $.each(replay.data.players, (id, player) => {
    var newPlayer = cropPlayer(player);
    if (newPlayer !== null) {
      newReplay.data.players[id] = newPlayer;
    }
  });

  return newReplay;
}

exports.util = {
  cropReplay: cropReplay
};

// Reset the database, for debugging.
exports.resetDatabase = function () {
  db.delete();
};

// Reset the file system, for debugging.
exports.resetFileSystem = function () {

};

// Remove database-specific information from replays.
function cleanReplay(replay) {
  delete replay.id;
  delete replay.info_id;
  return replay;
}

function getReplayDatabaseInfo() {
  return db.info.count().then((n) => {
    return new Promise((resolve, reject) => {
      navigator.webkitTemporaryStorage.queryUsageAndQuota((used) => {
        resolve({
          replays: n,
          size: used
        });
      }, reject);
    });
  });
}
exports.getDatabaseInfo = getReplayDatabaseInfo;

/**
 * @typedef CropRequest
 * @typedef {object}
 * @property {integer} id - The id of the replay to crop.
 * @property {integer} start - The start frame for the new replay.
 * @property {integer} end - The end frame for the new replay.
 * @property {string} [name] - The new name for the replay. If blank,
 *   then a name is made using the name of the replay being cropped +
 *   " (cropped)".
 */
/**
 * Crop a replay and save it with a new name.
 * @param {CropRequest} info - The information for the cropping.
 * @return {Promise} - Promise object that resolves to a tuple of the
 *   form [replayInfo, replay].
 */
function cropAndSaveReplayAs(request) {
  if (request.name === "") request.name = false;
  return db.transaction("rw", db.info, db.replay, () => {
    return db.replay
             .where("info_id")
             .equals(request.id)
             .first()
    .then((replay) => {
      var name = request.name ||
                 `${replay.info.name} (cropped)`;
      // TODO: Ensure within bounds of replay and doesn't
      // result in a length 0 replay.
      replay = cropReplay(replay, request.start, request.end);
      replay.info.name = name;
      return saveReplay(replay).then(
        (replayInfo) => [replayInfo, replay]);
    });
  }).then((data) => [data[0], cleanReplay(data[1])]);
}
exports.cropAndSaveReplayAs = cropAndSaveReplayAs;

/**
 * Crop a replay and overwrite it.
 * @param {CropRequest} info - The information for the cropping.
 * @return {Promise} - Promise object that resolves to the new replay.
 */
exports.cropAndSaveReplay = function (request) {
  return db.transaction("rw", db.info, db.replay, () => {
    return cropAndSaveReplayAs(request).then((data) => {
      // Delete original replay.
      return deleteReplays([request.id]).then(() => data);
    });
  });
};

/**
 * Retrieve the data corresponding to the given replay.
 * @param {integer} id - The info id of the replay to retrieve.
 * @return {Promise} - Promise that resolves to the replay data, or
 *   rejects if the replay is not present or another error occurs.
 */
exports.getReplay = function (id) {
  return db.replay
           .where("info_id")
           .equals(id)
           .first()
  .then((replay) => {
    if (replay)
      return cleanReplay(replay);

    throw new Error(`Replay with id ${id} not found.`);
  });
};

/**
 * Iterate over each replay.
 * @param {Arrray.<integer>} ids - Array of ids for the replays to
 *   iterate over.
 * @param {Function} callback - Callback function that receives each of
 *   the replays in turn.
 * @returns {Promise} - Promise that resolves when the iteration is
 *   complete.
 */
exports.forEachReplay = function (ids, callback) {
  return db.replay
           .where("info_id")
           .anyOf(ids)
  .each((replay) => {
    callback(cleanReplay(replay));
  });
};

/**
 * Get list of replay info for population to menu.
 * @returns {Promise} callback - Promise that resolves to an array of
 *   the replay info, or rejects if an error occurred.
 */
exports.getAllReplayInfo = function () {
  return db.info.toArray();
};

/**
 * @typedef {object} ReplaySelector
 * @property {number} length - The number of replays to select.
 * @property {string} dir - The direction the replays should be sorted
 *   by.
 * @property {number} start - The offset of the replays from the start
 *   of the sorted list.
 * @property {string} sortedBy - String value referencing an indexed
 *   column in the replays object store. Can be one of "name", "date",
 *   "rendered", or "duration".
 */
/**
 * Retrieve information for a subset of replays.
 * @param {ReplaySelector} data - Information on which replays to
 *   select.
 * @returns {Promise} - Promise that resolves to an array with the
 *   number of total replays and the replays that were retrieved.
 */
exports.getReplayInfoList = function (data) {
  var mapped = {
    "name": "name",
    "date": "dateRecorded",
    "rendered": "rendered",
    "duration": "duration"
  };
  var index = mapped[data.sort];
  var collection = db.info.orderBy(index);
  if (data.dir !== "asc") {
    collection.reverse();
  }

  return collection.count().then((n) => {
    return collection
             .offset(data.start)
             .limit(data.length)
             .toArray()
           .then((results) => [n, results]);
  });
};

/**
 * Update the info for a single replay with the provided values.
 * @param {number} id - The id of the replay info to update.
 * @param {object} update - The update used for the replay info.
 * @returns {Promise} - Promise that rejects on error.
 */
exports.updateReplayInfo = function (id, update) {
    // Not allowed to set these.
  var protectedKeys = ["id", "replay_id", "info_id"];
    // These are only set on the info object.
  var dbInfoOnly = [
    "rendered",
    "renderId",
    "players",
    "duration",
    "rendering"
  ];

  var keys = Object.keys(update);
    // Ensure no protected keys are set.
  var protectedKeyWrite = keys.some(
      (key) => protectedKeys.indexOf(key) !== -1);
  if (protectedKeyWrite)
    return Promise.reject("Cannot write to protected keys!");

    // Object keys that apply to the replay.
  var replayKeys = keys.filter(
      (key) => dbInfoOnly.indexOf(key) === -1);

  return db.transaction("rw", db.info, db.replay, () => {
    db.info.update(id, update);
    if (replayKeys.length !== 0) {
      var replayObj = {};
            // Construct update object for info property.
      replayKeys.forEach((key) => {
        replayObj["info." + key] = update[key];
      });
      db.replay.where("info_id").equals(id).modify(replayObj);
    }
  });
};

/**
 * Saves the replay with the given info and replay values.
 * @param {ReplayInfo} [info] - The info for the replay. If not
 *   provided then it will be generated.
 * @param {Replay} replay - The Replay data.
 * @returns {Promise} - Promise that resolves to the info corresponding
 *   to the replay.
 */
function saveReplay(info, replay) {
  if (typeof replay == "undefined") {
    replay = info;
    info = generateReplayInfo(replay);
  }
  return db.transaction("rw", db.info, db.replay, () => {
    return db.info.add(info).then((info_id) => {
      info.id = info_id;
      replay.info_id = info_id;
      return db.replay.add(replay).then((replay_id) => {
        info.replay_id = replay_id;
        db.info.update(info_id, { replay_id: replay_id });
        return info;
      });
    });
  });
}
exports.saveReplay = saveReplay;

/**
 * Rename a replay.
 * @param {number} id - The id of the info object for the replay to
 *   rename.
 * @param {string} name - A non-empty string to rename the replay to.
 * @returns {Promise} - Promise that resolves on successful completion,
 *   or rejects if there was an error.
 */
exports.renameReplay = function (id, name) {
  if (name === "") return Promise.reject("Name cannot be blank.");
  return db.transaction("rw", db.info, db.replay, () => {
    db.info.update(id, { name: name });
    db.replay.where("info_id").equals(id).modify({
      "info.name": name
    });
  });
};

/**
 * Delete replay data, includes the info and raw replay as well as the
 * rendered video, if present.
 * @param {Array.<integer>} ids - The ids of the replays to delete
 * @returns {Promise} - Promise that resolves when all ids have been
 *   deleted properly, or rejects on error.
 */
function deleteReplays(ids) {
  return db.transaction("rw", db.info, db.replay, () => {
    return Dexie.Promise.all(ids.map((id) => {
      return db.info.get(id).then((info) => {
        logger.trace(`Deleting replay ${id}.`);
        // Errors here would bubble.
        db.info.delete(id);
        db.replay.delete(info.replay_id);
        if (info.rendered) {
          var movieId = info.render_id;
          return deleteMovie(movieId);
        }
      });
    }));
  });
}
exports.deleteReplays = deleteReplays;

/**
 * Resolves to an array of ids for the deleted items, which
 * can be used to restore them.
 */
function recycleReplays(ids) {
  logger.info('Recycling replays');
  return db.transaction('rw', db.info, db.deleted, () => {
    return Dexie.Promise.all(ids.map((id) => {
      return db.info.get(id).then((info) => {
        return db.deleted.add({
          info: info
        });
      }).then((delete_id) => {
        db.info.delete(id);
        return delete_id;
      });
    }));
  });
}
exports.recycleReplays = recycleReplays;

/**
 * Takes array of ids as specified above and restores the info to
 * the info db.
 */
function restoreReplays(ids) {
  logger.info('Restoring replays');
  return db.transaction('rw', db.info, db.deleted, () => {
    return Dexie.Promise.all(ids.map((id) => {
      return db.deleted.get(id).then((deleted) => {
        logger.trace(`Restoring replay info for ${deleted.info.id}`);
        return db.info
                 .add(deleted.info);
      }).then(() => {
        return db.deleted
                 .delete(id);
      });
    }));
  });
}
exports.restoreReplays = restoreReplays;

/**
 * Carry out deletion of the actual replay data.
 */
function emptyRecycled(ids) {
  logger.info('Emptying recycled replays');
  return db.transaction('rw', db.deleted, db.replay, () => {
    var collection = ids ? db.deleted.where(':id').anyOf(ids)
                         : db.deleted;
    return collection.each((deleted) => {
      var info = deleted.info;
      return db.replay
               .delete(info.replay_id)
      .then(() => {
        if (info.rendered) {
          var movieId = info.render_id;
          return deleteMovie(movieId);
        }
      }).then(() => {
        return db.deleted
                 .delete(deleted.id);
      });
    })
  });
}
exports.emptyRecycled = emptyRecycled;

/**
 * Get movie for a replay.
 * @param {number} id - The id of the replay to get the movie for.
 * @returns {Promise} - Promise that resolves to the file, or rejects if
 *   there is a filesystem error or the movie isn't rendered.
 */
exports.getMovie = function (id) {
  return db.info.get(id).then((info) => {
    if (!info.rendered)
      throw new Error("Replay is not rendered.");
    var movieId = info.render_id;
    return fs.getFile("savedMovies/" + movieId).then((file) => {
      return reader.readAsArrayBuffer(file).then((result) => {
        return {
          name: info.name,
          data: result
        };
      });
    });
  });
};

/**
 * Save a movie to the file system.
 * @param {number} id - The id of the replay to save the movie for.
 * @param {*} data - The movie data
 * @returns {Promise} - The promise that resolves if the saving
 *   completes successfully, or rejects if there is an error.
 */
exports.saveMovie = function (id, data) {
    // Save movie with same id as info.
  var movieId = id;
  return fs.saveFile("savedMovies/" + movieId, data).then(() => {
    fs.readDirectory("savedMovies").then((names) => {
      logger.debug("Movie names: %o.", names);
    }).catch((err) => {
      logger.error("Error reading movies: %o.", err);
    });
    return db.info.update(id, {
      rendered: true,
      render_id: movieId
    });
  });
};

/**
 * Delete movie from the file system.
 * @param {(integer|string)} id - The id of the replay to delete the
 *   movie for.
 * @param {Promise} - Promise that resolves when the movie has been
 *   deleted successfully.
 */
function deleteMovie(id) {
  var movieId = id;
  return fs.deleteFile("savedMovies/" + movieId).then(() => {
    return fs.readDirectory("savedMovies").then((names) => {
      logger.debug("Movie names: %o.", names);
    }).catch((err) => {
      logger.error("Error reading movies: %o.", err);
    });
  });
}

exports.failedReplaysExist = function () {
  return db.failed_info.count().then((n) => n > 0);
};

exports.getFailedReplayInfoList = function (data) {
  var collection = db.failed_info.orderBy(":id");
  return collection.count().then((n) => {
    return collection
             .offset(data.start)
             .limit(data.length)
           .toArray().then((results) => [n, results]);
  });
};

// Returns promise that resolves to object with info id key and failed
// replay info value.
exports.getFailedReplayInfoById = function (ids) {
  return db.failed_info
           .where(":id")
           .anyOf(ids)
  .toArray((info) => {
    return info.reduce((obj, data) => {
      obj[data.id] = data;
      return obj;
    }, {});
  });
};

/**
 * Delete replay data, includes the info and raw replay as well as the
 * rendered video, if present.
 * @param {Array.<integer>} ids - The ids of the replays to delete
 * @return {Promise} - Promise that resolves when all ids have been
 *   deleted properly, or rejects on error.
 */
exports.deleteFailedReplays = function (ids) {
  return db.transaction("rw", db.failed_info, db.failed_replays,
    () => {
      return Promise.all(ids.map((id) => {
        return db.failed_info.get(id).then((info) => {
          return Promise.all([
            db.failed_info.delete(id),
            db.failed_replays.delete(info.replay_id)
          ]);
        });
      }));
    });
};

/**
 * Retrieve the data corresponding to the given replay.
 * @param {integer} id - The info id of the replay to retrieve.
 * @return {Promise} - Promise that resolves to the replay data, or
 *   rejects if the replay is not present or another error occurs.
 */
exports.getFailedReplay = function (id) {
  return db.failed_replays
           .where("info_id")
           .equals(id)
           .first()
  .then((replay) => {
    if (replay)
      return cleanReplay(replay);
    throw new Error("No replay found.");
  });
};

exports.getFailedReplayInfo = function (id) {
  return db.failed_info.get(id).then((info) => {
    if (info)
      return info;
    throw new Error("No info found.");
  });
};

/**
 * Iterate over each replay.
 * @param {Arrray.<integer>} ids - Array of ids for the replays to
 *   iterate over.
 * @param {Function} callback - Callback function that receives the
 *   replay data and id for each failed replay.
 * @return {Promise} - Promise that resolves when the iteration is
 *   complete.
 */
exports.forEachFailedReplay = function (ids, callback) {
  return db.failed_replays
           .where("info_id")
           .anyOf(ids)
  .each((replay) => {
    var info_id = replay.info_id;
    callback(cleanReplay(replay), info_id);
  });
};

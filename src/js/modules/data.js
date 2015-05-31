var $ = require('jquery');
var Dexie = require('dexie');

var oldConvert = require('./convert');
var fs = require('./filesystem');
var IDB = require('./indexedDBUtils');
var Status = require('./status');

/**
 * This script has utilities for working with the data, and is provided
 * as an interface on top of the IndexedDB and FileSystem storage
 * services.
 *
 * Everywhere a replay id is needed, it refers to the replay info id.
 * 
 * This file is included as a background script.
 */

// Wrapper around convert to use promises.
var convert = function(data) {
    return new Promise(function (resolve, reject) {
        oldConvert(data, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
};

/**
 * Clones an object.
 * @param {object} obj - The object to clone.
 * @return {object} - The cloned object.
 */
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Return the index of the first value in the array that satisfies the given
 * function. Same as `findIndex`.
 */
function findIndex(array, fn) {
    for (var i = 0; i < array.length; i++) {
        if (fn(array[i])) {
            return i;
        }
    }
    return -1;
}

/**
 * Return the first value in the array that satisfies the given function. Same
 * functionality as `find`.
 */
function find(array, fn) {
  for (var i = 0; i < array.length; i++) {
    if (fn(array[i])) {
      return array[i];
    }
  }
}

var db = new Dexie("ReplayDatabase");

exports.db = db;

db.version(1.0 / 10).stores({
    positions: ''
});

// Versions 1 and 2 were pre-Dexie.
db.version(3.0 / 10).stores({
    info: '++id,&replay_id',
    replay: '++id,&info_id',
    failed_info: '++id,&replay_id',
    failed_replays: '++id,&info_id'
}).upgrade(function (transaction) {
    Status.set("upgrading");
    transaction.on('complete', function () {
        Status.set("idle");
    });

    /*
    db.positions.each(function (item, cursor) {
        // Skip if data is not present.
        if (item === null) return;
        var data = JSON.parse(item);
        var item = {
            name: cursor.key,
            data: data
        };

        // Convert.
        convert(item).then(function (replay) {
            db.replays.add();
        }).catch(function (err) {

        });
        // Check if valid.

    }).then().catch(function () {
        // JSON parse error.
        // Putting item error.
        // 
    });
    */
});

db.open().catch(function (err) {
    console.error("Error opening database: %o.", err);
});

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
    var info = clone(replay.info);
    info.duration = Math.round((1e3 / info.fps) * replay.data.time.length);
    info.players = {};
    // Get player information.
    Object.keys(replay.data.players).forEach(function(id) {
        var player = replay.data.players[id];
        info.players[id] = {
            name: find(player.name, function(v) { return v !== null; }),
            team: find(player.team, function(v) { return v !== null; }),
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

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
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
        return ary.filter(function(event) {
            return event.time < endTime && (cutoff === null || startTime - event.time < cutoff);
        });
    }

    // Crop the arrays for a player, returning the player or null
    // if this results in the player no longer being relevant.
    function cropPlayer(player) {
        var name = cropFrameArray(player.name);
        var valid = name.some(function(val) {
            return val !== null;
        });
        if (!valid) return null;
        var newPlayer = {
            auth: cropFrameArray(player.auth),
            bomb: cropFrameArray(player.bomb),
            dead: cropFrameArray(player.dead),
            degree: cropFrameArray(player.degree),
            draw: cropFrameArray(player.draw),
            flag: cropFrameArray(player.flag),
            flair: cropFrameArray(player.flair).map(clone), // Necessary to clone?
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
        return spawns.filter(function(spawn) {
            return spawn.time <= endTime && startTime - spawn.time <= spawn.wait;
        }).map(clone);
    }

    // New, cropped replay.
    var newReplay = {
        info: clone(replay.info),
        data: {
            bombs: cropEventArray(replay.data.bombs, 200),
            chat: cropEventArray(replay.data.chat, 3e4),
            dynamicTiles: replay.data.dynamicTiles.map(cropDynamicTile),
            endTimes: replay.data.endTimes.filter(function(time) {
                return time >= startTime;
            }),
            map: clone(replay.data.map),
            players: {},
            score: cropFrameArray(replay.data.score).map(clone), // necessary to clone?
            spawns: cropSpawns(replay.data.spawns),
            splats: cropEventArray(replay.data.splats),
            time: cropFrameArray(replay.data.time),
            wallMap: clone(replay.data.wallMap)
        },
        version: "2"
    };

    var gameEnd = replay.data.gameEnd;
    if (gameEnd && gameEnd.time <= endTime) {
        newReplay.gameEnd = clone(gameEnd);
    }

    // Crop player properties.
    $.each(replay.data.players, function(id, player) {
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
exports.resetDatabase = function() {
    IDB.close();
    indexedDB.deleteDatabase("ReplayDatabase");
};

// Initialize FileSystem Replay folder.
fs.createDirectory("savedMovies", function() {
    console.log("Created saved movies directory.");
}, function(err) {
    console.error("Error creating saved movies directory: " + err);
});

// Reset the file system, for debugging.
exports.resetFileSystem = function() {

};


// Remove database-specific information from replays.
function cleanReplay(replay) {
    delete replay.id;
    delete replay.info_id;
    return replay;
}

/**
 * @typedef CropRequest
 * @typedef {object}
 * @property {integer} id - The id of the replay to crop.
 * @property {integer} start - The start frame for the new replay.
 * @property {integer} end - The end frame for the new replay.
 * @property {string} [name] - The new name for the replay. If blank, then
 *   a name is made using the name of the replay being cropped + 
 *   " (cropped)".
 */
/**
 * Crop a replay and save it with a new name.
 * @param {CropRequest} info - The information for the cropping.
 * @return {Promise} - Promise object that resolves to a tuple of the form
 *   [replayInfo, replay].
 */
function cropAndSaveReplayAs(request) {
    if (request.name === "") request.name = false;
    return db.transaction("rw", db.info, db.replay, function() {
        return db.replay.where("info_id").equals(request.id).first().then(function (replay) {
            var name = request.name ? request.name : replay.info.name + " (cropped)";
            // TODO: Ensure within bounds of replay and doesn't result in a length 0 replay.
            replay = cropReplay(replay, request.start, request.end);
            replay.info.name = name;
            return saveReplay(replay).then(function (replayInfo) {
                return [replayInfo, replay];
            });
        });
    }).then(function (data) {
        return [data[0], cleanReplay(data[1])];
    });
}

exports.cropAndSaveReplayAs = cropAndSaveReplayAs;

/**
 * Crop a replay and overwrite it.
 * @param {CropRequest} info - The information for the cropping.
 * @return {Promise} - Promise object that resolves to the new replay.
 */
exports.cropAndSaveReplay = function(request) {
    return db.transaction("rw", db.info, db.replay, function() {
        return cropAndSaveReplayAs(request).then(function (data) {
            // Delete original replay.
            return deleteReplays([request.id]).then(function () {
                return data;
            });
        });
    });
};

/**
 * Retrieve the data corresponding to the given replay.
 * @param {integer} id - The info id of the replay to retrieve.
 * @return {Promise} - Promise that resolves to the replay data, or
 *   rejects if the replay is not present or another error occurs.
 */
exports.getReplay = function(id) {
    return db.replay.where("info_id").equals(id).first().then(function (replay) {
        if (replay)
            return cleanReplay(replay);

        throw new Error("No replay found.");
    });
};

/**
 * Iterate over each replay.
 * @param {[type]} ids [description]
 * @param {Function} fn [description]
 * @param {[type]} end [description]
 * @return {[type]} [description]
 */
exports.forEachReplay = function(ids, fn, end) {
    ids = ids.slice().sort();
    var transaction = IDB.getDb().transaction("replay");
    var cursor = transaction.objectStore("replay")
        .index("info_id")
        .openCursor(IDBKeyRange.bound(ids[0], ids[ids.length - 1]));
    ids.shift();
    cursor.onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
            fn(cleanReplay(cursor.value));
            cursor.continue(ids.shift());
        } else {
            end();
        }
    };
};

/**
 * Get list of replay info for population to menu.
 * @return {Promise} callback - Promise that resolves to an array of
 *   the replay info, or rejects if an error occurred.
 */
exports.getAllReplayInfo = function() {
    return db.info.toArray();
};

/**
 * Get info for single replay.
 * @param {DBCallback} callback - The callback to receive the replay
 *   info.
 */
exports.getReplayInfo = function(id, callback) {
    var transaction = IDB.getDb().transaction("info");
    var infoStore = transaction.objectStore("info");
    var request = infoStore.get(id);
    request.onsuccess = function(e) {
        if (e.target.result) {
            callback(null, e.target.result);
        } else {
            callback(new Error("No replay found."));
        }
    };
};

/**
 * Update the info for a single replay with the provided values.
 * @param {integer} id - The id of the replay info to update.
 * @param {object} update - The update used for the replay info.
 * @return {Promise} - Promise that rejects on error.
 */
exports.updateReplayInfo = function(id, update) {
    // Not allowed to set these.
    var protectedKeys = ["id", "replay_id", "info_id"];
    // These are only set on the info object.
    var dbInfoOnly = ["rendered", "renderId", "players", "duration", "rendering"];

    var keys = Object.keys(update);
    // Ensure no protected keys are set.
    var protectedKeyWrite = keys.some(function (key) {
        return protectedKeys.indexOf(key) !== -1;
    });
    if (protectedKeyWrite)
        return Promise.reject("Cannot write to protected keys!");

    // Object keys that apply to the replay.
    var replayKeys = keys.filter(function(key) {
        return dbInfoOnly.indexOf(key) === -1;
    });

    return db.transaction("rw", db.info, db.replay, function () {
        db.info.update(id, update);
        if (replayKeys.length !== 0) {
            var replayObj = {};
            // Construct update object for info property.
            replayKeys.forEach(function (key) {
                replayObj["info." + key] = update[key];
            });
            db.replay.where("info_id").equals(id).modify(replayObj);
        }
    });
};

/**
 * Saves the replay with the given info and replay values.
 * @param {ReplayInfo} [info] - The info for the replay. If not provided
 *   then it will be generated.
 * @param {Replay} replay - The Replay data.
 * @return {Promise} - Promise that resolves to the info corresponding
 *   to the replay.
 */
function saveReplay(info, replay) {
    if (typeof replay == "undefined") {
        replay = info;
        info = generateReplayInfo(replay);
    }
    return db.transaction("rw", db.info, db.replay, function() {
        return db.info.add(info).then(function (info_id) {
            info.id = info_id;
            replay.info_id = info_id;
            return db.replay.add(replay).then(function (replay_id) {
                info.replay_id = replay_id;
                db.info.update(info_id, { replay_id: replay_id });
                return info;
            });
        });
    });
}

/**
 * See saveReplay.
 */
exports.saveReplay = saveReplay;

/**
 * Rename a replay.
 * @param {integer} id - The id of the info object for the replay to
 *   rename.
 * @param {string} name - A non-empty string to rename the replay to.
 * @return {Promise} - Promise that resolves on successful completion,
 *   or rejects if there was an error.
 */
exports.renameReplay = function(id, name) {
    if (name === "") return Promise.reject("Name cannot be blank.");
    return db.transaction("rw", db.info, db.replay, function() {
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
 * @param {DBCallback} callback - The callback to receive the success
 *   or failure of the delete operation.
 */
function deleteReplays(ids) {
    return db.transaction("rw", db.info, db.replay, function() {
        ids.forEach(function (id) {
            db.info.get(id).then(function (info) {
                db.info.delete(id);
                db.replay.delete(info.replay_id);
                if (info.rendered) {
                    var movieId = info.renderId || info.render_id;
                    return deleteMovie(movieId);
                }
            });
        });
    });
}
exports.deleteReplays = deleteReplays;

/**
 * Get movie for a replay.
 * @param {integer} id - The id of the replay to get the movie for.
 * @return {Promise} - Promise that resolves to the file, or rejects if
 *   there is a filesystem error or the movie isn't rendered.
 */
exports.getMovie = function(id) {
    return db.info.get(id).then(function (info) {
        if (!info.rendered)
            throw new Error("Replay is not rendered.");
        var movieId = info.renderId;
        return fs.getFile("savedMovies/" + movieId).then(function (file) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onloadend = function () {
                    var ab = this.result;
                    resolve({
                        name: info.name,
                        data: ab
                    });
                };
                reader.readAsArrayBuffer(file);
            });
        });
    });
};

/**
 * Save a movie to the file system.
 * @param {integer} id - The id of the replay to save the movie for.
 * @param {*} data - The movie data
 * @return {Promise} - The promise that resolves if the saving
 *   completes successfully, or rejects if there is an error.
 */
exports.saveMovie = function(id, data) {
    // Save movie with same id as info.
    var movieId = id;
    return fs.saveFile("savedMovies/" + movieId, data).then(function () {
        fs.readDirectory("savedMovies").then(function (names) {
            console.log("Movie names: %o.", names);
        }).catch(function (err) {
            console.error("Error reading movies: %o.", err);
        });
        return db.info.update(id, {
            rendered: true,
            render_id: movieId
        });
    });
};

/**
 * Delete movie from the file system.
 * @param {(integer|string)} id - The id of the replay to delete the movie for.
 * @param {Promise} - Promise that resolves when the movie has been
 *   deleted successfully.
 */
function deleteMovie(id) {
    var movieId = id;
    return fs.deleteFile("savedMovies/" + movieId).then(function () {
        return fs.readDirectory("savedMovies").then(function (names) {
            console.log("Movie names: %o.", names);
        }).catch(function (err) {
            console.error("Error reading movies: %o.", err);
        });
    });
}

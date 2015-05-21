/**
 * This script has utilities for working with the data, and is provided
 * as an interface on top of the IndexedDB and FileSystem storage
 * services.
 * 
 * This file is included as a background script.
 */
(function(window, document, undefined) {

// Add IndexedDB migration functions for upgrading old extension users.
// Initial extension 
idbAddMigration([1, 2], 3, function(db, transaction, callback) {
});

// Initialize IndexedDB.
// Old initialization function for debugging database upgrade.
idbAddInitialization(1, function(db) {
    function ensureStoreExists(store) {
        if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, {
                autoIncrement: true
            });
        }
    }

    ensureStoreExists("positions");
});

// Initialize IndexedDB.
idbAddInitialization(3, function(db) {
    var infoStore = db.createObjectStore("info", {
        autoIncrement: true,
        keyPath: "id"
    });
    infoStore.createIndex("replay_id", "replay_id", { unique: true });

    var replayStore = db.createObjectStore("replay", {
        autoIncrement: true,
        keyPath: "id"
    });
    replayStore.createIndex("info_id", "info_id", { unique: true });
});

idbOpen("ReplayDatabase", 3);

// Reset the database, for debugging.
window.resetDatabase = function() {
    idbClose();
    indexedDB.deleteDatabase("ReplayDatabase");
};

// Initialize FileSystem Replay folder.
fsCreateDirectory("savedMovies", function() {
    console.log("Created saved movies directory.");
}, function(err) {
    console.error("Error creating saved movies directory: " + err);
});

// Reset the file system, for debugging.
window.resetFileSystem = function() {

};


// Remove database-specific information from replays.
function cleanReplay(replay) {
    delete replay.id;
    delete replay.info_id;
    return replay;
}

/**
 * @callback {DBCallback}
 * @param {Error} err - Truthy if an error occurred. Will have
 *   additional information.
 * @param {*} [data] - The expected result, assuming no error
 *   occurred.
 */
/**
 * Retrieve the data corresponding to the given replay.
 * @param {integer} id - The info id of the replay to retrieve.
 * @param {DBCallback} callback - Callback function that receives
 *   the result of the query.
 */
window.getReplay = function(id, callback) {
    var db = getDb();
    var transaction = db.transaction("replay");
    var objectStore = transaction.objectStore("replay");
    objectStore.index("info_id").get(id).onsuccess = function(e) {
        if (e.target.result) {
            callback(null, cleanReplay(e.target.result));
        } else {
            callback(new Error("No replay found."));
        }
    };
};

/**
 * Iterate over each replay.
 * @param {[type]} ids [description]
 * @param {Function} fn [description]
 * @param {[type]} end [description]
 * @return {[type]} [description]
 */
window.forEachReplay = function(ids, fn, end) {
    ids = ids.slice().sort();
    var db = getDb();
    var transaction = db.transaction("replay");
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
 * @param {DBCallback} callback - The callback to receive the array of
 *   info.
 */
window.getAllReplayInfo = function(callback) {
    var db = getDb();
    var transaction = db.transaction("info");
    var store = transaction.objectStore("info");
    var records = [];
    var request = store.openCursor(null);
    request.onsuccess = function() {
        if (request.result) {
            records.push(request.result.value);
            request.result.continue();
        } else {
            callback(null, records);
        }
    };
};

/**
 * Get info for single replay.
 * @param {DBCallback} callback - The callback to receive the replay
 *   info.
 */
window.getReplayInfo = function(id, callback) {
    var db = getDb();
    var transaction = db.transaction("info");
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
 * Save new or imported replay data.
 * @param {ReplayInfo} info - The info to be stored for the replay.
 * @param {Replay} replay - The replay data to save.
 * @param {DBCallback} callback - The function called on success or
 *   failure of the save.
 */
window.saveReplay = function(info, replay, callback) {
    var db = getDb();
    var transaction = db.transaction(["info", "replay"], "readwrite");
    var infoStore = transaction.objectStore("info");
    var replayStore = transaction.objectStore("replay");

    // TODO: Validate the DB info object against the schema.
    // Save the replay in the database.
    // Save info.
    var request = infoStore.add(info);
    request.onsuccess = function(e) {
        var info_id = e.target.result;
        replay.info_id = info_id;
        // Save replay with info_id.
        var request = replayStore.add(replay);
        request.onsuccess = function(e) {
            info.replay_id = e.target.result;
            info.id = info_id;
            // Save info with replay_id.
            var request = infoStore.put(info);
            request.onsuccess = function() {
                callback(null);
            };
        };
    };
};

/**
 * Rename a replay.
 * @param {integer} id - The id of the info object for the replay to
 *   rename.
 * @param {string} name - A non-empty string to rename the replay to.
 * @param {DBCallback} callback - Receives the status of the request.
 */
window.renameReplay = function(id, name, callback) {
    // TODO: Check name is valid.
    var db = getDb();
    var transaction = db.transaction(["info", "replay"], "readwrite");
    var infoStore = transaction.objectStore("info");
    var replayStore = transaction.objectStore("replay");
    infoStore.get(id).onsuccess = function(e) {
        var info = e.target.result;
        info.name = name;
        // TODO: Error handling.
        infoStore.put(info);
    };

    var replayIndex = replayStore.index("info_id");
    replayIndex.get(id).onsuccess = function(e) {
        var replay = e.target.result;
        replay.info.name = name;
        // TODO: Error handling.
        replayStore.put(replay);
    };

    transaction.oncomplete = function(e) {
        callback(null);
    };
};

/**
 * Delete replay data, includes the info and raw replay as well as the
 * rendered video, if present.
 * @param {Array.<integer>} ids - The ids of the replays to delete
 * @param {DBCallback} callback - The callback to receive the success
 *   or failure of the delete operation.
 */
window.deleteReplays = function(ids, callback) {
    var db = getDb();
    var transaction = db.transaction(["info", "replay"], "readwrite");
    var infoStore = transaction.objectStore("info");
    var replayStore = transaction.objectStore("replay");
    var replayIndex = replayStore.index("info_id");
    ids.forEach(function(id) {
        var request = infoStore.get(id);
        request.onsuccess = function() {
            var info = request.result;

            infoStore.delete(info.id);

            // TODO: Delete rendered movie, raise error if issue in callback.
            if (info.rendered) {
                var renderId = info.renderId;
            }
            // Delete info, delete replay.
            request = replayIndex.getKey(id);
            request.onsuccess = function() {
                replayStore.delete(request.result);
            };
        };
    });

    transaction.oncomplete = function(e) {
        callback(null);
    };
};

/**
 * Get movie for a replay.
 * @param {integer} id - The id of the replay to get the movie for.
 * @param {DBCallback} callback - Returns the name of the replay and
 *   the movie file as an ArrayBuffer.
 */
window.getMovie = function(id, callback) {
    var db = getDb();
    var transaction = db.transaction("info");
    var infoStore = transaction.objectStore("info");
    var request = infoStore.get(id);
    request.onsuccess = function(e) {
        var info = e.target.result;
        if (!info.rendered) {
            callback(new Error("Replay not rendered."));
            return;
        }
        var movieId = info.renderId;
        fsGetFile("savedMovies/" + movieId, function(file) {
            var reader = new FileReader();
            reader.onloadend = function (e) {
                var ab = this.result;
                callback(null, info.name, ab);
            };
            reader.readAsArrayBuffer(file);
        }, function(err) {
            callback(err);
        });
    };
};

/**
 * Save a movie to the file system.
 * @param {integer} id - The id of the replay to save the movie for.
 * @param {*} data - The movie data
 * @param {DBCallback} callback
 */
window.saveMovie = function(id, data, callback) {
    // Save movie with same id as info.
    var movieId = id;
    fsSaveFile("savedMovies/" + movieId, data, function() {
        // Get and save the info.
        var db = getDb();
        var transaction = db.transaction("info", "readwrite");
        var infoStore = transaction.objectStore("info");
        var request = infoStore.get(id);
        request.onsuccess = function(e) {
            var info = e.target.result;
            info.rendered = true;
            info.renderId = movieId;
            // TODO: Error handling.
            infoStore.put(info);
            callback(null);
        };
    }, function(err) {
        callback(err);
    });
};

/**
 * Delete movie from the file system.
 * @param {integer} id - The id of the replay to delete the movie for.
 * @param {DBCallback} callback
 */
window.deleteMovie = function(id, callback) {
    var movieId = id;
    fsDeleteFile("savedMovies/" + movieId, data, function() {
        // Get and save the info.
        var db = getDb();
        var transaction = db.transaction("info", "readwrite");
        var infoStore = transaction.objectStore("info");
        var request = infoStore.get(id);
        request.onsuccess = function(e) {
            var info = e.target.result;
            info.rendered = false;
            info.renderId = null;
            // TODO: Error handling.
            infoStore.put(info);
            callback(null);
        };
    }, function(err) {
        callback(err);
    });
};

// Extension update handler.
/*chrome.runtime.onInstalled.addListener(function (details) {
    var reason = details.reason;
    if (reason === "update") {
        var version = details.previousVersion;
        if (semver.lt(version, '1.5.0')) {
            // Remove unnecessary stored data.
            localStorage.clear();
            chrome.storage.local.clear();
        }
    }
});*/

})(window, document);

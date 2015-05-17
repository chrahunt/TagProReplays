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

// Test function for adding data to indexeddb store.
window.addData = function() {
    var info = {
        name: "test",
        recorded: Date.now()
    };
    var replay = {
        info: {},
        data: {}
    };
    var db = getDb();
    var transaction = db.transaction(["info", "replay"], "readwrite");
    transaction.oncomplete = function(e) {
        console.log("All done!");
    };

    transaction.onerror = function(e) {
        console.error("Error!");
    };

    var infoStore = transaction.objectStore("info");
    var replayStore = transaction.objectStore("replay");
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
        };
    };
};

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
    var index = objectStore.index("info_id");
    index.get(id).onsuccess = function(e) {
        if (e.target.result) {
            callback(null, e.target.result);
        } else {
            callback(new Error("No replay found."));
        }
    };
};

/**
 * Get list of replay info for population to menu.
 * @param {DBCallback} callback - The callback to receive the array of
 *   info.
 */
window.getReplayInfo = function(callback) {
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
    // TODO: Error handling.
    var db = getDb();
    var transaction = db.transaction(["info", "replay"], "readwrite");
    var infoStore = transaction.objectStore("info");
    var replayStore = transaction.objectStore("replay");
    infoStore.get(id).onsuccess = function(e) {
        var info = e.target.result;
        info.name = name;
        infoStore.put(info);
    };

    var replayIndex = replayStore.index("info_id");
    replayIndex.get(id).onsuccess = function(e) {
        var replay = e.target.result;
        replay.info.name = name;
        replayStore.put(replay);
    };

    transaction.oncomplete = function(e) {
        callback(null);
    };
};

/**
 * Delete replay data.
 * @param {Array.<integer>} ids - The ids of the replays to delete
 * @param {DBCallback} callback - The callback to receive the success
 *   or failure of the delete operation.
 */
window.deleteReplays = function(ids, callback) {
    var db = getDb();
    var transaction = db.transaction(["info", "replay"]);
    var infoStore = transaction.objectStore("info");
    var replayStore = transaction.objectStore("replay");
    var replayIndex = replayStore.index("info_id");
    ids.forEach(function(id) {
        var request = infoStore.get(id);
        request.onsuccess = function() {
            var info = request.result;
            if (info.rendered) {
                var renderId = info.render_id;
                // TODO: Delete rendered movie, raise error if issue in callback.
            }
            // Delete info, delete replay.
            replayIndex.get(id).onsuccess = function() {

            };
        };
    });
    // Retrieve the info for the replays.
    // Delete the associated videos, if needed.
};

window.getInfo = function(id) {
    var db = getDb();
};
})(window, document);

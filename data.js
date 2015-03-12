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
    // Get the time associated with a replay given its name.
    // Takes string key that replays were previously identified by.
    function getReplayTime(replay) {
        return Number(replay.replace('replays', '').replace(/.*DATE/, ''));
    }

    // Get first non-null and non-integer-zero state of provided data,
    // corresponding to first value in array. If none is found then null
    // is returned.
    function getFirst(data) {
        var newdata = data.filter(function(d) {
            return d !== 0 && d !== null;
        });
        if (newdata.length > 0) {
            return newdata[0];
        } else {
            return null;
        }
    }

    function ensureStoreExists(store) {
        if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, {
                autoIncrement: true
            });
        }
    }

    function deleteStore(store) {
        if (db.objectStoreNames.contains(store)) {
            db.deleteObjectStore(store);
        }
    }

    // Run the callback if the array is empty.
    function runIfEmpty(requests, callback) {
        if (requests.length === 0) {
            callback();
        }
    }

    ensureStoreExists("info");
    ensureStoreExists("replays");

    var stores = {
        positions: transaction.objectStore("positions")
    };
    
    // Set for holding number of pending requests.
    var requests = [];
    // Get data for each of the current replays.
    var positionRequest = stores.positions.openCursor(null);
    requests.push(true);
    positionRequest.onsuccess = function() {
        stores.replays = transaction.objectStore("replays");
        stores.info = transaction.objectStore("info");
        var request = positionRequest;
        if (request.result) {
            var result = request.result;
            var replay = JSON.parse(result.value);
            var replayKey = result.key;

            // New replay format.
            var newReplay = {
                players: {}
            };
            // List of the fields that will remain the same.
            var sameFields = ["bombs", "chat", "clock", "end",
                "floorMap", "floorTiles", "gameEndsAt", "map", "score",
                "spawns", "splats", "tiles", "wallMap"];
            sameFields.forEach(function(field) {
                newReplay[field] = replay[field];
            });

            // Default information for replay.
            var info = {
                // List of players by id with their name and team,
                // either 'red' or 'blue'.
                players: {},
                // Name of the map.
                mapName: '',
                // FPS the replay was recorded at.
                fps: 0,
                // Total duration of the replay, in seconds.
                duration: 0,
                // String name of the replay.
                name: '',
                // Date/time the replay was recorded, as ms epoch time.
                date: getReplayTime(replayKey) || Date.now(),
                // Id for the stored replay information in the IndexedDB db.
                replay: null,
                // Integer id of the player that was recording.
                recordingPlayer: null
            };

            // Extract information from replay into object.
            // Team designation is extracted based in initial state
            // during replay.
            for (var prop in replay) {
                if (prop.search('player') == 0) {
                    var player = replay[prop];
                    var id = +prop.replace('player', '');
                    var team = getFirst(player.team);
                    var name = getFirst(player.name);
                    info.mapName = player.map;
                    info.fps = player.fps;
                    if (player.me === 'me') {
                        info.recordingPlayer = id;
                    }
                    // Remove unnecessary information on players.
                    delete player.map;
                    delete player.fps;
                    delete player.me;
                    // Add edited player object to new replay data container.
                    newReplay.players[id] = player;
                    // Add player information for use in menu display.
                    info.players[id] = {
                        name: name,
                        team: team === 1 ? 'red' : 'blue'
                    };
                }
            }
            if (info.fps) {
                info.duration = replay.clock.length / info.fps;
            }
            // Reorganize the objects?
            // Separately put the replay data into the database
            // and the information into the database (pointing to
            // the replay information)
            var storeReplayRequest = stores.replays.add(newReplay);
            requests.push(true);
            storeReplayRequest.onsuccess = function() {
                requests.pop();
                // Get the id of the replay that was stored and add
                // that to the replay information
                info.replay = this.result;
                // Store the information in the database.
                var storeInfoRequest = stores.info.add(info);
                requests.push(true);
                storeInfoRequest.onsuccess = function() {
                    requests.pop();
                    // Remove the original positions file from the
                    // old object store.
                    var deleteRequest = stores.positions.delete(replayKey);
                    requests.push(true);
                    deleteRequest.onsuccess = function() {
                        requests.pop();
                        runIfEmpty(requests, function() {
                            // After done with existing replays, delete old object stores.
                            deleteStore("positions");
                            deleteStore("savedMovies");
                            callback(true);
                        });
                    };
                    // TODO: Handle failure.
                };
                // TODO: Handle failure.
            };
            // TODO: Handle failure.
            requests.pop();
            requests.push(true);
            request.result.continue();
        } else {
            requests.pop();
            runIfEmpty(requests, function() {
                // After done with existing replays, delete old object stores.
                deleteStore("positions");
                deleteStore("savedMovies");
                callback(true);
            });
        }
    }; // end positionRequest.onsuccess
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
    function ensureStoreExists(store) {
        if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, {
                autoIncrement: true
            });
        }
    }

    ensureStoreExists("info");
    ensureStoreExists("replay");
});

idbOpen("ReplayDatabase", 3);

// Reset the database, for debugging.
window.resetDatabase = function() {
    idbClose();
    indexedDB.deleteDatabase("ReplayDatabase");
};

})(window, document);

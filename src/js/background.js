var cmp = require('semver-compare');
var JSZip = require('jszip');
var sanitize = require('sanitize-filename');
var saveAs = require('file-saver');

var AsyncLoop = require('./modules/async-loop');
var convert = require('./modules/convert');
var Data = require('./modules/data');
var Messaging = require('./modules/messaging');
var Mutex = require('./modules/mutex');
var RenderManager = require('./modules/rendermanager');
var Status = require('./modules/status');
var Textures = require('./modules/textures');
var validate = require('./modules/validate');

/**
 * Acts as the intermediary for content script and background page
 * storage holding replay data and rendered webm movies. Also listens
 * for requests to initiate rendering.
 * 
 * This script is included as a background script.
 */

// Render manager.
var manager = new RenderManager();

// Ensure zipping and importing can't occur simultaneously.
var lock = new Mutex();

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

// Clone given object.
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function setDefaultTextures() {
    Textures.getDefault(function(textures) {
        // Use clone for same object, otherwise default_textures is
        // null.
        chrome.storage.local.set({
            textures: textures,
            default_textures: clone(textures)
        }, function() {
            if (chrome.runtime.lastError) {
                console.log("Error initializing textures " +
                    chrome.runtime.lastError);
            }
        });
    });
}

// Ensure textures are set.
chrome.storage.local.get(["default_textures", "textures"], function(items) {
    if (!items.textures || !items.default_textures) {
        setDefaultTextures();
    }
});

// Take certain actions when upgrading extension.
chrome.runtime.onInstalled.addListener(function (details) {
    var reason = details.reason;
    if (reason == "install") {
        // Install-specific actions.
        console.log("Initial install.");
    } else if (reason == "update") {
        var from = details.previousVersion;
        console.log("Upgrading from version %s.", from);
        if (cmp(from, '2.0.0') == -1) {
            setDefaultTextures();
        }
    }
});

/**
 * Where replay id, id of replay, and similar is used in the functions
 * below, assume that this refers to the id of the internal replay
 * info, which is what the UI uses to distinguish replays.
 */

/////////////////////////////
// Main recording function //
/////////////////////////////

/**
 * Takes replay data from recording script, crops it down to size,
 * and saves it to the database.
 * @param {object} message - Object with `data` property for the new
 *   replay.
 * @param {Function} callback - Callback takes boolean indicating
 *   error.
 */
Messaging.listen("saveReplay",
function(message, sender, sendResponse) {
    var replay = JSON.parse(message.data);
    // TODO: Validate replay. If invalid, save to other object store.
    var startFrame = findIndex(replay.data.time, function(t) {
        return t !== null;
    });
    if (startFrame == -1) {
        // No data captured.
        sendResponse({
            failed: true,
            reason: "No replay data captured."
        });
    } else {
        // Get first player frame.
        var playerStartFrame = findIndex(replay.data.players[replay.info.player].draw, function (d) {
            return d !== null;
        });
        if (playerStartFrame == -1) {
            sendResponse({
                failed: true,
                reason: "Error saving for specific player."
            });
        } else {
            startFrame = Math.max(startFrame, playerStartFrame);
            replay = Data.util.cropReplay(replay, startFrame, replay.data.time.length);
            Data.saveReplay(replay).then(function (info) {
                sendResponse({
                    failed: false
                });
                // Send new replay notification to any listening pages.
                Messaging.send("replayUpdated");
            }).catch(function (err) {
                console.error("Error saving replay: %o.", err);
                sendResponse({
                    failed: true
                });
            });
        }
    }
    return true;
});

///////////////////////
// Replay management //
///////////////////////

/**
 * Gets the list of replays for UI display.
 * @param {Function} callback - Function that handles the list of replays.
 */
Messaging.listen("getReplayList",
function(message, sender, sendResponse) {
    // Pause render manager so it doesn't interfere with list population.
    manager.pause();
    // Iterate over info data in database, accumulating into an array.
    // Send data back.
    Data.getReplayInfo(message).then(function (data) {
        manager.resume();
        sendResponse({
            data: data[1],
            total: data[0],
            filtered: data[0]
        });
    }).catch(function (err) {
        console.error("Could not retrieve list: %o.", err);
    });
    return true;
});

/**
 * Request for replay data. response should be a function that will
 * take an object with a `data` property which is the replay information.
 * @param {object} message - Should have a property `id` property corresponding
 *   to the replay data is being requested for.
 * @param {Function} callback - Function that takes the retrieved replay data.
 */
Messaging.listen("getReplay",
function(message, sender, sendResponse) {
    // Get replay.
    Data.getReplay(message.id).then(function (replay) {
        sendResponse({
            data: replay
        });
    }).catch(function (err) {
        console.error("Error retrieving replay: %o.", err);
    });
    return true;
});

/**
 * Delete a replay and all associated data.
 * @param {object} message - Object with property `id` or `ids` for
 *   single or multiple deletion, containing the id or array of ids of
 *   replays to be deleted.
 */
Messaging.listen(["deleteReplay", "deleteReplays"],
function(message, sender, sendResponse) {
    // Check if single or multiple replays and normalize.
    var ids = message.id ? [message.id] : message.ids;

    Data.deleteReplays(ids).then(function () {
        Messaging.send("replaysUpdated");
    }).catch(function (err) {
        console.error("Error deleting replays: %o.", err);
    });
});

/**
 * Renames a replay.
 * @param {object} message - Object with properties `id` and `name`
 *   giving the id of the replay to rename and the new name for it.
 * @param {Function} callback - ??
 */
Messaging.listen("renameReplay",
function(message, sender, sendResponse) {
    Data.renameReplay(message.id, message.name).then(function () {
        Messaging.send("replayUpdated");
    }).catch(function (err) {
        console.error("Error renaming replay: %o.", err);
    });
});

/**
 * Crops a replay and replaces it in the database.
 * @param {object} message - Has properties `id`, `start`, and `end`
 *   with the id of the replay, and the start and end frames to use.
 *   Optional `name` property which would be used in place of the
 *   original.
 * @param {Function} callback - ??
 */
Messaging.listen("cropAndReplaceReplay",
function(message, sender, sendResponse) {
    var request = {
        id: message.id,
        start: message.start,
        end: message.end,
        name: message.name
    };
    Data.cropAndSaveReplay(request).then(function (data) {
        var info = data[0];
        var replay = data[1];
        sendResponse({
            id: info.id,
            data: replay,
            failed: false
        });
        Messaging.send("replayUpdated");
    }).catch(function (err) {
        console.error("Error cropping and replacing replay: %o", err);
    });
    return true;
});

/**
 * Crop a replay and save it
 * @param {object} message - Has properties `id`, `start`, `end`, and
 *   (optionally) `name` for the id of the replay to crop, the start
 *   and end frames, and the new name to use. If the new name is not
 *   provided then the old name will be used (with ' (cropped)'
 *   appended).
 * @param {Function} callback - Takes the new replay data.
 */
Messaging.listen("cropReplay",
function(message, sender, sendResponse) {
    var request = {
        id: message.id,
        start: message.start,
        end: message.end,
        name: message.name
    };
    Data.cropAndSaveReplayAs(request).then(function (data) {
        var info = data[0];
        var replay = data[1];
        sendResponse({
            id: info.id,
            data: replay,
            failed: false
        });
        Messaging.send("replayUpdated");
    }).catch(function (err) {
        console.error("Error cropping and saving replay: %o", err);
    });
    return true;
});

/**
 * Initiates download of multiple replays as a zip file, or a single
 * replay as a json file.
 * @param {object} message - Object with `ids` property which is an
 *   array of ids of replays to download.
 */
Messaging.listen(["downloadReplay", "downloadReplays"],
function(message, sender, sendResponse) {
    function saveZip(zip) {
        var content = zip.generate({
            type: "blob",
            compression: "STORE"
        });
        saveAs(content, "replays.zip");
    }

    function resetDownload(err) {
        manager.resume();
        Status.reset();
        lock.release("replay_download");
        if (err) {
            sendResponse({
                failed: true,
                reason: err
            });
        } else {
            sendResponse({
                failed: false
            });
        }
    }

    lock.get("replay_download").then(function () {
        manager.pause();
        // Validate the number of replays.
        var ids = message.id ? [message.id] : message.ids;
        if (ids.length === 1) {
            // Single JSON file.
            var id = ids[0];
            Data.getReplay(id).then(function (data) {
                var blob = new Blob([JSON.stringify(data)],
                    { type: 'application/json' });
                var filename = sanitize(data.info.name);
                if (filename === "") {
                    filename = "replay";
                }
                saveAs(blob, filename + '.json');
                resetDownload();
            }).catch(function (err) {
                console.error("Error retrieving replay: %o.", err);
                resetDownload(err);
            });
        } else  if (ids.length !== 0) {
            Status.set("json_downloading");
            Messaging.send("alert", {
                blocking: true,
                message: "Initializing zip file generation..."
            });
            // Multiple replay files.
            var zip = new JSZip();
            var filenames = {};
            // Size of strings added to zip.
            var size = 0;
            // Stop length of stored data in single zip, ~100MB.
            var maxSize = 1024 * 1024 * 100;
            var files = 0;
            Data.forEachReplay(ids, function (data) {
                files++;
                Messaging.send("alert", {
                    blocking: true,
                    message: "Processing file " + files + " of " + ids.length + "..."
                });
                var name = data.info.name;
                var filename = sanitize(name);
                if (filename === "") {
                    filename = "replay";
                }
                // Handle duplicate replay names.
                if (filenames.hasOwnProperty(filename)) {
                    filename += " (" + (++filenames[filename]) + ")";
                } else {
                    filenames[filename] = 0;
                }
                var content = JSON.stringify(data);
                var contentSize = content.length;
                // If this results in a file that is too large, and there
                // is at least one other file.
                if (size !== 0 && size + contentSize > maxSize) {
                    // Alert browser that zip is being generated.
                    Messaging.send("alert", {
                        blocking: true,
                        message: "Zip file full, generating..."
                    });
                    saveZip(zip);
                    // Save.
                    size = 0;
                    zip = new JSZip();
                }
                size += content.length;
                zip.file(filename + ".json", content);
            }).then(function () {
                Messaging.send("alert", {
                    blocking: true,
                    message: "All replays processed, generating final zip file..."
                });
                saveZip(zip);
                Messaging.send("alert", {
                    hide: true,
                    blocking: true
                });
                resetDownload();
            }).catch(function (err) {
                Messaging.send("alert", {
                    blocking: true,
                    message: "Error downloading replay files: " + err.message
                });
                console.error("Error compiling raw replays into zip: %o.", err);
                resetDownload(err);
            });
        }
    }).catch(function () {
        sendResponse({
            failed: true,
            reason: "Background page busy."
        });
    });
    return true;
});

/**
 * Initiate download of a movie.
 * @param {object} message - Message with property `id` for the movie
 *   to download.
 */
Messaging.listen("downloadMovie",
function(message) {
    var id = message.id;
    Data.getMovie(id).then(function (file) {
        var movie = new Blob([file.data], { type: 'video/webm' });
        var filename = sanitize(file.name);
        if (filename === "") {
            filename = "replay";
        }
        saveAs(movie, filename + ".webm");
    }).catch(function (err) {
        console.error("Error retrieving movie for download: %o.", err);
    });
});

//////////////////////
// Replay rendering //
//////////////////////

/**
 * Retrieve the queue of rendering replays.
 */
Messaging.listen("getRenderList",
function(message, sender, sendResponse) {
    manager.getQueue(message).then(function (data) {
        sendResponse({
            data: data[1],
            total: data[0],
            filtered: data[0]
        });
    }).catch(function (err) {
        console.error("Error getting render list: %o.", err);
    });
    return true;
});

/**
 * Initial request to render replay into a movie.
 * @param {object} message - object with a property `id` which
 *   is an integer id of the replay to render.
 */
Messaging.listen(["renderReplay", "renderReplays"],
function(message) {
    var ids = message.id ? [message.id] : message.ids;
    console.log('Received request to render replay(s) ' + ids + '.');
    manager.add(ids).then(function () {
        Messaging.send("renderUpdated");
    }).catch(function (err) {
        console.error("Error adding replays to render queue: %o", err);
    });
});

/**
 * Cancel the rendering of one or more replays.
 */
Messaging.listen(["cancelRender", "cancelRenders"],
function(message) {
    var ids = message.id ? [message.id] : message.ids;
    manager.cancel(ids).then(function () {
        Messaging.send("rendersUpdated");
    }).catch(function (err) {
        console.error("Error cancelling renders: %o.", err);
    });
});

///////////////////
// Replay import //
///////////////////

var importLoop = null;
/**
 * Handle imported replay. Replay importing is done 
 * @param {object} message - Object with properties `data` and
 *   `filename` corresponding to the file data and contents.
 * @param {Function} callback - ??
 */
Messaging.listen(["importReplay", "importReplays"],
function(message, sender, sendResponse) {
    var files = Array.isArray(message) ? message
                                       : [message];
    console.groupCollapsed("Received %d replays for import.", files.length);
    importLoop = AsyncLoop(files).do(function (file, resolve, reject, cancelled) {
        if (cancelled()) { resolve(); return; }
        var name = file.filename;
        var replay;
        try {
            replay = JSON.parse(file.data);
        } catch (e) {
            var err = {
                name: name
            };
            if (e instanceof SyntaxError) {
                err.reason = "could not be parsed: " + e;
            } else {
                err.reason = "unknown error: " + e;
            }
            Messaging.send("importError", err);
            resolve();
            return;
        }
        console.log("Validating " + name + ".");
        // Validate replay.
        validate(replay).then(function(version) {
            if (cancelled()) { resolve(); return; }
            console.log(file.filename + " is a valid v" + version + " replay.");
            console.log("Applying necessary conversions...");
            var data = {
                data: replay,
                name: name
            };
            convert(data).then(function(data) {
                if (cancelled()) { resolve(); return; }
                // Retrieve converted replay.
                var replay = data.data;
                Data.saveReplay(replay).then(function (info) {
                    if (cancelled()) { resolve(); return; }
                    Messaging.send("importProgress");
                    resolve();
                }).catch(function (err) {
                    if (cancelled()) { resolve(); return; }
                    console.error("Error saving replay: %o.", err);
                    Messaging.send("importError", {
                        name: name,
                        reason: 'could not be saved: ' + err
                    });
                    resolve();
                });
            }).catch(function (err) {
                if (cancelled()) { resolve(); return; }
                console.error(err);
                Messaging.send("importError", {
                    name: name,
                    reason: "could not be converted: " + err
                });
                resolve();
            });
        }).catch(function (err) {
            if (cancelled()) { resolve(); return; }
            console.error(file.filename + " could not be validated!");
            console.error(err);
            Messaging.send("importError", {
                name: name,
                reason: 'could not be validated: ' + err
            });
            resolve();
        });
    }).then(function (results) {
        console.log("Finished importing replay set.");
        // Send new replay notification to any tabs that may have menu open.
        Messaging.send("replaysUpdated");
        console.groupEnd();
        importLoop = null;
        sendResponse();
    });

    return true;
});

function stopImport() {
    lock.release("import");
    Status.reset();
    if (importLoop) {
        importLoop.reject();
    }
    manager.resume();
    Messaging.send("replaysUpdated");
}

Messaging.listen("startImport",
function (message, sender, sendResponse) {
    lock.get("import").then(function () {
        manager.pause();
        Status.set("importing", function (err) {
            if (err) {
                sendResponse({
                    failed: true
                });
            } else {
                // Stop import if tab closes.
                sender.onDisconnect.addListener(stopImport);
                sendResponse({
                    failed: false
                });
            }
        });
    }).catch(function () {
        sendResponse({
            failed: true
        });
    });
    return true;
});

Messaging.listen(["endImport", "cancelImport"],
function (message, sender, sendResponse) {
    stopImport();
    sender.onDisconnect.removeListener(stopImport);
});

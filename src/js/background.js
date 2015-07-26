var JSZip = require('jszip');
var sanitize = require('sanitize-filename');
var saveAs = require('file-saver');

var Data = require('./modules/data');
var Messaging = require('./modules/messaging');
var RenderManager = require('./modules/rendermanager');
var Textures = require('./modules/textures');
var validate = require('./modules/validate');
var convert = require('./modules/convert');

/**
 * Acts as the intermediary for content script and background page
 * storage holding replay data and rendered webm movies. Also listens
 * for requests to initiate rendering.
 * 
 * This script is included as a background script.
 */

var manager = new RenderManager();

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

// Ensure textures are set.
chrome.storage.local.get(["default_textures", "textures"], function(items) {
    if (!items.textures || !items.default_textures) {
        Textures.getDefault(function(textures) {
            var default_textures = {};
            for (var t in textures) {
                default_textures[t] = textures[t];
            }
            chrome.storage.local.set({
                textures: textures,
                default_textures: default_textures
            }, function() {
                if (chrome.runtime.lastError) {
                    console.log("Error initializing textures " +
                        chrome.runtime.lastError);
                }
            });
        });
    }
});

/**
 * Functions wrapped in calls to Messaging.listen are invoked by calling
 * Messaging.send in content scripts with the string name of the function
 * and an optional message and callback.
 *
 * Where replay id, id of replay, and similar is used in
 * Messaging.listen functions, assume that this refers to the id of the
 * internal replay info, which is what the UI uses.
 */
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
        Messaging.send("replayDeleted", {
            id: request.id
        });
        Messaging.send("replayAdded", {
            data: info
        });
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
        Messaging.send("replayAdded", {
            data: info
        });
    }).catch(function (err) {
        console.error("Error cropping and saving replay: %o", err);
    });
    return true;
});

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
    var replay = message.data;
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
        return true;
    }
    replay = Data.util.cropReplay(replay, startFrame, replay.data.time.length);
    Data.saveReplay(replay).then(function (info) {
        sendResponse({
            failed: false
        });
        // Send new replay notification to any listening pages.
        Messaging.send("replayAdded", {
            data: info
        });
    }).catch(function (err) {
        console.error("Error saving replay: %o.", err);
        sendResponse({
            failed: true
        });
    });
    return true;
});

/**
 * Handle imported replay. Replay importing is done 
 * @param {object} message - Object with properties `data` and
 *   `filename` corresponding to the file data and contents.
 * @param {Function} callback - ??
 */
Messaging.listen("importReplay",
function(message, sender, sendResponse) {
    // TODO: Handle validating/converting imported replay.
    var replay = JSON.parse(message.data);
    console.log("Validating " + message.filename + ".");
    // Validate replay.
    validate(replay).then(function(version) {
        console.log(message.filename + " is a valid v" + version + " replay.");
        console.log("Applying necessary conversions...");
        var data = {
            data: replay,
            name: message.filename
        };
        convert(data).then(function(data) {
            // Retrieve converted replay.
            var replay = data.data;
            Data.saveReplay(replay).then(function (info) {
                sendResponse({ failed: false });
                // Send new replay notification to any tabs that may have menu open.
                Messaging.send("replayAdded", {
                    data: info
                });
            }).catch(function (err) {
                console.error("Error saving replay: %o.", err);
                sendResponse({ failed: true });
            });
        }).catch(function (err) {
            console.error(err);
            sendResponse({ failed: true });
        });
    }).catch(function (err) {
        console.error(message.filename + " could not be validated!");
        console.error(err);
        sendResponse({ failed: true });
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

    // Validate the number of replays.
    var ids = message.ids;
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
        }).catch(function (err) {
            console.error("Error retrieving replay: %o.", err);
        });
    } else  if (ids.length !== 0) {
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
        }).catch(function (err) {
            Messaging.send("alert", {
                blocking: true,
                message: "Error downloading replay files: " + err.message
            });
            console.error("Error compiling raw replays into zip: %o.", err);
        });
    }
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
        Messaging.send("replaysDeleted", {
            ids: ids
        });
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
        Messaging.send("replayRenamed", {
            id: message.id,
            name: message.name
        });
    }).catch(function (err) {
        console.error("Error renaming replay: %o.", err);
    });
});

/**
 * Initiate download of a movie.
 * @param {object} message - Message with property `id` for the movie
 *   to download.
 */
Messaging.listen("downloadMovie",
function(message, sender, sendResponse) {
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

/**
 * Initial request to render replay into a movie.
 * @param {object} message - object with a property `id` which
 *   is an integer id of the replay to render.
 */
Messaging.listen(["renderReplay", "renderReplays"],
function(message, sender, sendResponse) {
    var ids = message.id ? [message.id] : message.ids;
    console.log('Received request to render replay(s) ' + ids + '.');
    manager.add(ids).then(function () {
        Messaging.send("replayRenderAdded", {
            ids: ids
        });
    }).catch(function (err) {
        console.error("Error adding replays to render queue: %o", err);
    });
});

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
 * Cancel the rendering of one or more replays.
 */
Messaging.listen(["cancelRender", "cancelRenders"],
function(message, sender, sendResponse) {
    var ids = message.id ? [message.id] : message.ids;
    manager.cancel(ids).then(function () {
        Messaging.send("replayRenderCancelled", {
            ids: ids
        });
    }).catch(function (err) {
        console.error("Error cancelling renders: %o.", err);
    });
});

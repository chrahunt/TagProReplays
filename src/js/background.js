var async = require('async');
var cmp = require('semver-compare');
var JSZip = require('jszip');
var sanitize = require('sanitize-filename');
var saveAs = require('file-saver');
var logger = require('bragi-browser');

var convert = require('./modules/convert');
var Constraints = require('./modules/constraints');
var Data = require('./modules/data');
var fsm = require('./modules/state');
var Messaging = require('./modules/messaging');
var RenderManager = require('./modules/rendermanager');
var Status = require('./modules/status');
var Storage = require('./modules/storage');
var Textures = require('./modules/textures');
var validate = require('./modules/validate');
var Util = require('./modules/util');
var ZipFiles = require('./modules/zip-files');
var ready = require('./modules/subsystem').ready;

/**
 * Acts as the intermediary for content script and background page
 * storage holding replay data and rendered webm movies. Also listens
 * for requests to initiate rendering.
 * 
 * This script is included as a background script.
 */

// Render manager.
var manager = new RenderManager();

// Listen for extension upgrade.
chrome.runtime.onInstalled.addListener(function (details) {
    var reason = details.reason;
    if (reason == "install") {
        // Install-specific actions.
        console.log("Initial install.");
    } else if (reason == "update") {
        var prev = details.previousVersion;
        var current = chrome.runtime.getManifest().version;
        console.log("Upgrading from version %s.", prev);
        if (cmp(prev, current) === 0) {
            // Same, fired when reloading in development.
            console.log("Extension reloaded in dev.");
        } else if (cmp(prev, '2.0.0') == -1) {
            // TODO: Clear filesystem.
            // TODO: incorporate installer into fsm states.
            localStorage.clear();
            Storage.clear().then(function () {
                chrome.runtime.reload();
            }).catch(function (err) {
                console.warn("Error clearing storage: %o.", err);
                // TODO: handle.
            });
        }
    }
});

ready().then(function () {
    fsm.handle("ready");
}).catch(function (err) {
    // TODO: persist somewhere.
    console.error("Error in initialization: %o", err);
    fsm.handle("broken");
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
    var startFrame = Util.findIndex(replay.data.time, function(t) {
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
        var playerStartFrame = Util.findIndex(replay.data.players[replay.info.player].draw, function (d) {
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
 * @param {ReplaySelector} message - parameters for selecting replays.
 * @param {Function} callback - Function that handles the list of replays.
 */
Messaging.listen("getReplayList",
function(message, sender, sendResponse) {
    console.log("Received replay list request.");
    // Pause render manager so it doesn't interfere with list population.
    manager.pause();
    // Iterate over info data in database, accumulating into an array.
    // Send data back.
    Data.getReplayInfoList(message).then(function (data) {
        console.log("Sending replay list response.");
        manager.resume();
        sendResponse({
            data: data[1],
            total: data[0],
            filtered: data[0]
        });
    }).catch(function (err) {
        // TODO: Better error handling.
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

fsm.on("download-start", function () {
    manager.pause();
});

fsm.on("download-end", function () {
    manager.resume();
});

/**
 * Initiates download of multiple replays as a zip file, or a single
 * replay as a json file.
 * @param {object} message - Object with either `ids` (array of integer
 *   ids) or `id` (single integer id)
 */
Messaging.listen(["downloadReplay", "downloadReplays"],
function(message, sender, sendResponse) {
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
        }).catch(function (err) {
            console.error("Error retrieving replay: %o.", err);
        });
    } else {
        fsm.try("download-start").then(function () {
            
        }).catch(function () {
            sendResponse({
                failed: true,
                reason: "busy"
            });
        });
        lock.get("replay_download").then(function () {
            Status.set("json_downloading").then(function () {
                var zipfiles = new ZipFiles({
                    default_name: "replay",
                    zip_name: "replays"
                });
                zipfiles.on("generating_int_zip", function () {
                    Messaging.send("intermediateZipDownload");                    
                });
                zipfiles.on("generating_final_zip", function () {
                    Messaging.send("finalZipDownload");
                });
                var files = 0;
                zipfiles.on("file", function () {
                    files++;
                    Messaging.send("zipProgress", {
                        total: ids.length,
                        current: files
                    });
                    // TODO: Alert about file processing.
                });
                // Reset download state.
                zipfiles.on("end", function () {
                    manager.resume();
                    Status.reset().then(function () {
                        lock.release("replay_download");
                    }).catch(function (err) {
                        console.error("Error resetting status: %o.", err);
                    });
                });
                Data.forEachReplay(ids, function (data) {
                    zipfiles.addFile({
                        filename: data.info.name,
                        ext: "json",
                        contents: JSON.stringify(data)
                    });
                }).then(function () {
                    zipfiles.done();
                }).catch(function (err) {
                    // TODO: Send message about failure.
                    Messaging.send("downloadError", err);
                    // err.message
                    console.error("Error compiling raw replays into zip: %o.", err);
                    zipfiles.done(true);
                });
            });
        })
    }
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

/**
 * Get the number of replays currently saved.
 */
Messaging.listen("getNumReplays",
function(message, sender, sendResponse) {
    Data.getDatabaseInfo().then(function (info) {
        sendResponse(info);
    }).catch(function (err) {
        console.error("Error retrieving movie for download: %o.", err);
    });
    return true;
});

////////////////////
// Failed replays //
////////////////////

Messaging.listen("failedReplaysExist",
function(message, sender, sendResponse) {
    Data.failedReplaysExist().then(function (b) {
        sendResponse(b);
    }).catch(function (err) {
        console.warn("Error retrieving failed replays: %o.", err);
    });
    return true;
});

Messaging.listen("getFailedReplayList",
function(message, sender, sendResponse) {
    Data.getFailedReplayInfoList(message).then(function (data) {
        sendResponse({
            data: data[1],
            total: data[0],
            filtered: data[0]
        });
    }).catch(function (err) {
        console.error("Error getting failed replay list: %o.", err);
    });
    return true;
});

Messaging.listen(["deleteFailedReplay", "deleteFailedReplays"],
function(message, sender, sendResponse) {
    // Check if single or multiple replays and normalize.
    var ids = message.id ? [message.id] : message.ids;

    Data.deleteFailedReplays(ids).then(function () {
        Messaging.send("failedReplaysUpdated");
    }).catch(function (err) {
        console.error("Error deleting failed replays: %o.", err);
    });
});

Messaging.listen(["downloadFailedReplay", "downloadFailedReplays"],
function(message, sender, sendResponse) {
    console.log("Attempted download of failed replays.");
    // Validate the number of replays.
    var ids = message.id ? [message.id] : message.ids;
    lock.get("failed.replay_download").then(function () {
        manager.pause();
        Status.set("failed.json_downloading").then(function () {
            var zipfiles = new ZipFiles({
                default_name: "failed_replay",
                zip_name: "failed_replays"
            });
            
            // Total file download counter.
            var files = 0;
            zipfiles.on("file", function () {
                files++;
                Messaging.send("failed.zipProgress", {
                    total: ids.length,
                    current: files
                });
                // TODO: Alert about file processing.
            });
            // Reset download state.
            zipfiles.on("end", function () {
                manager.resume();
                Status.reset().then(function () {
                    lock.release("failed.replay_download");
                }).catch(function (err) {
                    console.error("Error resetting status: %o.", err);
                });
            });

            // Hold array of reasons for set of files.
            var reasons = [];
            function addReasons() {
                var text = reasons.map(function (info) {
                    return info.name + " (" + info.failure_type + ") [" + info.timestamp + "]: " + info.message;
                }).join("\n");
                zipfiles.addFile({
                    filename: "failure_info",
                    ext: "txt",
                    contents: text
                });
                reasons = [];
            }
            zipfiles.on("generating_int_zip", function () {
                Messaging.send("failed.intermediateZipDownload");
                // Add text file with reasons to zip file.
                addReasons();
            });
            zipfiles.on("generating_final_zip", function () {
                Messaging.send("failed.finalZipDownload");
                addReasons();
            });
            // Get information for each failed replay downloading.
            return Data.getFailedReplayInfoById(ids).then(function (info) {
                return Data.forEachFailedReplay(ids, function (data, id) {
                    reasons.push(info[id]);
                    zipfiles.addFile({
                        filename: data.name,
                        ext: "json",
                        contents: data.data
                    });
                });
            }).then(function () {
                zipfiles.done();
            }).catch(function (err) {
                // TODO: Send message about failure.
                Messaging.send("failed.downloadError", err);
                // err.message
                console.error("Error compiling raw replays into zip: %o.", err);
                zipfiles.done(true);
            });
        });
    }).catch(function () {
        sendResponse({
            failed: true,
            reason: "Background page busy."
        });
    });
    return true;
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
        Messaging.send("replayUpdated");
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
        Messaging.send("replaysUpdated");
    }).catch(function (err) {
        console.error("Error cancelling renders: %o.", err);
    });
});

///////////////////
// Replay import //
///////////////////

/*
 * Replay importing is orchestrated by the initiating tab. The tab calls
 * `startImport` which tries to lock the background page and also sets
 * the extension status so the menu on all tabs will reflect import progress.
 * Importing is then carried out by calling `importReplay`/`importReplays` with
 * one or multiple replay files, which are just objects containing filename and
 * data attributes.
 */

/**
 * @typedef {object} ReplayData
 * @property {string} filename - The name of the file being imported.
 * @property {string} data - The text of the file.
 */

var importing = false;

fsm.on("import-start", function () {
    manager.pause();
    importing = true;
});

fsm.on("import-end", function () {
    manager.resume();
    importing = false;
});

function stopImport() {
    fsm.handle("import-end");
}

/**
 * Used by tab to initiate importing.
 * @param {object} message - object with properties `total` and `size`
 *   with values indicating the total of each for this batch of files.
 */
Messaging.listen("startImport",
function (message, sender, sendResponse) {
    fsm.try("import-start").then(function () {
        Data.getDatabaseInfo().then(function (info) {
            if (info.replays + message.total > Constraints.max_replays_in_database) {
                sendResponse({
                    failed: true,
                    type: "db_full"
                });
                fsm.handle("import-end");
            } else {
                // Stop import if tab closes.
                sender.onDisconnect.addListener(stopImport);
                sendResponse({
                    failed: false
                });
            }
        }).catch(function (err) {
            sendResponse({
                failed: true,
                type: "internal"
            });
            console.error("Internal error: Cannot retrieving replay database information: %o.", err);
            fsm.handle("import-end");
        });
    }).catch(function () {
        sendResponse({
            failed: true,
            type: "busy"
        });
    });
    return true;
});

Messaging.listen(["endImport", "cancelImport"],
function (message, sender, sendResponse) {
    stopImport();
    sender.onDisconnect.removeListener(stopImport);
});

/**
 * Actually import replay(s) in a loop. Send progress updates to any listening tabs.
 * @param {(ReplayData|Array<ReplayData>)} message - the replays to import.
 * @param {Function} sendResponse - callback to inform receiving tab of completion.
 */
Messaging.listen(["importReplay", "importReplays"],
function(message, sender, sendResponse) {
    var files = Array.isArray(message) ? message
                                       : [message];
    console.groupCollapsed("Received %d replays for import.", files.length);
    async.each(files, function (file, callback) {
        if (!importing) { callback("cancelled"); return; }
        try {
            var name = file.filename;
            var replay = JSON.parse(file.data);
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
            callback();
            return;
        }
        console.log("Validating " + name + ".");
        // Validate replay.
        var result = validate(replay);
        if (result.valid) {
            var version = result.version;
            console.log(file.filename + " is a valid v" + version + " replay."); // DEBUG
            console.log("Applying necessary conversions..."); // DEBUG
            var data = {
                data: replay,
                name: name
            };
            try {
                var converted = convert(data);
                var converted_replay_data = converted.data;
                Data.saveReplay(converted_replay_data).then(function (info) {
                    if (!importing) { callback("cancelled"); return; }
                    Messaging.send("importProgress");
                    callback();
                }).catch(function (err) {
                    if (!importing) { callback("cancelled"); return; }
                    console.error("Error saving replay: %o.", err);
                    Messaging.send("importError", {
                        name: name,
                        reason: 'could not be saved: ' + err
                    });
                    callback();
                });
            } catch (e) {
                console.error(e);
                Messaging.send("importError", {
                    name: name,
                    reason: "could not be converted: " + e.message
                });
                callback();
            }
        } else {
            console.error(file.filename + " could not be validated!");
            console.error(err);
            Messaging.send("importError", {
                name: name,
                reason: 'could not be validated: ' + err
            });
            callback();
        }
    }, function (err) {
        if (err === null) {
            console.log("Finished importing replay set.");
        } else {
            console.log("Encountered error importing replays: %o", err);
        }
        // Send new replay notification to any tabs that may have menu open.
        Messaging.send("replaysUpdated");
        console.groupEnd();
        sendResponse();
    });

    return true;
});

// Maps Error stacks to source.
require('source-map-support').install({
  handleUncaughtExceptions: false
});

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
var fs = require('./modules/filesystem');
var Messaging = require('./modules/messaging');
var RenderManager = require('./modules/rendermanager');
var Status = require('./modules/status');
var Storage = require('./modules/storage');
var Textures = require('./modules/textures');
var validate = require('./modules/validate');
var ZipFiles = require('./modules/zip-files');
var Subsystems = require('./modules/subsystem');

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
chrome.runtime.onInstalled.addListener((details) => {
  var reason = details.reason;
  if (reason == "install") {
      // Install-specific actions.
    logger.info("Initial install.");
  } else if (reason == "update") {
    var prev = details.previousVersion;
    var current = chrome.runtime.getManifest().version;
    logger.info(`Upgrading from version ${prev}.`);
    if (cmp(prev, current) === 0) {
      // Same, fired when reloading in development.
      logger.info("Extension reloaded in dev.");
    } else if (cmp(prev, '2.0.0') == -1) {
      // TODO: Clear filesystem.
      // TODO: incorporate installer into fsm states.
      localStorage.clear();
      Storage.clear().then(() => {
        chrome.runtime.reload();
      }).catch((err) => {
        logger.warn("Error clearing storage: %o.", err);
        // TODO: handle.
      });
    }
  }
});

// Browser action and listen for button.
chrome.browserAction.onClicked.addListener(route);

Messaging.listen("openMenu", route);

var menu_tab = null;
// Set router for menu page.
function route() {
  if (menu_tab === null) {
    // Create new page and give it focus.
    chrome.tabs.create({
      url: chrome.runtime.getURL("main.html")
    }, (tab) => {
      logger.info("Created menu tab.");
    });
  } else {
    chrome.tabs.get(menu_tab, (tab) => {
      chrome.tabs.update(menu_tab, {
        active: true
      });
      chrome.windows.update(tab.windowId, {
        focused: true
      });
    });
    // TODO: make sure window is set
    // https://developer.chrome.com/extensions/windows#current-window
  }
}

Messaging.on("connect", (sender) => {
  if (!sender.tab || !sender.url) {
    logger.warn("Sender does not have required info.");
    return;
  }
  var url = sender.url;
  var tab = sender.tab;
  if (url.indexOf(chrome.runtime.getURL("main.html")) === 0) {
    menu_tab = tab.id;
    // Assuming only 1 tab connects.
    manager.pause();
  }
});

Messaging.on("disconnect", (sender) => {
  if (sender.tab.id === menu_tab) {
    menu_tab = null;
    manager.resume();
  }
});

// Subsystem initialization.
Subsystems.add("validate", validate.ready);
Subsystems.add("filesystem", fs.ready);
Subsystems.add("textures", Textures.ready);

Subsystems.init().catch((err) => {
  // TODO: persist somewhere.
  logger.error("Error in initialization: %o", err);
  fsm.handle("subsystem-fail");
}).then(() => {
  logger.log("Subsystems initialized.")
  return Data.init();
});

Data.events.on("db:upgrade", () => {
  fsm.handle("db-migrate");
});

Data.events.on("db:upgrade:progress", (e) => {
  Messaging.send("upgradeProgress", e);
});

Data.events.on("db:open", () => {
  fsm.handle("db-open");
});

Data.events.on("db:err", (e) => {
  logger.error("DB error: %O", e);
  fsm.handle("db-error");
});

Data.events.on("db:err:upgrade", (e) => {
  logger.error("DB upgrade error: %O", e);
  fsm.handle("db-migrate-err");
});

/**
 * Where replay id, id of replay, and similar is used in the functions
 * below, assume that this refers to the id of the internal replay
 * info, which is what the UI uses to distinguish replays.
 */

// ============================================================================
// Main recording function
// ============================================================================

/**
 * Takes replay data from recording script, crops it down to size,
 * and saves it to the database.
 * @param {object} message - Object with `data` property for the new
 *   replay.
 * @param {Function} callback - Callback takes boolean indicating
 *   error.
 */
Messaging.listen("saveReplay", (message, sender, sendResponse) => {
  var replay = JSON.parse(message.data);
  // TODO: Validate replay. If invalid, save to other object store.
  var startFrame = replay.data.time.findIndex(
    (t) => t !== null);
  if (startFrame == -1) {
    // No data captured.
    sendResponse({
      failed: true,
      reason: "No replay data captured."
    });
  } else {
    // Get first player frame.
    var mainPlayer = replay.data.players[replay.info.player];
    var playerStartFrame = mainPlayer.draw.findIndex(
      (d) => d !== null);
    if (playerStartFrame == -1) {
      sendResponse({
        failed: true,
        reason: "Error saving for specific player."
      });
    } else {
      startFrame = Math.max(startFrame, playerStartFrame);
      replay = Data.util.cropReplay(replay, startFrame, replay.data.time.length);
      Data.saveReplay(replay).then((info) => {
        sendResponse({
          failed: false
        });
        // Send new replay notification to any listening pages.
        Messaging.send("replayUpdated");
      }).catch((err) => {
        logger.error("Error saving replay: %o.", err);
        sendResponse({
          failed: true
        });
      });
    }
  }
  return true;
});

// ============================================================================
// Replay management
// ============================================================================

/**
 * Crops a replay and replaces it in the database.
 * @param {object} message - Has properties `id`, `start`, and `end`
 *   with the id of the replay, and the start and end frames to use.
 *   Optional `name` property which would be used in place of the
 *   original.
 * @param {Function} callback - ??
 */
Messaging.listen("cropAndReplaceReplay", (message, sender, sendResponse) => {
  var request = {
    id: message.id,
    start: message.start,
    end: message.end,
    name: message.name
  };
  Data.cropAndSaveReplay(request).then((data) => {
    var info = data[0];
    var replay = data[1];
    sendResponse({
      id: info.id,
      data: replay,
      failed: false
    });
    Messaging.send("replayUpdated");
  }).catch((err) => {
    logger.error("Error cropping and replacing replay: %o", err);
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
Messaging.listen("cropReplay", (message, sender, sendResponse) => {
  var request = {
    id: message.id,
    start: message.start,
    end: message.end,
    name: message.name
  };
  Data.cropAndSaveReplayAs(request).then((data) => {
    var info = data[0];
    var replay = data[1];
    sendResponse({
      id: info.id,
      data: replay,
      failed: false
    });
    Messaging.send("replayUpdated");
  }).catch((err) => {
    logger.error("Error cropping and saving replay: %o", err);
  });
  return true;
});

fsm.on("download-start", () => {
  manager.pause();
});

fsm.on("download-end", () => {
  manager.resume();
});

/**
 * Initiates download of multiple replays as a zip file, or a single
 * replay as a json file.
 * @param {object} message - Object with either `ids` (array of integer
 *   ids) or `id` (single integer id)
 */
Messaging.listen(["downloadReplay", "downloadReplays"],
(message, sender, sendResponse) => {
  var ids = message.id ? [message.id] : message.ids;
  if (ids.length === 1) {
    // Single JSON file.
    var id = ids[0];
    Data.getReplay(id).then((data) => {
      var blob = new Blob([JSON.stringify(data)],
                { type: 'application/json' });
      var filename = sanitize(data.info.name);
      if (filename === "") {
        filename = "replay";
      }
      saveAs(blob, `${filename}.json`);
    }).catch((err) => {
      logger.error("Error retrieving replay: %o.", err);
    });
  } else {
    fsm.try("download-start").then(() => {

    }).catch(() => {
      sendResponse({
        failed: true,
        reason: "busy"
      });
    });
    lock.get("replay_download").then(() => {
      Status.set("json_downloading").then(() => {
        var zipfiles = new ZipFiles({
          default_name: "replay",
          zip_name: "replays"
        });
        zipfiles.on("generating_int_zip", () => {
          Messaging.send("intermediateZipDownload");
        });
        zipfiles.on("generating_final_zip", () => {
          Messaging.send("finalZipDownload");
        });
        var files = 0;
        zipfiles.on("file", () => {
          files++;
          Messaging.send("zipProgress", {
            total: ids.length,
            current: files
          });
          // TODO: Alert about file processing.
        });
        // Reset download state.
        zipfiles.on("end", () => {
          manager.resume();
          Status.reset().then(() => {
            lock.release("replay_download");
          }).catch((err) => {
            logger.error("Error resetting status: %o.", err);
          });
        });
        Data.forEachReplay(ids, (data) => {
          zipfiles.addFile({
            filename: data.info.name,
            ext: "json",
            contents: JSON.stringify(data)
          });
        }).then(() => {
          zipfiles.done();
        }).catch((err) => {
          // TODO: Send message about failure.
          Messaging.send("downloadError", err);
          // err.message
          logger.error("Error compiling raw replays into zip: %o.", err);
          zipfiles.done(true);
        });
      });
    })
  }
  return true;
});

/**
 * Get the number of replays currently saved.
 */
Messaging.listen("getNumReplays",
(message, sender, sendResponse) => {
  Data.getDatabaseInfo().then((info) => {
    sendResponse(info);
  }).catch((err) => {
    logger.error("Error retrieving movie for download: %o.", err);
  });
  return true;
});

// ============================================================================
// Failed replays
// ============================================================================

Messaging.listen("failedReplaysExist",
(message, sender, sendResponse) => {
  Data.failedReplaysExist().then((b) => {
    sendResponse(b);
  }).catch((err) => {
    logger.warn("Error retrieving failed replays: %o.", err);
  });
  return true;
});

Messaging.listen("getFailedReplayList",
(message, sender, sendResponse) => {
  Data.getFailedReplayInfoList(message).then((data) => {
    sendResponse({
      data: data[1],
      total: data[0],
      filtered: data[0]
    });
  }).catch((err) => {
    logger.error("Error getting failed replay list: %o.", err);
  });
  return true;
});

Messaging.listen(["deleteFailedReplay", "deleteFailedReplays"],
(message) => {
  // Check if single or multiple replays and normalize.
  var ids = message.id ? [message.id] : message.ids;

  Data.deleteFailedReplays(ids).then(() => {
    Messaging.send("failedReplaysUpdated");
  }).catch((err) => {
    logger.error("Error deleting failed replays: %o.", err);
  });
});

Messaging.listen(["downloadFailedReplay", "downloadFailedReplays"],
(message, sender, sendResponse) => {
  logger.log("Attempted download of failed replays.");
  // Validate the number of replays.
  var ids = message.id ? [message.id] : message.ids;
  lock.get("failed.replay_download").then(() => {
    manager.pause();
    Status.set("failed.json_downloading").then(() => {
      var zipfiles = new ZipFiles({
        default_name: "failed_replay",
        zip_name: "failed_replays"
      });

      // Total file download counter.
      var files = 0;
      zipfiles.on("file", () => {
        files++;
        Messaging.send("failed.zipProgress", {
          total: ids.length,
          current: files
        });
        // TODO: Alert about file processing.
      });
      // Reset download state.
      zipfiles.on("end", () => {
        manager.resume();
        Status.reset().then(() => {
          lock.release("failed.replay_download");
        }).catch((err) => {
          logger.error("Error resetting status: %o.", err);
        });
      });

      // Hold array of reasons for set of files.
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
      zipfiles.on("generating_int_zip", () => {
        Messaging.send("failed.intermediateZipDownload");
        // Add text file with reasons to zip file.
        addReasons();
      });
      zipfiles.on("generating_final_zip", () => {
        Messaging.send("failed.finalZipDownload");
        addReasons();
      });
      // Get information for each failed replay downloading.
      return Data.getFailedReplayInfoById(ids).then((info) => {
        return Data.forEachFailedReplay(ids, (data, id) => {
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
        Messaging.send("failed.downloadError", err);
        // err.message
        logger.error("Error compiling raw replays into zip: %o.", err);
        zipfiles.done(true);
      });
    });
  }).catch(() => {
    sendResponse({
      failed: true,
      reason: "Background page busy."
    });
  });
  return true;
});

// ============================================================================
// Replay rendering
// ============================================================================

/**
 * Retrieve the queue of rendering replays.
 */
Messaging.listen("getRenderList", (message, sender, sendResponse) => {
  manager.getQueue(message).then((data) => {
    sendResponse({
      data: data[1],
      total: data[0],
      filtered: data[0]
    });
  }).catch((err) => {
    logger.error("Error getting render list: %o.", err);
  });
  return true;
});

/**
 * Initial request to render replay into a movie.
 * @param {object} message - object with a property `id` which
 *   is an integer id of the replay to render.
 */
Messaging.listen(["renderReplay", "renderReplays"], (message) => {
  var ids = message.id ? [message.id] : message.ids;
  logger.info('Received request to render replay(s) ' + ids + '.');
  manager.add(ids).then(() => {
    Messaging.send("renderUpdated");
    Messaging.send("replayUpdated");
  }).catch((err) => {
    logger.error("Error adding replays to render queue: %o", err);
  });
});

/**
 * Cancel the rendering of one or more replays.
 */
Messaging.listen(["cancelRender", "cancelRenders"],
(message, sender, sendResponse) => {
  var ids = message.id ? [message.id] : message.ids;
  manager.cancel(ids).then(() => {
    Messaging.send("rendersUpdated");
    Messaging.send("replaysUpdated");
    sendResponse();
  }).catch((err) => {
    logger.error("Error cancelling renders: %o.", err);
    sendResponse(err);
  });
  return true;
});

// ============================================================================
// Replay import
// ============================================================================

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

fsm.on("import-start", () => {
  logger.debug("Setting import-start.");
  manager.pause();
  importing = true;
});

fsm.on("import-end", () => {
  logger.debug("Setting import-end.");
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
Messaging.listen("startImport", (message, sender, sendResponse) => {
  logger.debug("Tab trying to start import.");
  fsm.try("import-start").then(() => {
    logger.info("Starting import.");
    Data.getDatabaseInfo().then((info) => {
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
    }).catch((err) => {
      sendResponse({
        failed: true,
        type: "internal"
      });
      logger.error(
        "Cannot retrieving replay database information: %o.", err);
      fsm.handle("import-end");
    });
  }).catch((err) => {
    logger.error("Can't start import.");
    logger.error(err);
    sendResponse({
      failed: true,
      type: "busy"
    });
  });
  return true;
});

Messaging.listen(["endImport", "cancelImport"],
(message, sender) => {
  stopImport();
  sender.onDisconnect.removeListener(stopImport);
});

/**
 * Actually import replay(s) in a loop. Send progress updates to any listening
 * tabs.
 * @param {(ReplayData|Array<ReplayData>)} message - the replays to import.
 * @param {Function} sendResponse - callback to inform receiving tab of
 *   completion.
 */
Messaging.listen(["importReplay", "importReplays"],
(message, sender, sendResponse) => {
  var files = Array.isArray(message) ? message
                                     : [message];
  logger.info(`Received ${files.length} replays for import.`);
  async.each(files, (file, callback) => {
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
    logger.debug(`Validating ${name}.`);
    // Validate replay.
    var result = validate(replay);
    if (result.valid) {
      var version = result.version;
      logger.debug(`${file.filename} is a valid v${version} replay.`);
      logger.debug("Applying necessary conversions...");
      var data = {
        data: replay,
        name: name
      };
      try {
        var converted = convert(data);
        var converted_replay_data = converted.data;
        Data.saveReplay(converted_replay_data).then((info) => {
          if (!importing) { callback("cancelled"); return; }
          Messaging.send("importProgress");
          callback();
        }).catch((err) => {
          if (!importing) { callback("cancelled"); return; }
          logger.error("Error saving replay: %o.", err);
          Messaging.send("importError", {
            name: name,
            reason: 'could not be saved: ' + err
          });
          callback();
        });
      } catch (e) {
        logger.error(e);
        Messaging.send("importError", {
          name: name,
          reason: `could not be converted: ${e.message}`
        });
        callback();
      }
    } else {
      logger.error(`${file.filename} could not be validated!`);
      logger.error(err);
      Messaging.send("importError", {
        name: name,
        reason: 'could not be validated: ' + err
      });
      callback();
    }
  }, (err) => {
    if (err === null) {
      logger.debug("Finished importing replay set.");
    } else {
      logger.error("Encountered error importing replays: %O", err);
    }
    // Send new replay notification to any tabs that may have menu open.
    Messaging.send("replaysUpdated");
    sendResponse();
  });

  return true;
});

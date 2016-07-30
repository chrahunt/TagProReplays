// Maps Error stacks to source.
require('source-map-support').install({
  handleUncaughtExceptions: false
});

var cmp = require('semver-compare');
var sanitize = require('sanitize-filename');
var saveAs = require('file-saver');

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

var logger = require('./modules/logger')('background');

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
  logger.error("Error in initialization.");
  logger.error(err);
  fsm.handle("subsystem-fail");
}).then(() => {
  logger.info("Subsystems initialized.")
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
  logger.info("Attempted download of failed replays.");
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

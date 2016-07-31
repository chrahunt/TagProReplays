// Maps Error stacks to source.
require('source-map-support').install({
  handleUncaughtExceptions: false
});

var cmp = require('semver-compare');

var Data = require('./modules/data');
var fsm = require('./modules/state');
var fs = require('./modules/filesystem');
var Messaging = require('./modules/messaging');
var RenderManager = require('./modules/rendermanager');
var Storage = require('./modules/storage');
var Textures = require('./modules/textures');
var validate = require('./modules/validate');
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
        logger.warn("Error clearing storage: ", err);
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
// TODO: Use this as an indicator that someone is trying to access
// the main page and pause rendering in advance.
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
  logger.error("DB error: ", e);
  fsm.handle("db-error");
});

Data.events.on("db:err:upgrade", (e) => {
  logger.error("DB upgrade error: ", e);
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
Messaging.listen("saveReplay", (message) => {
  var replay = JSON.parse(message.data);
  // TODO: Validate replay. If invalid, save to other object store.
  var startFrame = replay.data.time.findIndex(
    (t) => t !== null);
  if (startFrame == -1) {
    // No data captured.
    return Promise.reject(new Error("No replay data captured."));
  } else {
    // Get first player frame.
    var mainPlayer = replay.data.players[replay.info.player];
    var playerStartFrame = mainPlayer.draw.findIndex(
      (d) => d !== null);
    if (playerStartFrame == -1) {
      return Promise.reject(new Error("Error saving for specific player."));
    } else {
      startFrame = Math.max(startFrame, playerStartFrame);
      replay = Data.util.cropReplay(replay, startFrame, replay.data.time.length);
      return Data.saveReplay(replay).then((info) => {
        // Send new replay notification to any listening pages.
        Messaging.send("replays.update");
      }).catch((err) => {
        logger.error("Error saving replay: ", err);
        throw err;
      });
    }
  }
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
    Messaging.send("replays.update");
  }).catch((err) => {
    logger.error("Error cropping and replacing replay: ", err);
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
    Messaging.send("replays.update");
  }).catch((err) => {
    logger.error("Error cropping and saving replay: ", err);
  });
  return true;
});

// ============================================================================
// Replay rendering
// ============================================================================

/**
 * Retrieve the queue of rendering replays.
 */
Messaging.listen('renders.query', (message) => {
  return manager.getQueue(message).then((data) => {
    return {
      data: data[1],
      total: data[0]
    };
  }).catch((err) => {
    logger.error("Error getting render list: ", err);
    // Re-throw, let the Messenger handle it.
    throw err;
  });
});

/**
 * Initial request to render replay into a movie.
 * @param {object} message - object with a property `ids` which
 *   is an integer id of the replay to render.
 */
Messaging.listen('renders.add', (message) => {
  var ids = message.ids;
  logger.info('Received request to render replay(s) ' + ids + '.');
  return manager.add(ids).then(() => {
    Messaging.send("renders.update");
    Messaging.send("replays.update");
  }).catch((err) => {
    logger.error("Error adding replays to render queue: ", err);
    throw err;
  });
});

/**
 * Cancel the rendering of one or more replays.
 */
Messaging.listen('renders.cancel', (message) => {
  var ids = message.ids;
  return manager.cancel(ids).then(() => {
    Messaging.send("renders.update");
    Messaging.send("replays.update");
  }).catch((err) => {
    logger.error("Error cancelling renders: ", err);
    throw err;
  });
});

// Testing.
Messaging.listen('test.error', () => {
  return Promise.reject(new Error("Test"));
});

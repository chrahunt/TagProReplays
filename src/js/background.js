const semver = require('semver');
require('chrome-storage-promise');

const logger = require('./modules/logger')('background');
const fs = require('./modules/filesystem');
const Renderer = require('./modules/renderer');
const Textures = require('./modules/textures');
const Whammy = require('./modules/whammy');

logger.info('Starting background page.');

Textures.ready().then(() => {
  logger.info('Textures ready.');
});

let tileSize = 40;

let can = document.createElement('canvas');
can.id = 'mapCanvas';
document.body.appendChild(can);

can = document.getElementById('mapCanvas');
can.width = localStorage.getItem('canvasWidth') || 32 * tileSize;
can.height = localStorage.getItem('canvasHeight') || 20 * tileSize;
can.style.zIndex = 200;
can.style.position = 'absolute';
can.style.top = 0;
can.style.left = 0;

let context = can.getContext('2d');

// This function opens a download dialog
function saveVideoData(name, data) {
  var file = data;
  var a = document.createElement('a');
  a.download = name;
  a.href = (window.URL || window.webkitURL).createObjectURL(file);
  var event = document.createEvent('MouseEvents');
  event.initEvent('click', true, false);
  a.dispatchEvent(event);
  (window.URL || window.webkitURL).revokeObjectURL(a.href);
}

// Function to test integrity of position data before attempting to render
// Returns false if a vital piece is missing, true if no problems were found
// Currently does not do a very thorough test
function checkData(positions) {
  const props = ["chat", "splats", "bombs", "spawns", "map", "wallMap", "floorTiles", "score", "gameEndsAt", "clock", "tiles"];
  for (let prop of props) {
    if (!positions[prop]) {
      return false;
    }
  }
  if (positions.map.length == 0 || positions.wallMap.length == 0 || positions.clock.length == 0) {
    return false;
  }

  return Object.keys(positions).some(k => k.startsWith('player'));
}

// Actually does the rendering of the movie 
function renderVideo(positions, name, options, lastOne, replaysToRender, replayI, tabNum) {
  positions = JSON.parse(positions);

  // check position data and abort rendering if not good
  if (!checkData(positions)) {
    if (lastOne) {
      chrome.tabs.sendMessage(tabNum, {
        method: "movieRenderConfirmation"
      });
    } else {
      chrome.tabs.sendMessage(tabNum, {
        method: "movieRenderConfirmationNotLastOne",
        replaysToRender: replaysToRender,
        replayI: replayI,
        failure: true,
        name: name
      });
    }
    logger.warn(`${name} was a bad replay.`);
    return;
  }
  
  let renderer = new Renderer(can, positions, options);
  let me = Object.keys(positions).find(k => positions[k].me == 'me');
  let fps = positions[me].fps;
  var encoder = new Whammy.Video(fps);

  renderer.ready().then(() => {
    chrome.tabs.sendMessage(tabNum, {
      method: "progressBarCreate",
      name: name
    });
    for (let thisI = 0; thisI < positions.clock.length; thisI++) {
      if (thisI / Math.round(positions.clock.length / 100) % 1 == 0) {
        chrome.tabs.sendMessage(tabNum, {
          method: "progressBarUpdate",
          progress: thisI / positions.clock.length,
          name: name
        })
      }
      renderer.draw(thisI);
      encoder.add(context)
    }

    let output = encoder.compile()
    let filename = name.replace(/.*DATE/, '').replace('replays', '');
    fs.saveFile(`savedMovies/${filename}`, output).catch((err) => {
      logger.error('Error saving render: ', err);
    });
    if (lastOne) {
      chrome.tabs.sendMessage(tabNum, {
        method: "movieRenderConfirmation"
      });
    } else {
      chrome.tabs.sendMessage(tabNum, {
        method: "movieRenderConfirmationNotLastOne",
        replaysToRender: replaysToRender,
        replayI: replayI
      })
    }
  });
}

// this is a function to get all the keys in the object store
//   It also gets the list of names of rendered movies
//   It sends a message to the content script once it gets the keys and movie names
//   It also sends custom texture files as well.
function listItems() {
  var allKeys = [];
  var allMetaData = [];
  var transaction = db.transaction(["positions"], "readonly");
  var store = transaction.objectStore("positions");
  var request = store.openCursor(null);
  request.onsuccess = function () {
    if (request.result) {
      var metadata = localStorage.getItem(request.result.key);
      if (!metadata || !JSON.parse(metadata) || typeof JSON.parse(metadata).map === 'undefined') {
        if (request.result.value === undefined || request.result.value === "undefined") {
          var metadata = extractMetaData(null);
        } else {
          try {
            var data = JSON.parse(request.result.value);
            var metadata = extractMetaData(data);
          } catch (err) {
            var metadata = extractMetaData(null);
          }
        }
        localStorage.setItem(request.result.key, JSON.stringify(metadata));
      }
      allMetaData.push(metadata);
      allKeys.push(request.result.key);
      request.result.continue();
    } else {
      fs.getDirectory('savedMovies').then(fs.getEntryNames)
        .then((names) => {
          logger.info('Sending listItems response.');
          chrome.tabs.sendMessage(tabNum, {
            method: "itemsList",
            positionKeys: allKeys,
            movieNames: names,
            metadata: JSON.stringify(allMetaData)
          });
        }).catch((err) => {
          logger.error('Error getting savedMovies directory: ', err);
        });
    }
  }
}

function getAllKeys(store_name) {
  return new Promise((resolve, reject) => {
    var trans = db.transaction([store_name], "readonly");
    var store = trans.objectStore(store_name);
    var req = store.openCursor(null);
    var keys = [];
    req.onsuccess = () => {
      if (req.result) {
        keys.push(req.result.key);
        req.result.continue();
      }
    };
  });
}

// Remove any movie files that don't have a corresponding replay in
// indexedDB.
function getCurrentReplaysForCleaning() {
  getAllKeys("positions").then((keys) => {
    // Make set for movie file name lookup.
    var ids = new Set(keys.map(
      k => k.replace(/.*DATE/, '').replace('replays', '')));
    return fs.getDirectory('savedMovies').then(fs.getEntryNames)
      .then((names) => {
        return Promise.all(names.map((name) => {
          if (!ids.has(name)) {
            return fs.deleteFile(name);
          } else {
            return Promise.resolve();
          }
        }));
      });
  });
}

// this is a function to get position data from the object store
//   It sends a message to the content script once it gets the data 
function getPosData(dataFileName, tabNum) {
  positionData = []
  var transaction = db.transaction(["positions"], "readonly");
  var store = transaction.objectStore("positions");
  var request = store.get(dataFileName);
  request.onsuccess = function () {
    thisObj = request.result.value
    chrome.tabs.sendMessage(tabNum, { method: "positionData", title: request.result, movieName: dataFileName })
    logger.info('sent reply')
  }
}

// this gets position data from object store so that it can be downloaded by user.
function getPosDataForDownload(dataFileName, tabNum) {
  positionData = []
  var transaction = db.transaction(["positions"], "readonly");
  var store = transaction.objectStore("positions");
  var request = store.get(dataFileName);
  request.onsuccess = function () {
    chrome.tabs.sendMessage(tabNum, {
      method: "positionDataForDownload",
      fileName: dataFileName,
      title: request.result
    })
    logger.info('sent reply - ' + dataFileName)
  }
}

// gets position data from object store for multiple files and zips it into blob
// saves as zip file
function getRawDataAndZip(files) {
  logger.info('getRawDataAndZip()');
  var zip = new JSZip();
  var transaction = db.transaction(["positions"], "readonly");
  var store = transaction.objectStore("positions");
  var request = store.openCursor(null);
  request.onsuccess = function () {
    if (request.result) {
      if (files.includes(request.result.key)) {
        zip.file(request.result.key + '.txt', request.result.value);
      }
      request.result.continue()
    } else {
      var content = zip.generate({ type: "blob", compression: "DEFLATE" });
      saveAs(content, 'raw_data.zip');
    }
  }
}

// this deletes data from the object store
// if the `dataFileName` argument is an object (not a string or array), then
// this was called during a crop and replace process. we need to send the new
// name for this replay back to the content script
// TODO: split into different methods for different ways of calling.
function deleteData(dataFileName, tabNum) {
  if (Array.isArray(dataFileName)) {
    let deleted = [];
    for (let fTD in dataFileName) {
      // Metadata
      localStorage.removeItem(dataFileName[fTD]);
      var transaction = db.transaction(["positions"], "readwrite");
      var store = transaction.objectStore("positions");
      request = store.delete(dataFileName[fTD]);
      request.onsuccess = function () {
        deleted.push(fTD);
        if (deleted.length == dataFileName.length) {
          chrome.tabs.sendMessage(tabNum, {
            method: 'dataDeleted',
            deletedFiles: dataFileName
          });
          logger.info('sent reply')
        }
      }
    }
  } else if (typeof dataFileName == 'object') {
    var newName = dataFileName.newName;
    var metadata = dataFileName.metadata;
    dataFileName = dataFileName.fileName;
    if (dataFileName === newName) {
      chrome.tabs.sendMessage(tabNum, {
        method: 'dataDeleted',
        deletedFiles: dataFileName,
        newName: newName,
        metadata: metadata
      });
      // Metadata
      localStorage.removeItem(dataFileName);
      logger.info('sent crop and replace reply');
      return;
    }
  } else {
    var transaction = db.transaction(["positions"], "readwrite");
    var store = transaction.objectStore("positions");
    request = store.delete(dataFileName);
    request.onsuccess = function () {
      if (typeof newName !== 'undefined') {
        // Metadata
        localStorage.removeItem(dataFileName);
        chrome.tabs.sendMessage(tabNum, {
          method: 'dataDeleted',
          deletedFiles: dataFileName,
          newName: newName,
          metadata: metadata
        });
        logger.info('sent crop and replace reply');
      } else {
        // Metadata.
        localStorage.removeItem(dataFileName);
        chrome.tabs.sendMessage(tabNum, {
          method: 'dataDeleted',
          deletedFiles: dataFileName
        });
        logger.info('sent single delete reply')
      }
    }
  }
}

// this renames data in the object store
function renameData(oldName, newName, tabNum) {
  var transaction = db.transaction(["positions"], "readonly");
  var store = transaction.objectStore("positions");
  var request = store.get(oldName);
  request.onsuccess = function () {
    thisObj = request.result
    var transaction2 = db.transaction(["positions"], "readwrite");
    var store = transaction2.objectStore("positions");
    request = store.delete(oldName)
    request.onsuccess = function () {
      transaction3 = db.transaction(["positions"], "readwrite")
      objectStore = transaction3.objectStore('positions')
      request = objectStore.add(thisObj, newName)
      request.onsuccess = function () {
        localStorage.removeItem(oldName);
        chrome.storage.local.remove(oldName);
        chrome.tabs.sendMessage(tabNum, {
          method: "fileRenameSuccess",
          oldName: oldName,
          newName: newName
        });
        logger.info('sent rename reply');
      }
    }
  }
}

// this renders a movie and stores it in the savedMovies FileSystem
function renderMovie(name, options, lastOne, replaysToRender, replayI, tabNum) {
  var transaction = db.transaction(["positions"], "readonly");
  var store = transaction.objectStore("positions");
  var request = store.get(name);
  request.onsuccess = function () {
    if (typeof JSON.parse(request.result).clock !== "undefined") {
      if (typeof replaysToRender !== 'undefined') {
        renderVideo(request.result, name, options, lastOne, replaysToRender, replayI, tabNum);
      } else {
        renderVideo(request.result, name, options, lastOne);
      }
    } else {
      // TODO: straighten up rendering back-and-forth protocol.
      chrome.tabs.sendMessage(tabNum, {
        method: "movieRenderFailure"
      });
      logger.info('sent movie render failure notice');
    }
  };
}

// this downloads a rendered movie (found in the FileSystem) to disk
function downloadMovie(name) {
  //var nameDate = name.replace(/.*DATE/,'').replace('replays','')
  var id = name.replace(/.*DATE/, '').replace('replays', '');
  fs.getFile(`savedMovies/${id}`).then((file) => {
    var filename = name.replace(/DATE.*/, '') + '.webm';
    saveVideoData(filename, file);
    chrome.tabs.sendMessage(tabNum, {
      method: 'movieDownloadConfirmation'
    });
    logger.info('Sent movie download confirmation.');
  }).catch((err) => {
    chrome.tabs.sendMessage(tabNum, {
      method: 'movieDownloadFailure'
    });
    logger.error('Error downloading movie: ', err);
  });
}

// Truncates frame arrays to length of replay.
// Guards against leading 0/null values in case replay is saved soon
// after game start.
function trimReplay(replay) {
  let data_start = replay.clock.findIndex(t => t !== 0);
  for (let key in replay) {
    if (key.startsWith('player')) {
      // Trim player data arrays.
      for (let attr of Object.values(replay[key])) {
        if (Array.isArray(attr)) {
          attr.splice(0, data_start);
        }
      }
    }
  }
  for (let tile of replay.floorTiles) {
    tile.value.splice(0, data_start);
  }
  replay.clock.splice(0, data_start);
  replay.score.splice(0, data_start);
  return replay;
}

// this takes a positions file and returns the duration in seconds of that replay
function getDuration(positions) {
  for (var iii in positions) {
    if (iii.search("player") === 0) {
      var player = positions[iii];
      break;
    }
  }
  if (typeof player === 'undefined') return (0)
  var duration = Math.round(player.x.length / player.fps);
  return (duration);
}

// this takes a positions file and returns the metadata of that file, including:
//     players, their teams at the start of the replay, the map name, the fps of the 
//     recording, and the duration of the recording
// TODO: Stop verifying that a single player was recording after implementing
// replay validation.
function extractMetaData(positions) {
  var metadata = {
    redTeam: [],
    blueTeam: [],
    duration: 0,
    fps: 0,
    map: ''
  };

  var found_self = false;
  var duration = 0;
  for (let key in positions) {
    if (key.startsWith('player')) {
      let player = positions[key];
      let name = player.name.find(n => n);
      if (typeof name == 'undefined') continue;
      let team = player.team[0];
      let me = player.me == 'me';
      name = (me ? '* ' : '  ') + name;
      if (me) {
        metadata.duration = Math.round(player.x.length / player.fps);
        metadata.fps = player.fps;
        metadata.map = player.map;
        found_self = true;
      }
      if (team == 1) {
        metadata.redTeam.push(name);
      } else {
        metadata.blueTeam.push(name);
      }
    }
  }
  if (!found_self) {
    logger.error('Did not find recording player in replay.');
    throw 'player not found';
  }
  return metadata;
}

// Set up indexedDB
var openRequest = indexedDB.open("ReplayDatabase", 1);

// Set handlers for request.
setHandlers(openRequest);

// Function to set handlers for request.
function setHandlers(request) {
  request.onerror = function (e) {
    // Reset database and version.
    if (e.target.error.name == "VersionError") {
      logger.info("Resetting database.");
      // Reset the database.
      var req = indexedDB.deleteDatabase("ReplayDatabase");
      req.onsuccess = function () {
        logger.info("Deleted database successfully");
        // Recreate the database.
        var openRequest = indexedDB.open("ReplayDatabase", 1);
        setHandlers(openRequest);
      };
      req.onerror = function () {
        logger.info("Couldn't delete database");
      };
      req.onblocked = function () {
        logger.info("Couldn't delete database due to the operation being blocked");
      };
    } else {
      logger.error("Unforseen error opening database.");
      logger.dir(e);
    }
  }
  request.onupgradeneeded = function (e) {
    logger.info("running onupgradeneeded");
    var thisDb = e.target.result;
    //Create Object Store
    if (!thisDb.objectStoreNames.contains("positions")) {
      logger.info("I need to make the positions objectstore");
      var objectStore = thisDb.createObjectStore("positions", { autoIncrement: true });
    }
    if (!thisDb.objectStoreNames.contains("savedMovies")) {
      logger.info("I need to make the savedMovies objectstore");
      var objectStore = thisDb.createObjectStore("savedMovies", { autoIncrement: true });
    }
  }

  request.onsuccess = function (e) {
    db = e.target.result;
    db.onerror = function (e) {
      alert("Sorry, an unforseen error was thrown.");
      logger.info("***ERROR***");
      logger.dir(e.target);
    }

    if (!db.objectStoreNames.contains("positions")) {
      version = db.version
      db.close()
      secondRequest = indexedDB.open("ReplayDatabase", version + 1)
      secondRequest.onupgradeneeded = function (e) {
        logger.info("running onupgradeneeded");
        var thisDb = e.target.result;
        //Create Object Store
        if (!thisDb.objectStoreNames.contains("positions")) {
          logger.info("I need to make the positions objectstore");
          var objectStore = thisDb.createObjectStore("positions", { autoIncrement: true });
        }
        if (!thisDb.objectStoreNames.contains("savedMovies")) {
          logger.info("I need to make the savedMovies objectstore");
          var objectStore = thisDb.createObjectStore("savedMovies", { autoIncrement: true });
        }
      }
      secondRequest.onsuccess = function (e) {
        db = e.target.result
      }
    }
    if (!db.objectStoreNames.contains("savedMovies")) {
      version = db.version
      db.close()
      secondRequest = indexedDB.open("ReplayDatabase", version + 1)
      secondRequest.onupgradeneeded = function (e) {
        logger.info("running onupgradeneeded");
        var thisDb = e.target.result;
        //Create Object Store
        if (!thisDb.objectStoreNames.contains("positions")) {
          logger.info("I need to make the positions objectstore");
          var objectStore = thisDb.createObjectStore("positions", { autoIncrement: true });
        }
        if (!thisDb.objectStoreNames.contains("savedMovies")) {
          logger.info("I need to make the savedMovies objectstore");
          var objectStore = thisDb.createObjectStore("savedMovies", { autoIncrement: true });
        }
      }
      secondRequest.onsuccess = function (e) {
        db = e.target.result
      }
    }
  }
}

var title;
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.method == 'setPositionData' || message.method == 'setPositionDataFromImport') {
    tabNum = sender.tab.id;
    if (typeof message.newName !== 'undefined') {
      var name = message.newName;
    } else {
      var name = 'replays' + new Date().getTime();
    }

    var deleteTheseData = (message.oldName !== null && typeof message.oldName !== 'undefined') ? true : false;
    transaction = db.transaction(["positions"], "readwrite")
    objectStore = transaction.objectStore('positions')
    logger.info('got data from content script.')
    positions = trimReplay(JSON.parse(message.positionData))
    var metadata = extractMetaData(positions);
    localStorage.setItem(name, JSON.stringify(metadata));

    request = objectStore.put(JSON.stringify(positions), name)
    request.onsuccess = function () {
      if (deleteTheseData) {
        logger.info('new replay saved, deleting old replay...');
        deleteData({
          fileName: message.oldName,
          newName: message.newName,
          metadata: metadata
        }, tabNum);
      } else {
        if (message.method === 'setPositionDataFromImport') {
          sendResponse({
            replayName: name,
            metadata: JSON.stringify(metadata),
          });
        } else {
          chrome.tabs.sendMessage(tabNum, {
            method: "dataSetConfirmationFromBG",
            replayName: name,
            metadata: JSON.stringify(metadata),
          });
          logger.info('sent confirmation');
        }
      }
    }
    return true;
  } else if (message.method == 'requestData') {
    tabNum = sender.tab.id;
    logger.info('got data request for ' + message.fileName);
    getPosData(message.fileName, tabNum);
  } else if (message.method == 'requestList') {
    tabNum = sender.tab.id;
    logger.info('got list request');
    listItems();
  } else if (message.method == 'requestDataForDownload') {
    tabNum = sender.tab.id;
    if (message.fileName || message.files.length == 1) { // old, single button
      logger.info('got data request for download - ' + message.fileName || message.files[0]);
      getPosDataForDownload(message.fileName || message.files[0], tabNum);
      return;
    }
    if (message.files) {
      logger.info('got request to download raw data for: ' + message.files)
      getRawDataAndZip(message.files);
    }
    return true;
  } else if (message.method == 'requestDataDelete') {
    tabNum = sender.tab.id;
    logger.info('got delete request for ' + message.fileName);
    deleteData(message.fileName, tabNum);
  } else if (message.method == 'requestFileRename') {
    tabNum = sender.tab.id;
    logger.info('got rename request for ' + message.oldName + ' to ' + message.newName)
    renameData(message.oldName, message.newName, tabNum);
  } else if (message.method == 'downloadMovie') {
    tabNum = sender.tab.id;
    logger.info('got request to download Movie for ' + message.name);
    downloadMovie(message.name);
  } else if (message.method == 'cleanRenderedReplays') {
    tabNum = sender.tab.id;
    logger.info('got request to clean rendered replays')
    getCurrentReplaysForCleaning()
  } else if (message.method == 'renderAllInitial') {
    tabNum = sender.tab.id;
    logger.info('got request to render these replays: ' + message.data)
    logger.info('rendering the first one: ' + message.data[0])
    if (message.data.length == 1) {
      lastOne = true
    } else {
      lastOne = false
    }
    localStorage.setItem('canvasWidth', message.options.width);
    localStorage.setItem('canvasHeight', message.options.height);
    can.width = message.options.width;
    can.height = message.options.height;
    renderMovie(message.data[0], message.options, lastOne, message.data, 0, tabNum);
  } else if (message.method == 'renderAllSubsequent') {
    tabNum = sender.tab.id;
    logger.info('got request to render subsequent replay: ' + message.data[message.replayI])
    renderMovie(message.data[message.replayI], message.options, message.lastOne, message.data, message.replayI, tabNum)
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  logger.info('onInstalled handler called');
  let reason = details.reason;
  let version = chrome.runtime.getManifest().version;
  if (reason == 'install') {
    logger.info('onInstalled: install');
  } else if (reason == 'update') {
    logger.info('onInstalled: update');
    let last_version = details.previousVersion;
    if (last_version) {
      if (last_version == version) {
        logger.info('Reloaded in dev mode.');
      } else {
        logger.info(`Upgrade from ${last_version} to ${version}.`);
        // Clear preview from versions prior to 1.3.
        if (semver.satisfies(last_version, '<1.3.0')) {
          chrome.storage.promise.local.clear().then(() => {
            chrome.runtime.reload();
          }).catch((err) => {
            logger.error('Error clearing chrome.storage.local: ', err);
          });
        }
      }
    }
  }
});
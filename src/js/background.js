const JSZip = require('jszip');
const saveAs = require('file-saver').saveAs;
const semver = require('semver');
require('chrome-storage-promise');

const Data = require('./modules/data');
const logger = require('./modules/logger')('background');
const fs = require('./modules/filesystem');
const Renderer = require('./modules/renderer');
const Textures = require('./modules/textures');
const track = require('./modules/track');
const Whammy = require('./modules/whammy');

logger.info('Starting background page.');

Textures.ready().then(() => {
  logger.info('Textures ready.');
});

Data.ready().then(() => {
  logger.info('Data ready.');
  get_replay_count().then((n) => {
    track('DB Load', {
      'Total Replays': n
    });
  });
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

/**
 * Provide a progress callback to some bit of work wrapped
 * in a Promise.
 * 
 * Use with regular promises like:
 *   
 *   var p = new Progress((resolve, reject, progress) => {
 * 
 *   });
 * 
 *   // elsewhere...
 * 
 *   promise_returning_fn().then(p.progress((progress) => {
 *     update_something(progress);
 *   })).then((result) => {
 *     all_done();
 *   });
 */
class Progress {
  constructor(wrapped) {
    this.__callback = () => {};
    this.__promise = new Promise((resolve, reject) => {
      return wrapped(resolve, reject, (progress) => {
        this.__callback(progress);
      });
    });
  }

  progress(callback) {
    this.__callback = callback;
    return this.__promise;
  }
}

/**
 * Resolves the given callback after a timeout.
 */
function PromiseTimeout(callback, timeout=0) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(callback());
    }, timeout);
  });
}

// Function to test integrity of position data before attempting to render
// Returns false if a vital piece is missing, true if no problems were found
// Currently does not do a very thorough test
function checkData(positions) {
  logger.info('checkData()');
  const props = ["chat", "splats", "bombs", "spawns", "map", "wallMap", "floorTiles", "score", "gameEndsAt", "clock", "tiles"];
  for (let prop of props) {
    if (!positions[prop]) {
      logger.error(`Replay missing property: ${prop}`);
      return false;
    }
  }
  const nonempty = ['map', 'wallMap', 'clock'];
  for (let prop of nonempty) {
    if (positions[prop].length === 0) {
      logger.error(`Replay property was empty: ${prop}`);
      return false;
    }
  }

  let player_exists = Object.keys(positions).some(k => k.startsWith('player'));
  if (!player_exists) {
    logger.error('No player property found in replay.');
    return false;
  }
  return true;
}

/**
 * Renders replay.
 * 
 * Interface:
 *   Progress is returned. Call .progress on it and pass a handler for
 *   the progress events, which contain the % complete. That function returns
 *   a Promise which can be used like normal for completion/error handling.
 * 
 * A small delay in rendering is provided after progress notification to give
 * async operations a chance to complete.
 */
function renderVideo(replay, id, options) {
  return new Progress((resolve, reject, progress) => {
    // Check replay data.
    if (!checkData(replay)) {
      logger.warn(`${name} was a bad replay.`);
      reject("The replay was not valid.");
    }
    
    let renderer = new Renderer(can, replay, options);
    let me = Object.keys(replay).find(k => replay[k].me == 'me');
    let fps = replay[me].fps;
    let encoder = new Whammy.Video(fps);
    let frames = replay.clock.length;
    // Fraction of completion that warrants progress notification.
    let notification_freq = 0.05;
    let portions_complete = 0;

    resolve(renderer.ready().then(function render(frame=0) {
      for (; frame < frames; frame++) {
        //logger.trace(`Rendering frame ${frame} of ${frames}`);
        renderer.draw(frame);
        encoder.add(context);
        let amount_complete = frame / frames;
        if (Math.floor(amount_complete / notification_freq) != portions_complete) {
          portions_complete++;
          progress(amount_complete);
          // Slight delay to give our progress message time to propagate.
          return PromiseTimeout(() => render(++frame));
        }
      }

      let output = encoder.compile();
      let filename = id.replace(/.*DATE/, '').replace('replays', '');
      return fs.saveFile(`savedMovies/${filename}`, output).then(() => {
        logger.debug('File saved.');
      }).catch((err) => {
        logger.error('Error saving render: ', err);
        throw err;
      });
    }));
  });
}

// Remove any movie files that don't have a corresponding replay in
// indexedDB.
function getCurrentReplaysForCleaning() {
  let keys = [];
  each_replay((id) => {
    keys.push(id);
  }).then(() => {
    // Make set for movie file name lookup.
    let ids = new Set(keys.map(
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

/**
 * Returns a promise that resolves to the retrieved replay.
 */
function get_replay(id) {
  logger.info(`Retrieving replay: ${id}.`);
  return Data.db.table('positions')
    .get(id)
    .then((replay) => {
      logger.debug(`Replay ${id} retrieved.`);
      let data = JSON.parse(replay);
      return data;
    });
}

function get_replay_count() {
  return Data.db.table('positions').count();
}

function delete_replay(id) {
  logger.info(`Deleting replay: ${id}.`);
  return Data.db.table('positions').delete(id);
}

/**
 * @param {Array.<string>} ids  ids of items to delete from database.
 */
function delete_replays(ids, iteratee=null) {
  logger.info(`Deleting replays: ${ids}`);
  return Data.db.table('positions').bulkDelete(ids);
}

function each_replay(iteratee) {
  return Data.db.table('positions').each(
    (item, cursor) => iteratee(cursor.key, item));
}

/**
 * Saves replay in IndexedDB, returns promise that resolves to id.
 */
function set_replay(id, replay) {
  logger.info(`Saving replay: ${id}.`);
  return Data.db.table('positions').put(JSON.stringify(replay), id);
}

// This is necessary since we store replays using their name.
function renameData(oldName, newName) {
  return Data.db.transaction('rw', ['positions'], () => {
    Data.db.table('positions').get(oldName).then((replay) => {
      Data.db.table('positions').delete(oldName).then(() => {
        localStorage.removeItem(oldName);
      });
      Data.db.table('positions').put(replay, newName);
    });
  });
}

// Handles metadata extraction/saving in addition to IDB saving.
function save_replay(id, replay) {
  let metadata = extractMetaData(replay);
  return set_replay(id, replay).then((id) => {
    localStorage.setItem(id, JSON.stringify(metadata));
    return id;
  });
}

function get_metadata(id) {
  return JSON.parse(localStorage.getItem(id));
}

function get_or_make_metadata(id, replay) {
  if (!replay) {
    logger.warn(`Replay with id ${id} does not have a valid replay.`);
    return extractMetaData(null);
  }
  let metadata = localStorage.getItem(id);
  if (metadata) {
    try {
      let result = JSON.parse(metadata);
      if (typeof result.map != 'undefined') {
        return result;
      }
    } catch (err) {
      // pass, we make new metadata below.
    }
    // the existing metadata is no good, so we remove it.
    localStorage.removeItem(id);
  }
  // At this point, metadata needs to be generated.
  try {
    let parsed_replay = JSON.parse(replay);
    metadata = extractMetaData(parsed_replay);
    localStorage.setItem(id, JSON.stringify(metadata));
  } catch (err) {
    logger.warn(`Replay with id ${id} could not be parsed.`);
    metadata = extractMetaData(null);
  }
  return metadata;
}


/**
 * @param ids {Array.<String>} - list of ids of replays to download.
 * @returns {Promise} promise that resolves when operation is complete.
 */
function getRawDataAndZip(ids) {
  logger.info('getRawDataAndZip()');
  var zip = new JSZip();
  return Data.db.table('positions').where(':id').anyOf(ids)
  .each((item, cursor) => {
    zip.file(`${cursor.key}.txt`, cursor.value);
  }).then(() => {
    return zip.generateAsync({
      type: "blob",
      compression: "DEFLATE"
    }).then((content) => {
      saveAs(content, 'raw_data.zip');
    });
  });
}

// this downloads a rendered movie (found in the FileSystem) to disk
function downloadMovie(name) {
  //var nameDate = name.replace(/.*DATE/,'').replace('replays','')
  var id = name.replace(/.*DATE/, '').replace('replays', '');
  return fs.getFile(`savedMovies/${id}`).then((file) => {
    var filename = name.replace(/DATE.*/, '') + '.webm';
    saveAs(file, filename);
  }).catch((err) => {
    logger.error('Error downloading movie: ', err);
    throw err;
  });
}

/**
 * Crop a replay, including all frames from start to end (includive)
 * Edits the input replay.
 * @param {object} replay  the replay to crop
 * @param {number} start   the frame to start cropping
 * @param {number} end     the frame to stop cropping at
 * @return {object} 
 */
function cropReplay(replay, start, end) {
  let length = replay.clock.length;
  if (start === 0 && end === length)
    return replay;
  
  let start_time = Date.parse(replay.clock[start]),
      end_time   = Date.parse(replay.clock[end]);

  function cropFrameArray(ary) {
    return ary.slice(start, end + 1);
  }

  function cropBombs(bombs) {
    // Only show bomb animation for 200ms.
    let cutoff = 200;
    return bombs.filter((bomb) => {
      let time = Date.parse(bomb.time);
      return start_time - cutoff < time && time < end_time;
    });
  }

  function cropPlayer(player) {
    let name = cropFrameArray(player.name);
    // Don't make a new player if they were not in any frame.
    let valid = name.some(v => v !== null);
    if (!valid) return null;

    let new_player = {
      auth: cropFrameArray(player.auth),
      bomb: cropFrameArray(player.bomb),
      dead: cropFrameArray(player.dead),
      degree: cropFrameArray(player.degree),
      draw: cropFrameArray(player.draw),
      flag: cropFrameArray(player.flag),
      // Clone?
      flair: cropFrameArray(player.flair),
      fps: player.fps,
      grip: cropFrameArray(player.grip),
      map: player.map,
      me: player.me,
      name: name,
      tagpro: cropFrameArray(player.tagpro),
      team: cropFrameArray(player.team),
      x: cropFrameArray(player.x),
      y: cropFrameArray(player.y)
    };

    if (player.angle) {
      new_player.angle = cropFrameArray(player.angle);
    }
    return new_player;
  }

  function cropDynamicTile(tile) {
    return {
      x: tile.x,
      y: tile.y,
      value: cropFrameArray(tile.value)
    };
  }

  function cropSpawns(spawns) {
    return spawns.filter((spawn) => {
      let time = Date.parse(spawn.time);
      return start_time - spawn.w < time && time < end_time;
    });
  }

  function cropChats(chats) {
    let chat_duration = 30000;
    return chats.filter((chat) => {
      let display_time = chat.removeAt - chat_duration;
      let remove_time = chat.removeAt;
      return display_time && (start_time < remove_time && display_time < end_time);
    });
  }

  function cropSplats(splats) {
    let splat_duration = 5000;
    return splats.filter((splat) => {
      let time = Date.parse(splat.time);
      if (end_time < time) return false;
      // Keep all permanent splats.
      if (!splat.temp) return true;
      return !(time + splat_duration < start_time);
    });
  }

  let new_replay = {
    bombs:      cropBombs(replay.bombs),
    chat:       cropChats(replay.chat),
    clock:      cropFrameArray(replay.clock),
    end:        replay.end,
    gameEndsAt: replay.gameEndsAt,
    floorTiles: replay.floorTiles.map(cropDynamicTile),
    map:        replay.map,
    score:      cropFrameArray(replay.score),
    spawns:     cropSpawns(replay.spawns),
    splats:     cropSplats(replay.splats),
    tiles:      replay.tiles,
    wallMap:    replay.wallMap
  };
  // Add players.
  for (let key in replay) {
    if (key.startsWith('player')) {
      let new_player = cropPlayer(replay[key]);
      if (new_player === null) continue;
      new_replay[key] = new_player;
    }
  }
  return new_replay;
}

// Truncates frame arrays to length of replay.
// Guards against leading 0/null values in case replay is saved soon
// after game start.
function trimReplay(replay) {
  let data_start = replay.clock.findIndex(t => t !== 0);
  let data_end = replay.clock.length - 1;
  return cropReplay(replay, data_start, data_end);
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

var title;
// Guard against multi-page rendering.
let rendering = false;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let method = message.method;
  let tab = sender.tab.id;
  logger.info(`Received ${method}.`)

  if (method == 'replay.get') {
    get_replay(message.id).then((replay) => {
      sendResponse(replay);
    });
    return true;

  } else if (method == 'replay.crop') {
    get_replay(message.id).then((replay) => {
      let {start, end} = message;
      logger.debug(`Cropping ${message.id} from ${start} to ${end}.`);
      let cropped_replay = cropReplay(replay, start, end);
      return save_replay(message.new_name, cropped_replay);
    }).then((id) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.added',
        id: id,
        metadata: get_metadata(id)
      });
    });

  } else if (method == 'replay.crop_and_replace') {
    get_replay(message.id).then((replay) => {
      let {start, end} = message;
      logger.debug(`Cropping ${message.id} from ${start} to ${end}.`);
      let cropped_replay = cropReplay(replay, start, end);
      return save_replay(message.new_name, cropped_replay);
    }).then((id) => {
      if (id == message.id) {
        // Original replay was replaced in database.
        chrome.tabs.sendMessage(tab, {
          method: 'replay.replaced',
          id: message.id,
          new_id: id,
          metadata: get_metadata(id)
        });
      } else {
        // Remove old replay.
        delete_replay(message.id).then(() => {
          localStorage.removeItem(message.id);
          chrome.tabs.sendMessage(tab, {
            method: 'replay.deleted',
            ids: [message.id]
          });
          chrome.tabs.sendMessage(tab, {
            method: 'replay.added',
            id: id,
            metadata: get_metadata(message.new_name)
          });
        });
      }
    });

  } else if (method == 'replay.delete') {
    let ids = message.ids;
    delete_replays(ids).then(() => {
      // Remove metadata.
      for (let id of ids) {
        localStorage.removeItem(id);
      }
      logger.info('Finished deleting replays.');
      chrome.tabs.sendMessage(tab, {
        method: 'replay.deleted',
        ids: ids
      });
    });

  } else if (method == 'replay.import') {
    save_replay(message.name, message.data).then((id) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.added',
        id: id,
        metadata: get_metadata(id)
      });
      sendResponse();
    });
    return true;

  } else if (method == 'replay.save_record') {
    try {
      let data = JSON.parse(message.data);
      data = trimReplay(data);
      save_replay(message.name, data).then((id) => {
        get_replay_count().then((n) => {
          track("Recorded Replay", {
            'Total Replays': n
          });
        });
        sendResponse({
          failed: false
        });
      }).catch((err) => {
        logger.error('Error saving replay: ', err);
        sendResponse({
          failed: true
        });
      });
    } catch (e) {
      logger.error('Error saving replay: ', e);
      sendResponse({
        failed: true
      });
    }
    return true;

  } else if (method == 'replay.list') {
    logger.info('Received request for the replay list.');
    let ids = [];
    let metadata = [];
    each_replay((id, replay) => {
      ids.push(id);
      metadata.push(get_or_make_metadata(id, replay));
    }).then(() => {
      return fs.getDirectory('savedMovies').then(fs.getEntryNames);
    }).then((movie_names) => {
      logger.info('Sending replay.list response.');
      sendResponse({
        replay_ids: ids,
        movie_names: movie_names,
        metadata: metadata
      });
    }).catch((err) => {
      logger.error('Error retrieving replays: ', err);
      sendResponse({
        error: true,
        reason: err
      });
    });
    return true;

  } else if (method == 'replay.download') {
    let ids = message.ids;
    logger.info(`Received replay download request for: ${ids}.`);
    if (ids.length === 1) {
      let id = ids[0];
      get_replay(id).then((replay) => {
        let data = JSON.stringify(replay);
        let file = new Blob([data], { type: "data:text/txt;charset=utf-8" });
        saveAs(file, `${id}.txt`);
      });
    } else {
      getRawDataAndZip(ids);
    }

  } else if (method == 'replay.rename') {
    let id = message.id;
    let new_name = message.newName;
    logger.info(`Received replay rename request for: ${id} to ${new_name}.`);
    renameData(id, new_name).then(() => {
      logger.info(`Renaming complete for ${id}, sending reply.`);
      chrome.tabs.sendMessage(tab, {
        method: "replay.renamed",
        id: id,
        new_name: new_name
      });
    }).catch((err) => {
      logger.error('Error renaming replay: ', err);
    });

  } else if (method == 'movie.download') {
    logger.info(`Received request to download movie for: ${message.id}.`);
    downloadMovie(message.id).then(() => {
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      sendResponse({
        failed: true,
        reason: err
      });
    });
    return true;

  } else if (method == 'cleanRenderedReplays') {
    logger.info('got request to clean rendered replays')
    getCurrentReplaysForCleaning()

  } else if (method == 'replay.render') {
    let id = message.id;
    logger.info(`Rendering replay: ${id}`);
    // Persist the value.
    localStorage.setItem('canvasWidth', message.options.width);
    localStorage.setItem('canvasHeight', message.options.height);
    can.width = message.options.width;
    can.height = message.options.height;
    if (rendering) {
      sendResponse({
        failed: true,
        severity: 'fatal',
        reason: "Rendering is already occurring, wait for a bit or" +
          " disable/enable the extension."
      });
    } else {
      rendering = true;
    }
    get_replay(id).then((replay) => {
      return renderVideo(replay, id, message.options)
      .progress((progress) => {
        logger.debug(`Sending progress update for ${id}: ${progress}`);
        chrome.tabs.sendMessage(tab, {
          method: 'render.update',
          id: id,
          progress: progress
        });
      });
    }).then(() => {
      logger.info(`Rendering finished for ${id}`);
      // Reset rendering state.
      rendering = false;
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      logger.error(`Rendering failed for ${id}`);
      // Reset rendering state.
      rendering = false;
      sendResponse({
        failed: true,
        severity: 'transient',
        reason: err
      });
    });
    return true;

  } else {
    logger.warn(`Message type not recognized: ${method}.`);

  }
});

chrome.runtime.onInstalled.addListener((details) => {
  logger.info('onInstalled handler called');
  let reason = details.reason;
  let version = chrome.runtime.getManifest().version;
  if (reason == 'install') {
    logger.info('onInstalled: install');
    track('Install');
  } else if (reason == 'update') {
    logger.info('onInstalled: update');
    let last_version = details.previousVersion;
    if (!last_version) return;
    if (last_version == version) {
      logger.info('Reloaded in dev mode.');
    } else {
      logger.info(`Upgrade from ${last_version} to ${version}.`);
      track('Update', {
        from: last_version,
        to:   version
      });
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
});
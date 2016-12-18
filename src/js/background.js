const JSZip = require('jszip');
const sanitize = require('sanitize-filename');
const saveAs = require('file-saver').saveAs;
const semver = require('semver');
require('chrome-storage-promise');

const Data = require('modules/data');
const logger = require('util/logger')('background');
const fs = require('util/filesystem');
const get_renderer = require('modules/renderer');
const Textures = require('modules/textures');
const track = require('util/track');
const {validate} = require('modules/validate');
const Whammy = require('util/whammy');

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
// Defaults.
can.width = 1280;
can.height = 800;
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
 *   let total = n;
 *   var p = new Progress((resolve, reject, progress) => {
 *     let i = 0;
 *     loop((item) => {
 *       progress(++i / n);
 *     });
 *   });
 * 
 *   // elsewhere...
 * 
 *   promise_returning_fn().then(p.progress((progress) => {
 *     update_something(progress);
 *   })).then((result) => {
 *     all_done();
 *   });
 * 
 * The value passed to progress can be anything you like, it is
 * passed on as-is.
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
function renderVideo(replay, id) {
  return new Progress((resolve, reject, progress) => {
    let me = Object.keys(replay).find(k => replay[k].me == 'me');
    let fps = replay[me].fps;
    let encoder = new Whammy.Video(fps);
    let frames = replay.clock.length;
    // Fraction of completion that warrants progress notification.
    let notification_freq = 0.05;
    let portions_complete = 0;

    let result = chrome.storage.promise.local.get('options').then((items) => {
      if (!items.options) throw new Error('No options found');
      let options = items.options;
      can.width = options.canvas_width;
      can.height = options.canvas_height;
      return get_renderer(can, replay, options);
    }).then(function render(renderer, frame=0) {
      for (; frame < frames; frame++) {
        //logger.trace(`Rendering frame ${frame} of ${frames}`);
        renderer.draw(frame);
        encoder.add(context);
        let amount_complete = frame / frames;
        if (Math.floor(amount_complete / notification_freq) != portions_complete) {
          portions_complete++;
          progress(amount_complete);
          // Slight delay to give our progress message time to propagate.
          return PromiseTimeout(() => render(renderer, ++frame));
        }
      }

      let output = encoder.compile();
      let filename = replay_id_to_file_id(id);
      return fs.saveFile(`savedMovies/${filename}`, output).then(() => {
        logger.debug('File saved.');
      }).catch((err) => {
        logger.error('Error saving render: ', err);
        throw err;
      });
    });
    resolve(result);
  });
}

// Stored metadata.
const Metadata = {
  // Container interface.
  // Get the replay.
  get: function(id) {
    let data = localStorage.getItem(id);
    if (data === null) return null;
    let parsed = this.valid(data);
    if (!parsed) {
      this.remove(id);
      return null;
    }
    return parsed;
  },
  // Set metadata you already have.
  set: function(id, data) {
    localStorage.setItem(id, JSON.stringify(data));
  },
  remove: function(id) {
    localStorage.removeItem(id);
  },
  has: function(id) {
    return localStorage.getItem(id) !== null;
  },
  // Generate metadata.
  // Replay is an object.
  make: function(id, replay) {
    let metadata = extractMetaData(replay);
    this.set(id, metadata);
    return metadata;
  },
  // If valid, returns the final format of the data, else
  // false.
  valid: function(data) {
    if (!data) return false;
    try {
      let parsed = JSON.parse(data);
      if (parsed.map) {
        return parsed;
      } else {
        return false;
      }
    } catch(e) {
      return false;
    }
  },
  // Do maintenance on the metadata store.
  clean: function() {
    // Remove invalid values.
    for (let i = 0; i < localStorage.length; i++) {
      let key = localStorage.key(i);
      let value = localStorage.getItem(key);
      if (!this.valid(value)) {
        this.remove(key);
      }
    }
  }
};

/**
 * Extract old-format metadata from a given replay.
 * TODO: Stop verifying that a single player was recording after implementing
 * replay validation.
 * @param {object} positions
 * @returns {object}
 */
function extractMetaData(positions) {
  var metadata = {
    redTeam: [],
    blueTeam: [],
    duration: 0,
    fps: 0,
    map: ''
  };

  // Get recording player.
  let players = Object.keys(positions).filter(
    k => k.startsWith('player'));
  let me = players.find(k => positions[k].me === 'me');
  if (typeof me == 'undefined') {
    logger.error('Did not find recording player in replay.');
    throw new Error('Replay did not contain the recording player.');
  }
  metadata.fps = positions[me].fps;
  metadata.map = positions[me].map;
  let start = Date.parse(positions.clock[0]);
  let end = Date.parse(positions.clock[positions.clock.length - 1])
  metadata.duration = Math.round((end - start) / 1000);
  for (let key of players) {
    let player = positions[key];
    let name = player.name.find(n => n);
    let team = player.team[0];
    name = key == me ? `* ${name}`
                     : `  ${name}`;
    if (team == 1) {
      metadata.redTeam.push(name);
    } else {
      metadata.blueTeam.push(name);
    }
  }
  return metadata;
}

/**
 * Given an id and metadata, generate consolidated replay
 * info.
 */
function make_replay_info(id, metadata) {
  return {
    id:        id,
    name:      id.replace(/DATE.*/, ''),
    // id is formatted either:
    // 1. replays(\d+)
    // 2. (.+)DATE(\d+)
    // where the last capture group is the date recorded, edited,
    // or imported.
    recorded:  Number(id.replace('replays', '').replace(/.*DATE/, '')),
    rendered:  false,
    // seconds
    duration:  metadata.duration,
    map:       metadata.map,
    fps:       metadata.fps,
    red_team:  metadata.redTeam,
    blue_team: metadata.blueTeam
  };
}

// Combine data sources into format suitable for menu.
function make_replay_list(replay_info, rendered_ids) {
  let rendered = new Set(rendered_ids);
  for (let info of replay_info) {
    info.rendered = rendered.has(replay_id_to_file_id(info.id));
  }
  return replay_info;
}

// Remove any movie files that don't have a corresponding replay in
// indexedDB.
function getCurrentReplaysForCleaning() {
  Data.db.table('positions')
  .toCollection()
  .primaryKeys().then((keys) => {
    // Make set for movie file name lookup.
    let ids = new Set(keys.map(k => replay_id_to_file_id(k)));
    return fs.getDirectory('savedMovies').then(fs.getEntryNames)
      .then((names) => {
        return Promise.all(names.map((name) => {
          if (!ids.has(name)) {
            return fs.deleteFile(`savedMovies/${name}`);
          } else {
            return Promise.resolve();
          }
        }));
      });
  });
}

/**
 * Returns a promise that resolves to the retrieved replay.
 * @param {string} id
 * @returns {Promise<object>}
 */
function get_replay(id) {
  logger.info(`Retrieving replay: ${id}.`);
  return Data.db.table('positions')
  .get(id)
  .then(JSON.parse)
  .then((data) => {
    logger.debug(`Replay ${id} retrieved.`);
    let metadata = Metadata.get(id);
    if (!metadata) {
      metadata = Metadata.make(id, data);
    }
    return {
      info: make_replay_info(id, metadata),
      data: data
    };
  });
}

/**
 * Retrieve the data for a replay.
 * @param {string} id
 * @returns {Promise<object>}
 */
function get_replay_data(id) {
  logger.info(`Retrieving replay data: ${id}`);
  return Data.db.table('positions')
  .get(id)
  .then(JSON.parse)
  .then((data) => {
    logger.debug(`Replay ${id} retrieved.`);
    return data;
  });
}

/**
 * Retrieve the info for all replays.
 * @returns {Promise<Array<object>>} array of replay info.
 */
function get_all_replays_info() {
  let replay_info = [];
  // Metadata to be generated.
  return Data.db.table('positions')
  .toCollection()
  .primaryKeys().then((ids) => {
    let pending = [];
    for (let i = 0; i < ids.length; i++) {
      let id = ids[i];
      let metadata = Metadata.get(id);
      if (!metadata) {
        pending.push([id, i]);
        // Placeholder.
        replay_info.push(null);
      } else {
        replay_info.push(make_replay_info(id, metadata));
      }
    }
    // Resolve any data that doesn't already exist.
    return Promise.all(pending.map(([id, index]) => {
      return get_replay(id).then((replay) => {
        replay_info[index] = replay.info;
      });
    }));
  }).then(() => {
    return fs.getDirectory('savedMovies').then(fs.getEntryNames);
  }).then((movie_names) => {
    return make_replay_list(replay_info, movie_names);
  });
}

function get_replay_count() {
  return Data.db.table('positions').count();
}

/**
 * Map replay id to file id.
 * @param {string} id
 * @returns {string}
 */
function replay_id_to_file_id(id) {
  return id.replace(/.*DATE/, '').replace('replays', '');
}

/**
 * Delete replay and associated data.
 * @param {string} id
 * @returns {Promise} resolves when the operation is complete.
 */
function delete_replay(id) {
  logger.info(`Deleting replay: ${id}.`);
  return Data.db.table('positions').delete(id)
  .then(() => {
    Metadata.remove(id);
    let file_id = replay_id_to_file_id(id);
    return fs.deleteFile(`savedMovies/${file_id}`);
  });
}

/**
 * Delete replays and associated data.
 * @param {Array.<string>} ids  ids of items to delete from database.
 */
function delete_replays(ids) {
  logger.info(`Deleting replays: ${ids}`);
  return Data.db.table('positions').bulkDelete(ids)
  .then(() => {
    let deletions = [];
    for (let id of ids) {
      Metadata.remove(id);
      let file_id = replay_id_to_file_id(id);
      deletions.push(fs.deleteFile(`savedMovies/${file_id}`));
    }
    return Promise.all(deletions);
  });
}

function each_replay(iteratee) {
  return Data.db.table('positions').each(
    (item, cursor) => iteratee(cursor.key, item));
}

/**
 * Saves replay in IndexedDB, returns promise that resolves to id.
 * @param {string} id
 * @param {object} replay
 * @return {Promise<string>} 
 */
function set_replay(id, replay) {
  logger.info(`Saving replay: ${id}.`);
  return Data.db.table('positions').put(JSON.stringify(replay), id);
}

/**
 * Rename the given replay.
 * @param {string} id
 * @param {string} name
 * @returns {Promise<object>}
 */
function rename_replay(id, name) {
  return Data.db.transaction('rw', ['positions'], () => {
    return get_replay(id).then((replay) => {
      // Renaming to itself is the same as not doing anything.
      if (name === replay.info.name) return;
      name = `${name}DATE${replay.info.recorded}`;
      delete_replay(id);
      return save_replay(name, replay.data);
    });
  });
}

/**
 * Saves replay and metadata.
 * @param {string} id
 * @param {object} replay
 * @returns {object} the replay info for the saved replay.
 */
function save_replay(id, replay) {
  return set_replay(id, replay).then((id) => {
    let metadata = Metadata.make(id, replay);
    return make_replay_info(id, metadata);
  });
}

/**
 * @param ids {Array.<String>} - list of ids of replays to download.
 * @returns {Promise} promise that resolves when operation is complete.
 */
function download_replays(ids) {
  logger.info('getRawDataAndZip()');
  let total = ids.length;
  let i = 0;
  let zip = new JSZip();
  let size = 0;
  //  100 MB
  let max_size = 200 * 1024 * 1024;
  let batch_size = 5;

  return new Progress((resolve, reject, progress) => {
    function send_start_zip_update() {
      progress({
        action: 'state',
        value: i === total ? 'zip:final'
                           : 'zip:intermediate'
      });
    }
    function send_end_zip_update() {
      progress({
        action: 'state',
        value: '!zip'
      });
    }
    let table = Data.db.table('positions');
    resolve(Data.each_key(table, ids, (cursor) => {
      logger.debug(`Zipping replay ${++i} of ${total}`);
      let item = cursor.value;
      // Skip null values.
      if (!item) return;
      let this_size = item.length;
      size += this_size;
      let filename = sanitize(cursor.key);
      // Uniqueness provided by uniqueness constraint of primary key.
      zip.file(`${filename}.txt`, cursor.value);
      progress({
        action: 'progress',
        value: i / total
      });
      logger.debug(`Size: ${size}; Max: ${max_size}`);
      if (size > max_size) {
        size = 0;
        logger.info('Generating intermediate zip file.');
        send_start_zip_update();
        // Generate intermediate zip.
        let result = zip.generateAsync({
          type: "blob",
          compression: "STORE"
        }).then((content) => {
          logger.info('Finished generating zip.');
          send_end_zip_update();
          saveAs(content, 'raw_data.zip');
        });
        zip = new JSZip();
        return result;
      }
    }).then(() => {
      logger.info('Finished looping.');
      if (!size) return Promise.resolve();
      logger.info('Generating final zip file.');
      send_start_zip_update();
      return zip.generateAsync({
        type: "blob",
        compression: "DEFLATE"
      }).then((content) => {
        send_end_zip_update();
        saveAs(content, 'raw_data.zip');
      });
    }));
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
 * Crop a replay, including all frames from start to end (inclusive)
 * Edits the input replay.
 * @param {object} replay  the replay to crop
 * @param {number} start   the frame to start cropping
 * @param {number} end     the frame to stop cropping at
 * @return {object} 
 */
function cropReplayData(replay, start, end) {
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
    let clock = replay.clock.map(Date.parse);
    // We worry about losing player information during cropping operations
    // so we operate on the replay in the same way as in the renderer.
    // If this was just for convenience and didn't represent a loss of
    // accuracy then we wouldn't bother.
    return chats.map((chat) => {
      if (!chat.removeAt) return false;
      let display_time = chat.removeAt - chat_duration;
      let remove_time = chat.removeAt;
      // Omit chats outside replay timeframe.
      if (remove_time < start_time || end_time < display_time) return false;
      // Only apply changes to player-originating replays.
      if (typeof chat.from != 'number') return chat;
      // Keep chats created after recording started adding
      // name, auth, and team.
      if (chat.name) return chat;
      let player = replay[`player${chat.from}`];
      // Omit chats from players that we have no information for.
      if (!player) return false;
      let reference_frame = clock.findIndex(
        (time) => display_time == Math.min(time, display_time));
      // Copy the player information.
      chat.name = typeof player.name == 'string' ? player.name
                                                  : player.name[reference_frame];
      chat.auth = player.auth[reference_frame];
      chat.team = player.team[reference_frame];
      return chat;
    }).filter(chat => chat);
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
  return cropReplayData(replay, data_start, data_end);
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

// Generate a new replay name.
// Current default is: {count:0>4}_replay_{timestamp}
function get_new_replay_name() {
  let prefix_length = 4;
  // We'll just keep it in localStorage, not super critical.
  if (!localStorage.getItem('counter')) {
    localStorage.setItem('counter', '1');
  }
  let max_val = Math.pow(10, prefix_length);
  let current = Math.max(Number(localStorage.getItem('counter')) % max_val, 1);
  let prefix = ('0'.repeat(prefix_length) + current).slice(-prefix_length);
  localStorage.setItem('counter', ++current);
  let timestamp = Date.now();
  return `${prefix}_replay_${timestamp}`;
}

var title;
// Guard against multi-page rendering.
let rendering = false;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let method = message.method;
  let tab = sender.tab.id;
  let url = sender.url;
  logger.info(`Received ${method}.`);

  if (method == 'replay.get') {
    let {id} = message;
    get_replay_data(id).then((replay) => {
      sendResponse({
        failed: false,
        data: replay
      });
    }).catch((err) => {
      sendResponse({
        failed: true,
        reason: err.message
      });
    });
    return true;

  } else if (method == 'replay.crop') {
    let {id, start, end, new_name} = message;
    // Add date to replay name since that's where we store it.
    new_name += `DATE${Date.now()}`;
    get_replay_data(id).then((data) => {
      logger.debug(`Cropping ${id} from ${start} to ${end}.`);
      let cropped_data = cropReplayData(data, start, end);
      return save_replay(new_name, cropped_data);
    }).then((replay_info) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.added',
        replay: replay_info
      });
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      sendResponse({
        failed: true,
        reason: err.message
      });
    });
    return true;

  } else if (method == 'replay.crop_and_replace') {
    let {id, start, end, new_name} = message;
    get_replay(id).then((replay) => {
      logger.debug(`Cropping ${id} from ${start} to ${end}.`);
      let cropped_replay = cropReplayData(replay.data, start, end);
      // Add date to replay name.
      new_name = `${new_name}DATE${replay.info.recorded}`;
      return save_replay(new_name, cropped_replay);
    }).then((replay_info) => {
      // Original replay was replaced.
      if (replay_info.id == id) return replay_info;
      // Original replay still needs to be removed.
      return delete_replay(id).then(() => {
        return replay_info;
      });
    }).then((replay_info) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.updated',
        id: id,
        replay: replay_info
      });
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      sendResponse({
        failed: true,
        reason: err.message
      });
    })
    return true;

  } else if (method == 'replay.delete') {
    let {ids} = message;
    delete_replays(ids).then(() => {
      logger.info('Finished deleting replays.');
      chrome.tabs.sendMessage(tab, {
        method: 'replay.deleted',
        ids: ids
      });
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      sendResponse({
        failed: true,
        reason: err.message
      });
    });
    return true;

  } else if (method == 'replay.import') {
    let {name, data} = message;
    // Get file name from filename or create.
    name = name.replace(/\.txt$/, '');
    if (!name.includes('DATE') && !name.startsWith('replays')) {
        name += 'DATE' + Date.now();
    }
    try {
      data = JSON.parse(data);
    } catch(e) {
      sendResponse({
        failed: true,
        reason: 'Replay is not valid JSON'
      });
      return false;
    }
    validate(data).then((result) => {
      if (result.failed) {
        throw new Error(`Validation error: ${result.code}; ${result.reason}`);
      } else {
        return save_replay(name, data);
      }
    }).then((replay_info) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.added',
        replay: replay_info
      });
      sendResponse({
        failed: false
      });
      track('Imported Replay', {
        Failed: false
      });
    }).catch((err) => {
      track('Imported Replay', {
        Failed: true,
        Reason: err.message,
        Name: name
      });
      sendResponse({
        failed: true,
        reason: err.message
      });
    });
    return true;

  } else if (method == 'replay.save_record') {
    let {name, data} = message;
    if (!name) {
      name = get_new_replay_name();
    }
    // We store date recorded in the name of the replay.
    name = `${name}DATE${Date.now()}`;
    Promise.resolve(data)
    .then(JSON.parse)
    .then((parsed) => {
      parsed = trimReplay(parsed);
      return validate(parsed).then((result) => {
        if (result.failed)
          throw new Error(`Validation error: ${result.code}; ${result.reason}`);
        return save_replay(name, parsed);
      });
    })
    .then((id) => {
      get_replay_count().then((n) => {
        track("Recorded Replay", {
          Failed: false,
          'Total Replays': n,
          URL: url
        });
      });
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      logger.error('Error saving replay: ', err);
      // Save replay so it can be sent by user.
      let blob = new Blob([data], { type: 'application/json' });
      saveAs(blob, `${name}.txt`);
      track("Recorded Replay", {
        Failed: true,
        Reason: err.message,
        URL: url
      });
      sendResponse({
        failed: true
      });
    });
    return true;

  } else if (method == 'replay.list') {
    logger.info('Received request for the replay list.');
    get_all_replays_info().then((info) => {
      logger.info('Sending replay.list response.');
      sendResponse({
        replays: info
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
    let {ids} = message;
    logger.info(`Received replay download request for: ${ids}.`);
    if (ids.length === 1) {
      let id = ids[0];
      get_replay_data(id).then((data) => {
        data = JSON.stringify(data);
        let file = new Blob([data], { type: "data:text/txt;charset=utf-8" });
        saveAs(file, `${id}.txt`);
      }).then(() => {
        sendResponse({
          failed: false
        });
      });
    } else {
      download_replays(ids).progress((update) => {
        chrome.tabs.sendMessage(tab, {
          method: 'export.update',
          data: update
        });
      }).then(() => {
        sendResponse({
          failed: false
        });
      }).catch((err) => {
        logger.error('Error downloading replays: ', err);
        sendResponse({
          failed: true,
          reason: err.message
        });
      });
    }
    return true;

  } else if (method == 'replay.rename') {
    let {id, new_name} = message;
    logger.info(`Received replay rename request for: ${id} to ${new_name}.`);
    rename_replay(id, new_name).then((replay_info) => {
      logger.info(`Renaming complete for ${id}, sending reply.`);
      chrome.tabs.sendMessage(tab, {
        method: "replay.updated",
        id: id,
        replay: replay_info
      });
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      logger.error('Error renaming replay: ', err);
      sendResponse({
        failed: true,
        reason: err.message
      });
    });
    return true;

  } else if (method == 'movie.download') {
    let {id} = message;
    logger.info(`Received request to download movie for: ${id}.`);
    downloadMovie(id).then(() => {
      sendResponse({
        failed: false
      });
    }).catch((err) => {
      logger.error('Error downloading movie: ', err);
      sendResponse({
        failed: true,
        reason: err.message
      });
    });
    return true;

  } else if (method == 'cleanRenderedReplays') {
    logger.info('got request to clean rendered replays')
    getCurrentReplaysForCleaning()

  } else if (method == 'replay.render') {
    let id = message.id;
    logger.info(`Rendering replay: ${id}`);
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
    get_replay_data(id).then((data) => {
      // Validation is only needed here because we didn't validate replay
      // database contents previously.
      return validate(data).then((result) => {
        if (result.failed)
          throw new Error(`Validation error: ${result.code}; ${result.reason}`);
        return renderVideo(data, id)
        .progress((progress) => {
          logger.debug(`Sending progress update for ${id}: ${progress}`);
          chrome.tabs.sendMessage(tab, {
            method: 'render.update',
            id: id,
            progress: progress
          });
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
      logger.error(`Rendering failed for ${id}`, err);
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

// Extension options.
// Get default options object.
function getDefaultOptions() {
  var options = {
    fps:             60,
    duration:        30,
    hotkey_enabled:  true,
    hotkey:          47, // '/' key.
    custom_textures: false,
    canvas_width:    1280,
    canvas_height:   800,
    splats:          true,
    ui:              true,
    chat:            true,
    spin:            true,
    record:          true // Recording enabled.
  };
  return options;
}

// Ensure options are set.
chrome.storage.promise.local.get('options').then((items) => {
  if (!items.options) {
    chrome.storage.promise.local.set({
      options: getDefaultOptions()
    }).then(() => {
      logger.info('Options set.');
    }).catch((err) => {
      logger.error('Error setting options: ', err);
    });
  }
}).catch((err) => {
  logger.error('Error retrieving options: ', err);
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
      // Clear preview storage from versions prior to 1.3.
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
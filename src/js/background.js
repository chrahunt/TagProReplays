const JSZip = require('jszip');
const sanitize = require('sanitize-filename');
const saveAs = require('file-saver').saveAs;
const semver = require('semver');
require('chrome-storage-promise');

const Data = require('modules/data');
const logger = require('util/logger')('background');
const fs = require('util/filesystem');
const get_renderer = require('modules/renderer');
const {Progress} = require('util/promise-ext');
const Textures = require('modules/textures');
const track = require('util/track');
const {validate} = require('modules/validate');
const Whammy = require('util/whammy');
require('util/canvas-toblob-polyfill');

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
    let frames = replay.clock.length;
    let encoder = new Whammy.Video(fps);
    let framesAdded = 0;
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
      if(frame==0) {
        console.time('render time');
        console.time('main thread');
      }
      //logger.trace(`Rendering frame ${frame} of ${frames}`);
      renderer.draw(frame);
      renderer.canvas.toBlob((frame =>
        (blob => {
          let len = encoder.add(blob,frame);
          framesAdded++;
        
          if (len === frames && framesAdded === frames) {
            console.timeEnd('render time');
            console.time('compile time');
            encoder.compile().then(output => {
              console.timeEnd('compile time');
              return Movies.save(id, output).then(() => {
                logger.debug('File saved.');
              }).catch((err) => {
                logger.error('Error saving render: ', err);
                throw err;
              });
            }).then(function() {
              resolve(result);
            });
          }
        })
      )(frame), 'image/webp', 0.8);
      if (++frame<frames) {
        if (Math.floor(frame / frames / notification_freq) != portions_complete) {
          portions_complete++;
          progress(frame / frames);
        }
        render(renderer,frame);
      } else {
        console.timeEnd('main thread');
      }
    });
  });
}

/**
 * Wrapper around rendered replay storage, providing a Promise-based
 * interface.
 */
const Movies = {
  /**
   * @param {string} id
   * @returns {Promise<File>}
   */
  get: function(id) {
    let filename = this._replay_id_to_file_id(id);
    let path = `${this._dir}/${filename}`;
    return fs.getFile(path);
  },
  /**
   * Delete the movie matching the provided id.
   */
  delete: function(id) {
    let filename = this._replay_id_to_file_id(id);
    return this._delete(filename);
  },
  /**
   * Deletes movies from storage that do not correspond to the provided
   * replay ids.
   * @returns {Promise}
   */
  deleteMissing: function(ids) {
    let lookup = new Set(ids.map(this._replay_id_to_file_id));
    return this._get_names().then((cache) => {
      let pending = [];
      for (let id of cache) {
        if (!lookup.has(id)) {
          pending.push(this._delete(id));
        }
      }
      return Promise.all(pending);
    });
  },
  save: function(id, movie) {
    let filename = this._replay_id_to_file_id(id);
    let path = `${this._dir}/${filename}`;
    return fs.saveFile(path, movie)
    .then(() => this._add_name(filename))
  },
  has: function(id) {
    let filename = this._replay_id_to_file_id(id);
    return this._get_names().then((cache) => {
      return cache.has(filename);
    });
  },
  /**
   * Query presence of files for a large number of ids.
   * @param {Array<string>} ids
   * @returns {Promise<Map<string, bool>>} mapping indicates whether we
   *   have a movie for the corresponding id
   */
  bulkHas: function(ids) {
    let status = new Map();
    return this._get_names().then((cache) => {
      for (let id of ids) {
        let filename = this._replay_id_to_file_id(id);
        status.set(id, cache.has(filename));
      }
      return status;
    });
  },
  _delete: function(name) {
    return fs.deleteFile(`${this._dir}/${name}`)
    .then(() => this._delete_name(name));
  },
  // Map from current replay id to id used in FileSystem.
  _replay_id_to_file_id: function(id) {
    return id.replace(/.*DATE/, '').replace('replays', '');
  },
  // Movies object caches file names on first query so we don't have to
  // grab them each time.
  _delete_name: function(name) {
    return this._get_names().then((cache) => {
      cache.delete(name);
    });
  },
  _add_name: function(name) {
    return this._get_names().then((cache) => {
      cache.add(name);
    });
  },
  _get_names: function() {
    if (this._retrieved) return Promise.resolve(this._cache);
    return fs.getDirectory(this._dir)
    .then(fs.getEntryNames)
    .then((names) => {
      this._cache = new Set(names);
      this._retrieved = true;
      return this._cache;
    });
  },
  /** @type {Set} */
  _cache: null,
  _retrieved: false,
  // Directory in FileSystem.
  _dir: 'savedMovies'
};

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

// Remove any movie files that don't have a corresponding replay in
// indexedDB.
function getCurrentReplaysForCleaning() {
  return Data.db.table('positions')
  .toCollection()
  .primaryKeys().then((keys) => {
    return Movies.deleteMissing(keys);
  });
}

/**
 * Replay consists of info and data.
 * Methods below retrieve info, data, or both.
 * Plural is for multiple replays.
 */
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
    return Movies.has(id).then((present) => {
      let info = make_replay_info(id, metadata);
      info.rendered = present;
      return {
        info: info,
        data: data
      };
    });
  });
}

/**
 * Returns a promise that resolves to the replay info.
 */
function get_replay_info(id) {
  let metadata = Metadata.get(id);
  if (!metadata) {
    // Generate if needed.
    return get_replay(id).then(replay => replay.info);
  } else {
    return Movies.has(id).then((present) => {
      let info = make_replay_info(id, metadata);
      info.rendered = present;
      return info;
    });
  }
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
  })
  .then(() => Movies.bulkHas(replay_info.map(info => info.id)))
  .then((rendered) => {
    for (let info of replay_info) {
      info.rendered = rendered.get(info.id);
    }
    return replay_info;
  });
}

function get_replay_count() {
  return Data.db.table('positions').count();
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
    return Movies.delete(id);
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
      deletions.push(Movies.delete(id));
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
 * @returns {Progress} progress for reporting and indicating when the
 *   operation is complete.
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

  function cropObject(object) {
    let x = cropFrameArray(object.x);
    let valid = x.some(v => v !== null);
    if (!valid) return null;

    let new_object = {
      draw: cropFrameArray(object.draw),
      id: object.id,
      type: object.type,
      x: cropFrameArray(object.x),
      y: cropFrameArray(object.y)
    };

    return new_object;
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

  function cropEvent(event) {
    if (event.name == 'spring-2017') {
      return {
        name: event.name,
        data: {
          egg_holder: cropFrameArray(event.data.egg_holder)
        }
      };
    }
  }

  let new_replay = {
    bombs:      cropBombs(replay.bombs),
    chat:       cropChats(replay.chat),
    clock:      cropFrameArray(replay.clock),
    end:        replay.end,
    gameEndsAt: replay.gameEndsAt,
    floorTiles: replay.floorTiles.map(cropDynamicTile),
    map:        replay.map,
    objects:    {},
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
  // Add objects.
  if ('objects' in replay) {
    for (let id in replay.objects) {
      let new_obj = cropObject(replay.objects[id]);
      if (new_obj === null) continue;
      new_replay.objects[id] = new_obj;
    }
  }
  if ('event' in replay) {
    new_replay.event = cropEvent(replay.event);
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

// Request/response listeners.
var title;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let method = message.method;
  //message = message.data;
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
      if (replay_info.id == id) {
        // Delete rendered movie if it existed.
        return Movies.delete(id).then(() => replay_info);
      }
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
    });
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
        reason: 'Replay is not valid JSON',
        name: 'ValidationError'
      });
      return false;
    }
    validate(data).then((result) => {
      if (result.failed) {
        let err = new Error(`Validation error: ${result.code}; ${result.reason}`);
        err.name = 'ValidationError';
        throw err;
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
        reason: err.message,
        name: err.name
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
    // Track event statistics.
    let event_name = null;
    Promise.resolve(data)
    .then(JSON.parse)
    .then((parsed) => {
      parsed = trimReplay(parsed);
      return validate(parsed).then((result) => {
        if (result.failed)
          throw new Error(`Validation error: ${result.code}; ${result.reason}`);
        event_name = parsed.event && parsed.event.name;
        return save_replay(name, parsed);
      });
    })
    .then((id) => {
      get_replay_count().then((n) => {
        track("Recorded Replay", {
          Failed: false,
          'Total Replays': n,
          URL: url,
          Event: event_name || 'None'
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
    let {id} = message;
    logger.info(`Received replay download request for: ${id}.`);
    get_replay_data(id).then((data) => {
      data = JSON.stringify(data);
      let file = new Blob([data], { type: "data:text/txt;charset=utf-8" });
      saveAs(file, `${id}.txt`);
    }).then(() => {
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
    Movies.get(id).then((file) => {
      return get_replay_info(id).then((info) => {
        logger.debug(`Downloading movie for ${id}.`);
        let filename = sanitize(info.name);
        saveAs(file, `${filename}.webm`);
        sendResponse({
          failed: false
        });
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

  } else {
    logger.warn(`Message type not recognized: ${method}.`);

  }
});

function serialize_error(error) {
  return {
    message: error.message,
    name: error.name
  };
}

/**
 * Renders a replay.
 * @param {string} id the id of the replay to render
 * @param {Function} update callback for updates
 * @returns {Promise}
 */
function render_replay(id, update) {
  logger.info(`Rendering replay: ${id}`);
  return get_replay_data(id).then((data) => {
    // Validation is only needed here because we didn't validate replay
    // database contents previously.
    return validate(data).then((result) => {
      if (result.failed) {
        let err = new Error(`Validation error: ${result.code}; ${result.reason}`);
        err.name = 'ValidationError';
        throw err;
      }

      return renderVideo(data, id)
      .progress((progress) => {
        logger.debug(`Sending progress update for ${id}: ${progress}`);
        update(progress);
      });
    });
  });
}

// Rendering context.
// Whether we're already rendering.
let rendering = false;
// Callback for initiating longer-lived activities.
chrome.runtime.onConnect.addListener((port) => {
  let name = port.name;
  let tab = port.sender.tab.id;
  logger.info(`Received port: ${name}`);

  if (name == 'replay.render') {
    /**
     * Render a single replay.
     * in  -> message with {id}
     * out <- {error} or {progress}
     * Error names can be:
     * - AlreadyRendering or
     * - Error
     */
    if (rendering) {
      let error = new Error('Already rendering.');
      error.name = 'AlreadyRendering';
      port.postMessage({ error: serialize_error(error) });
      port.disconnect();
      return;
    } else {
      rendering = true;
    }
    port.onMessage.addListener((msg) => {
      let {id} = msg;
      render_replay(id, (progress) => {
        port.postMessage({ progress: progress });
      }).then(() => {
        return get_replay_info(id);
      }).then((replay_info) => {
        // Send update indicating replay is rendered.
        replay_info.rendered = true;
        chrome.tabs.sendMessage(tab, {
          method: 'replay.updated',
          id: id,
          replay: replay_info
        });
      }).catch((err) => {
        logger.error(`Rendering failed for ${id}`, err);
        port.postMessage({ error: serialize_error(err) });
      }).then(() => {
        port.disconnect();
        rendering = false;
      });
    });
    port.onDisconnect.addListener(() => {
      logger.info('Render port disconnected.');
      rendering = false;
    });

  } else if (name == 'replay.download') {
    /**
     * Protocol:
     * -> initial message with replay ids.
     * <- update messages
     * we disconnect on finish or failure
     */
    port.onMessage.addListener((msg) => {
      let {ids} = msg;
      download_replays(ids).progress((update) => {
        port.postMessage({ progress: update });
      }).catch((err) => {
        logger.error('Error downloading replays: ', err);
        port.postMessage({ error: serialize_error(err) });
      }).then(() => {
        port.disconnect();
      });
    });

  } else {
    logger.warn('Did not recognize port type.');
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

      if (semver.satisfies(last_version, '<1.3.0')) {
        // Clear preview storage from versions prior to 1.3.
        chrome.storage.promise.local.clear().then(() => {
          chrome.runtime.reload();
        }).catch((err) => {
          logger.error('Error clearing chrome.storage.local: ', err);
        });
      }

      if (semver.satisfies(last_version, '<1.3.15')) {
        // Force texture reload.
        Textures.ready(true, true).then(() => {
          logger.debug('Textures reloaded.');
        });
      }
    }
  }
});
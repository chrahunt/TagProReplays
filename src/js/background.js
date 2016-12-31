const JSZip = require('jszip');
const saveAs = require('file-saver').saveAs;
const semver = require('semver');
require('chrome-storage-promise');

const Data = require('./modules/data');
const logger = require('./modules/logger')('background');
const fs = require('./modules/filesystem');
const get_renderer = require('./modules/renderer');
const Textures = require('./modules/textures');
const track = require('./modules/track');
const {validate} = require('./modules/validate');
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
function renderVideo(replay, id) {
  return new Progress((resolve, reject, progress) => {
    // Check replay data.
    if (!checkData(replay)) {
      logger.warn(`${name} was a bad replay.`);
      reject("The replay was not valid.");
    }
    
    let me = Object.keys(replay).find(k => replay[k].me == 'me');
    let fps = replay[me].fps;
    let frames = replay.clock.length;
    let encoder = new Whammy.Video(fps,frames);
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
      context.canvas.toBlob((function(frame,blob) {
        let fin = encoder.add(blob,frame);
        
        if (fin) { //wait until Whammy says all our frames have been added
          console.timeEnd('render time');
          console.time('compile time');
          encoder.compile().then(function(output) {
            console.timeEnd('compile time');
            let filename = id.replace(/.*DATE/, '').replace('replays', '');
            return fs.saveFile(`savedMovies/${filename}`, output).then(() => {
              logger.debug('File saved.');
            }).catch((err) => {
              logger.error('Error saving render: ', err);
              throw err;
            });
          }).then(function() {
            resolve(result);
          });
        }
      }).bind(this,frame), 'image/webp', 0.8);
      if (++frame<frames) {
        if (Math.floor(frame / frames / notification_freq) != portions_complete) {
          portions_complete++;
          progress(frame / frames);
        }
        // Slight delay to give our progress message time to propagate.
        PromiseTimeout(() => render(renderer,frame));
      } else {
        console.timeEnd('main thread');
      }
    });
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

// This is necessary since we store the replay name in the
// primary key.
// Resolves to the id of the newly saved replay.
function renameData(id, new_name) {
  let name = new_name;
  return Data.db.transaction('rw', ['positions'], () => {
    return Data.db.table('positions').get(id).then((replay) => {
      let info = make_replay_info(id, get_or_make_metadata(id, replay));
      // Make date conform to expected format.
      name = `${name}DATE${info.recorded}`;
      return Data.db.table('positions').delete(id).then(() => replay);
    }).then((replay) => {
      localStorage.removeItem(id);
      // Store using new name.
      return save_replay(name, JSON.parse(replay));
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
  }
}

// Combine data sources into format suitable for menu.
function make_replay_list(ids, rendered_ids, metadata) {
  let replays = [];
  for (let i = 0; i < ids.length; i++) {
    let id = ids[i];
    let info = metadata[i];
    let replay = make_replay_info(id, info);
    replay.rendered = rendered_ids.includes(
      id.replace('replays', '').replace(/.*DATE/, ''));
    replays.push(replay);
  }
  return replays;
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
    get_replay(message.id).then((replay) => {
      sendResponse(replay);
    });
    return true;

  } else if (method == 'replay.crop') {
    let {id, start, end, new_name} = message;
    // Add date to replay name since that's where we store it.
    new_name += `DATE${Date.now()}`;
    get_replay(id).then((replay) => {
      logger.debug(`Cropping ${id} from ${start} to ${end}.`);
      let cropped_replay = cropReplay(replay, start, end);
      return save_replay(new_name, cropped_replay);
    }).then((new_id) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.added',
        replay: make_replay_info(new_id, get_metadata(new_id))
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
      let cropped_replay = cropReplay(replay, start, end);
      // Add date to replay name.
      let replay_info = make_replay_info(id, get_or_make_metadata(id, replay));
      new_name = `${new_name}DATE${replay_info.recorded}`;
      return save_replay(new_name, cropped_replay);
    }).then((new_id) => {
      // Original replay was replaced.
      if (new_id == id) return new_id;
      // Original replay still needs to be removed.
      return delete_replay(id).then(() => {
        localStorage.removeItem(id);
        return new_id;
      });
    }).then((new_id) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.updated',
        id: id,
        replay: make_replay_info(new_id, get_metadata(new_id))
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
      // Remove metadata.
      for (let id of ids) {
        localStorage.removeItem(id);
      }
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
    // Get file name from file or create.
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
    }).then((id) => {
      chrome.tabs.sendMessage(tab, {
        method: 'replay.added',
        replay: make_replay_info(id, get_metadata(id))
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
    .then(validate)
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
        replays: make_replay_list(ids, movie_names, metadata)
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
    let {id, new_name} = message;
    logger.info(`Received replay rename request for: ${id} to ${new_name}.`);
    renameData(id, new_name).then((new_id) => {
      // new_id is only different because we save the replay name
      // in the replay primary key.
      logger.info(`Renaming complete for ${id}, sending reply.`);
      chrome.tabs.sendMessage(tab, {
        method: "replay.updated",
        id: id,
        replay: make_replay_info(new_id, get_metadata(new_id))
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
      return renderVideo(replay, id)
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
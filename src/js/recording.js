/* global $:false, tagpro:false */
/**
 * Record and save the state of the game, emitting an event to the
 * window with the replay data.
 *
 * This file is injected into the page by the content script. This
 * is necessary in order to listen to the game socket which provides
 * game state information.
 *
 * Communication with the content script is done through custom events.
 *
 *   script  -- replay.save  --> content script
 * {data, name} - the JSON replay data and the name to use when saving.
 *
 * script <-- replay.saved --  content script
 * {failed} - the result of the operation.
 */
const logger = require('util/logger')('recording');
const Cookies = require('util/cookies');

let positions;

/**
 * Create an array of size N filled with zeros.
 * @param {integer} N - The size of the array to create.
 * @return {Array.<integer>} - An array of size `N` filled with zeros.
 */
function createZeroArray(N) {
  return Array.apply(null, {length: N}).map(Number.call, function() {
    return 0;
  });
}

function recordReplayData() {
  let fps = Number(Cookies.read('tpr_fps'));
  let saveDuration = Number(Cookies.read('tpr_duration'));
  let frames = fps * saveDuration;

  // set up map data
  positions.chat = [];
  positions.splats = [];
  positions.bombs = [];
  positions.spawns = [];
  positions.map = tagpro.map;
  delete positions.map.splats;
  positions.wallMap = tagpro.wallMap;
  positions.floorTiles = [];
  positions.objects = {};
  positions.score = createZeroArray(frames);
  positions.gameEndsAt = [new Date(tagpro.gameEndsAt).getTime()];
  positions.clock = createZeroArray(frames);

  // Set up dynamic tiles.
  const dynamic_tile_ids = [3, 4, 5, 6, 9, 10, 13, 14, 15, 16, 19, 20, 21];
  positions.map.forEach((row, x) => {
    row.forEach((tile, y) => {
      if (dynamic_tile_ids.includes(Math.floor(tile))) {
        positions.floorTiles.push({
          x: x,
          y: y,
          value: createZeroArray(frames)
        });
      }
    });
  });

  let chat_duration = 30000;
  // Group chat listener.
  if (tagpro.group && tagpro.group.socket) {
    tagpro.group.socket.on('chat', (chat) => {
      let o = Object.assign({}, chat);
      o.removeAt = Date.now() + chat_duration;
      positions.chat.push(o);
    });
  }

  // set up listener for chats, splats, and bombs
  tagpro.socket.on('chat', (chat) => {
    let attributes = {};
    if (typeof chat.from == 'number') {
      // Preserve player attributes at time chat was made.
      let player = tagpro.players[chat.from];
      attributes.name = player.name;
      attributes.auth = player.auth;
      attributes.team = player.team;
    }
    let chat_info = Object.assign(attributes, chat);
    chat_info.removeAt = Date.now() + chat_duration;
    positions.chat.push(chat_info);
  });

  tagpro.socket.on('splat', (SPLAT) => {
    SPLAT.time = new Date();
    positions.splats.push(SPLAT);
  });

  tagpro.socket.on('bomb', (BOMB) => {
    BOMB.time = new Date();
    positions.bombs.push(BOMB);
  });

  tagpro.socket.on('spawn', (SPAWN) => {
    SPAWN.time = new Date();
    positions.spawns.push(SPAWN);
  });

  tagpro.socket.on('end', (END) => {
    END.time = new Date();
    positions.end = END;
  });

  tagpro.socket.on('time', (TIME) => {
    TIME.startTime = new Date();
    positions.gameEndsAt.push(TIME);
  });

  // function to save game data
  function saveGameData() {
    // Check for newly-created players.
    let currentPlayers = tagpro.players;
    for (let id in currentPlayers) {
      let in_replay_id = `player${id}`;
      if (positions.hasOwnProperty(in_replay_id)) continue;
      positions[in_replay_id] = {
        angle: createZeroArray(frames),
        auth: createZeroArray(frames),
        bomb: createZeroArray(frames),
        dead: createZeroArray(frames),
        degree: createZeroArray(frames),
        draw: createZeroArray(frames),
        flair: createZeroArray(frames),
        flag: createZeroArray(frames),
        fps: fps,
        grip: createZeroArray(frames),
        map: $('#mapInfo').text().replace('Map: ', '').replace(/ by.*/, ''),
        // `me` is set when the replay is saved.
        name: createZeroArray(frames),
        tagpro: createZeroArray(frames),
        team: createZeroArray(frames),
        x: createZeroArray(frames),
        y: createZeroArray(frames),
      };
    }
    // Update players.
    for (let id in positions) {
      if (!id.startsWith('player')) continue;
      let player = positions[id];
      for (let prop in player) {
        // Only apply to properties tracked over time.
        if (Array.isArray(player[prop])) {
          let frames = player[prop];
          let playerId = id.replace('player', '');

          frames.shift();
          if (typeof tagpro.players[playerId] !== 'undefined') {
            frames.push(tagpro.players[playerId][prop]);
          } else {
            frames.push(null);
          }
        }
      }
    }

    // Check for any newly-created objects.
    let currentObjects = tagpro.objects;
    for (let id in currentObjects) {
      if (!positions.objects[id]) {
        positions.objects[id] = {
          draw: createZeroArray(frames),
          id: Number(id),
          type: tagpro.objects[id].type,
          x: createZeroArray(frames),
          y: createZeroArray(frames)
        };
      }
    }
    // Update objects.
    for (let id in positions.objects) {
      let object = positions.objects[id];
      for (let prop in object) {
        // Only apply to properties tracked over time.
        if (Array.isArray(object[prop])) {
          let frames = object[prop];

          frames.shift();
          if (typeof tagpro.objects[id] !== 'undefined') {
            frames.push(tagpro.objects[id][prop]);
          } else {
            frames.push(null);
          }
        }
      }
    }

    for (let tile of positions.floorTiles) {
      tile.value.shift();
      tile.value.push(tagpro.map[tile.x][tile.y]);
    }
    positions.clock.shift();
    positions.clock.push(new Date());
    positions.score.shift();
    positions.score.push(tagpro.score);
  }

  let updaters = [saveGameData];
  // Extension returns false if not applicable or frame update function.
  let extensions = [doEaster];
  let extension_results = extensions.map(f => f());
  updaters.push(...extension_results.filter(e => e));

  setInterval(() => {
    updaters.forEach(f => f());
  }, 1000 / fps);
}

function doEaster() {
  let fps = Number(Cookies.read('tpr_fps'));
  let duration = Number(Cookies.read('tpr_duration'));
  let applies = $('script[src]').toArray().some(e => e.src.endsWith('easter-2017.js'));
  if (!applies) return false;
  positions.event = {
    name: "spring-2017",
    data: {
      egg_holder: createZeroArray(duration * fps)
    }
  };

  let holder = null;
  function frameFunction() {
    positions.event.data.egg_holder.shift();
    positions.event.data.egg_holder.push(holder);
  }
  // track egg holder
  tagpro.socket.on('eggBall', (data) => {
    holder = data.holder;
  });
  return frameFunction;
}

function emit(event, data) {
  var e = new CustomEvent(event, {detail: data});
  window.dispatchEvent(e);
}

// send position data to content script
function saveReplayData(positions) {
  let players = Object.keys(positions).filter(
    k => /player\d+/.test(k));
  let id = tagpro.playerId;
  for (let player of players) {
    if (`player${id}` == player) {
      positions[player].me = 'me';
    } else {
      positions[player].me = 'other';
    }
  }
  var data = JSON.stringify(positions);
  logger.info('Sending replay to content script.');
  emit('replay.save', {
    data: data
  });
}

// this function sets up a listener wrapper
function listen(event, listener) {
  window.addEventListener(event, function (e) {
    listener(e.detail);
  });
}

listen('replay.saved', function (result) {
  logger.info('Replay save confirmed.');
  if (result.failed) {
    $('#savedFeedback').addClass('failed');
    $('#savedFeedback').text('Failed!');
  } else {
    $('#savedFeedback').removeClass('failed');
    $('#savedFeedback').text('Saved!');
  }
  $('#savedFeedback').fadeIn(300);
  $('#savedFeedback').fadeOut(900);
});

// function to add button to record replay data AND if user has turned on key recording, add listener for that key.
function recordButton() {
  var recordButton = document.createElement('div');
  recordButton.id = 'recordButton';

  recordButton.onclick = function () {
    logger.info('Record button clicked.');
    saveReplayData(positions);
  }
  $('body').append(recordButton);

  var savedFeedback = document.createElement('div');
  savedFeedback.id = 'savedFeedback';
  savedFeedback.textContent = 'Saved!';
  $('body').append(savedFeedback);
  $(savedFeedback).hide();

  if (Cookies.read('tpr_hotkey_enabled') == "true") {
    let last_key = null;
    let pressing = false;
    $(document).on('keypress', (e) => {
      let record_key = Cookies.read('tpr_hotkey');
      if (e.which == record_key && !(last_key == e.key && pressing)) {
        logger.info('Record hotkey pressed.');
        pressing = true;
        last_key = e.key;
        saveReplayData(positions);
      }
    });

    $(document).on('keyup', (e) => {
      if (e.key == last_key) {
        pressing = false;
      }
    });
  }
}

if (Cookies.read('tpr_record') != 'false') {
  tagpro.ready(() => {
    var startInterval = setInterval(() => {
      if (tagpro.map && tagpro.wallMap && tagpro.gameEndsAt !== 0) {
        clearInterval(startInterval);
        positions = {};
        recordButton();
        recordReplayData();
      }
    }, 1000);
  });
} else {
  logger.info('Extension disabled.');
}

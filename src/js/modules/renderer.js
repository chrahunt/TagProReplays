/**
 * @fileoverview Contains drawing functions that go from the recorded
 * replay data to display on an HTML canvas.
 * 
 * For usage, see the Renderer class.
 */
const loadImage = require('image-promise');
const moment = require('moment');
require('moment-duration-format');

const logger = require('util/logger')('renderer');
// Polyfill for Chrome < 50
require('util/canvas-toblob-polyfill');
const Tiles = require('modules/tiles');
logger.info('Loading renderer.');

/*
 * Renderer relies heavily on the format of the replay.
 * For replay format information, see the schemas available in
 * https://github.com/chrahunt/TagProReplays/tree/dev/src/schemas
 * This renderer handles v1 replays.
 */
// Renderer-global variables.
var frame, context, options, textures, replay_data, render_state;

const TILE_SIZE = 40;

/**
 * Interface for replay rendering, in general transforming replay
 * input into some graphical format. For video creation and previewing
 * this happens on the provided canvas element.
 * 
 * Some async setup is required so before trying to draw/display, make
 * sure to wait on Renderer#ready.
 * 
 * Also acts as a proxy to the underlying canvas.
 */
class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas - the canvas to render onto
   * @param {Replay} replay
   * @param {Object} options
   * @param {Number} options.canvas_height
   * @param {Number} options.canvas_width
   * @param {bool} options.chat
   * @param {bool} options.custom_textures
   * @param {Object} options.textures
   * @param {bool} options.spin
   * @param {bool} options.splats
   * @param {bool} options.ui
   */
  constructor(canvas, replay, these_options = {}) {
    // Set globals.
    context = canvas.getContext('2d');
    options = these_options;
    render_state = {
      splats: {},
      text_cache: {
        pretty_text: {},
        very_pretty_text: {}
      },
      world_offset: {
        x: 0,
        y: 0
      }
    };
    this.options = these_options;
    this.canvas = canvas;
    this.canvas.width = this.options.canvas_width;
    this.canvas.height = this.options.canvas_height;
    this.replay = replay;

    this.total_render_time = 0;
    this.rendered_frames = 0;

    // Allow already-loaded texture images.
    let texture_promise;
    if (!this.options.textures) {
      throw new Error('options.textures is required');
    }
    texture_promise = Promise.resolve(this.options.textures);
    
    this.ready_promise = texture_promise
    .then((result) => {
      textures = result;
    })
    .then(() => loadImage(drawMap(this.replay)))
    .then((image) => {
      this.map = image;
    });
    this._extract_replay_data();
    this._preprocess_replay();
  }

  /**
   * @returns {Promise}
   */
  ready() {
    return this.ready_promise;
  }

  /**
   * @param {Number} frame
   */
  draw(frame) {
    let t0 = performance.now();
    animateReplay(frame, this.replay, this.map, this.options.spin,
      this.options.splats, this.options.ui, this.options.chat, this.options.tile_previews);
    let t1 = performance.now();
    this.total_render_time += t1 - t0;
    this.rendered_frames++;
  }

  /**
   * Convert current rendered frame of replay to Blob.
   * @param {String} [mimeType='image/png']
   * @param {*} [qualityArgument=1]
   * @returns {Promise<Blob>}
   */
  toBlob(mimeType = 'image/png', qualityArgument = 1) {
    // We invert the Promise here to avoid async calling of toBlob
    // which would open the canvas up to being edited before the state
    // is persisted.
    let resolve;
    let reject;
    let result;
    let err;
    try {
      this.canvas.toBlob((blob) => {
        // Chances are low that resolve isn't already set but we guard
        // against it anyway.
        if (resolve) {
          resolve(blob);
        } else {
          result = blob;
        }
      }, mimeType, qualityArgument);
    } catch(e) {
      // Tainted canvas might throw SecurityError.
      if (reject) {
        reject(e);
      } else {
        err = e;
      }
    }
    return new Promise((resolve_, reject_) => {
      if (err) {
        reject_(err);
      } else if (result) {
        resolve_(result);
      } else {
        resolve = resolve_;
        reject = reject_;
      }
    });
  }

  /**
   * @private
   */
  _extract_replay_data() {
    let players = Object.keys(this.replay).filter(
      k => k.startsWith('player'));
    let id = players.find(k => this.replay[k].me == 'me');
    replay_data = {
      fps: this.replay[id].fps,
      me: id,
      players: players
    };
  }

  /**
   * Preprocess the replay, simplifying other areas of rendering.
   * @private
   */
  _preprocess_replay() {
    // Factor out pre-processing from replay cropping and this function
    // later, when replay upgrade is in place.
    let clock = this.replay.clock.map(Date.parse);
    let start = clock[0];
    let end = clock[clock.length - 1];
    // Chat normalization, using frame in which chat was created
    // instead of one that we're rendering for player information.
    if (this.replay.chat) {
      let chat_duration = 30000;
      this.replay.chat = this.replay.chat.map((chat) => {
        let display_time = chat.removeAt - chat_duration;
        let remove_time = chat.removeAt;
        // Omit chats outside replay timeframe.
        if (remove_time < start || end < display_time) return false;
        // Only apply changes to player-originating replays.
        if (typeof chat.from != 'number') return chat;
        // Keep chats created after recording started adding
        // name, auth, and team.
        if (chat.name) return chat;
        let player = this.replay[`player${chat.from}`];
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

    // Creating tiles used for map generation.
    let decipheredData = decipherMapdata(this.replay.map);
    this.replay.tiles = translateWallTiles(decipheredData, this.replay.wallMap);

    // Normalize gameEndsAt to handle:
    // - old version of recording script that only retrieved initial value
    // - replay recording starting too early and picking up an initial 
    //   zero value.
    if (!Array.isArray(this.replay.gameEndsAt)) {
      this.replay.gameEndsAt = [Date.parse(this.replay.gameEndsAt)];
    } else if (this.replay.gameEndsAt[0] === 0) {
      // Remove bad value.
      this.replay.gameEndsAt.shift();
      // Reformat actual starting value.
      let start = this.replay.gameEndsAt[0];
      this.replay.gameEndsAt[0] = Date.parse(start.startTime) + start.time;
    }

    // Ensure the value of each flair coordinate is a number.
    replay_data.players
    .map(id => this.replay[id].flair)
    .forEach((flair) => {
      flair.forEach((v) => {
        if (!v) return;
        Object.assign(v, { x: Number(v.x), y: Number(v.y) });
      });
    });
  }
}

/**
 * @typedef TileData
 * @type {object}
 * @property {string} tile - The type of tile.
 * @property {object} coordinates - Coordinates corresponding to the
 *   location of the tile on the tiles sprite, or an object with
 *   properties 0, 1, 2, 3 which each hold arrays with the same
 *   information.
 * @property {integer} tileSize - The size of the tile to draw.
 * @property {boolean} drawTileFirst - Whether a floor tile should be
 *   drawn under the given tile before drawing the tile itself.
 */
/**
 * [decipherMapdata description]
 * @param {[type]} mapData [description]
 * @return {[type]} [description]
 */
function decipherMapdata(mapData) {
  return mapData.map((col) => {
    return col.map((tile) => {
      return Object.assign({}, Tiles.mapElements[tile]);
    });
  });
}

function translateWallTiles(decipheredData, wallData) {
  decipheredData.forEach(function(col, x) {
    col.forEach(function(data, y) {
      let tile = data.tile;
      if (tile == "wall" || tile == "diagonalWall") {
        let coordinates = Object.assign({}, data.coordinates);
        let wallCoords = wallData[x][y];

        for (let i = 0; i < 4; i++) {
          let id = wallCoords[i];
          let tile = Tiles.tiles[id];
          coordinates[i] = [tile.x, tile.y];
        }
        data.coordinates = coordinates;
      }
    });
  });
  return decipheredData;
}

/**
 * Returns a Promise that resolves to the renderer.
 */
module.exports = (canvas, replay, options = {}) => {
  let renderer = new Renderer(canvas, replay, options);
  return renderer.ready().then(() => renderer);
};

function drawName(name, auth, x, y) {
  let color = auth ? '#bfff00' : '#ffffff';
  let pos = [x + 20, y - 21];
  veryPrettyText(name, pos[0], pos[1], color);
}

function drawDegree(degree, x, y) {
  if (!degree) return;
  let text = `${degree}°`;
  let pos = [x + 25, y - 10];
  veryPrettyText(text, pos[0], pos[1]);
}

function drawFlair(flair, x, y) {
  if (!flair) return;
  context.drawImage(textures.flair,
    flair.x * 16, flair.y * 16,
    16, 16,
    x + 12, y - 17,
    16, 16);
}

function veryPrettyText(text, x, y, color) {
  context.textAlign = 'left';
  context.fillStyle = color || '#ffffff';
  context.strokeStyle = "#000000";
  context.shadowColor = "#000000";
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.lineWidth = 2;
  context.font = "bold 8pt arial";
  context.shadowBlur = 10;
  context.strokeText(text, x + 16, y + 16);
  context.shadowBlur = 0;
  context.fillText(text, x + 16, y + 16);
  return context.measureText(text).width;
}

function prettyText(text, textx, texty, color) {
  context.textAlign = 'left';
  context.fillStyle = color || '#ffffff';
  context.strokeStyle = "#000000";
  context.shadowColor = "#000000";
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.lineWidth = 2;
  context.font = "bold 8pt Arial";
  context.shadowBlur = 10;
  context.strokeText(text, textx, texty);
  context.shadowBlur = 0;
  context.fillText(text, textx, texty);
  return context.measureText(text).width;
}

function drawChats(positions) {
  if (!positions.chat) return;
  let chat_duration = 30000;
  let chats = positions.chat;
  let thisTime = Date.parse(positions.clock[frame]);
  let visible_chats = chats.filter((chat) => {
    let display_time = chat.removeAt - chat_duration;
    return display_time < thisTime && thisTime < chat.removeAt;
  });

  let max_visible_chats = 10;

  let start = Math.max(visible_chats.length - max_visible_chats, 0);
  let top_offset = context.canvas.height - 175;
  for (let i = start; i < visible_chats.length; i++) {
    let chat = visible_chats[i];
    let left_pos = 10;  
    let top_pos = top_offset + (i - start) * 12;
    // Determine chat attributes.
    let name = null;
    let name_color = 'white';
    let auth = null;
    // Player chat.
    if (typeof chat.from == 'number') {
      name = chat.name;
      auth = chat.auth;
      name_color = chat.team == 1 ? "#FFB5BD"
                                  : "#CFCFFF";
    } else if (typeof chat.from == 'string') {
      // Mod/announcement chat.
      name = chat.from;
      if (chat.to == 'group') {
        name_color = '#E7E700';
      } else if (chat.from == "ADMIN_GLOBAL_BROADCAST") {
        name = 'ANNOUNCEMENT';
        name_color = '#FF0000';
      } else if (chat.mod) {
        name_color = '#00B900';
      }
    } else {
      // System message.
      if (chat.c) {
        name_color = chat.c;
      }
    }
    let text_color = name_color;
    // Custom color.
    if (chat.to == 'all') {
      text_color = chat.c || 'white';
    }
    if (chat.to == 'group' && !chat.from) {
      text_color = "#E7E700";
    }
    if (auth) {
      left_pos += prettyText("✓ ", left_pos, top_pos, "#BFFF00")
    }
    if (name) {
      left_pos += prettyText(`${name}: `, left_pos, top_pos, name_color);
    }
    prettyText(chat.message, left_pos, top_pos, text_color);
  }
}

function drawPowerups(ball, ballx, bally, positions) {
  if (positions[ball].tagpro[frame] != false) {
    context.save();
    context.beginPath();
    context.arc(ballx + TILE_SIZE/2, bally + TILE_SIZE/2, TILE_SIZE/2, 0, 2*Math.PI);
    context.lineWidth = 3;
    context.strokeStyle = "rgb(0, 255, 0)";
    context.fillStyle = "rgba(0, 255, 0, 0.25)";
    context.stroke();
    context.fill();
    context.restore();
  }
  if (positions[ball].bomb[frame] != false) {
    context.save();
    context.beginPath();
    context.arc(ballx + TILE_SIZE/2, bally + TILE_SIZE/2, TILE_SIZE/2, 0, 2*Math.PI);
    let intensity = Math.abs(0.75 * Math.cos(frame * 20 / (3 * replay_data.fps)));
    context.fillStyle = `rgba(255, 255, 0, ${intensity})`;
    context.fill();
    context.restore();
  }
  if (positions[ball].grip[frame] != false) {
    context.drawImage(textures.tiles,
      12 * TILE_SIZE, 4 * TILE_SIZE,
      TILE_SIZE, TILE_SIZE,
      ballx, bally + 20,
      TILE_SIZE / 2, TILE_SIZE / 2);
  }
}

function drawClock(positions) {
  // YYYY-MM-DDTHH:mm:ss.SSSZ
  let current_time = moment(positions.clock[frame], 'YYYY-MM-DDTHH:mm:ss.SSSZ');
  let game_end = positions.end && moment(positions.end.time, 'YYYY-MM-DDTHH:mm:ss.SSSZ');
  // End of current game state interval.
  let end_time, start_time;
  let default_duration = 720000;
  if (positions.gameEndsAt.length == 1) {
    end_time = moment(positions.gameEndsAt[0], 'x');
  } else if (positions.gameEndsAt.length == 2) {
    end_time = moment(positions.gameEndsAt[1].startTime, 'YYYY-MM-DDTHH:mm:ss.SSSZ');
    if (current_time.isAfter(end_time)) {
      start_time = moment(end_time);
      end_time.add(positions.gameEndsAt[1].time, 'ms');
    } 
  }
  if (!end_time) {
    logger.warn('Error parsing game time.');
    return;
  }
  // Default start time.
  if (!start_time) {
    start_time = moment(end_time).subtract(default_duration, 'ms');
  }
  let clock_text;
  if (game_end && current_time.isAfter(game_end)) {
    clock_text = moment.duration(end_time.diff(game_end)).format('mm:ss', { trim: false });
  } else if (current_time.isAfter(end_time)) {
    clock_text = '00:00';
  } else {
    clock_text = moment.duration(end_time.diff(current_time)).format('mm:ss', { trim: false });
  }
  context.fillStyle = "rgba(255, 255, 255, 1)";
  context.strokeStyle = "rgba(0, 0, 0, .75)";
  context.font = "bold 30pt Arial";
  context.textAlign = 'center';
  context.lineWidth = 4;
  context.strokeText(clock_text, context.canvas.width / 2, context.canvas.height - 25);
  context.fillText(clock_text, context.canvas.width / 2, context.canvas.height - 25);
}

function drawScore(positions) {
  var thisScore = positions.score[frame];
  context.textAlign = "center";
  context.fillStyle = "rgba(255, 0, 0, .5)";
  context.font = "bold 40pt Arial";
  context.fillText(thisScore.r, context.canvas.width / 2 - 120, context.canvas.height - 50);
  context.fillStyle = "rgba(0, 0, 255, .5)";
  context.fillText(thisScore.b, context.canvas.width / 2 + 120, context.canvas.height - 50);
}

function drawScoreFlag(positions) {
  for (var j in positions) {
    if (typeof positions[j].flag != 'undefined') {
      if (positions[j].flag[frame] != null) {
        var flagCoords;
        if (positions[j].flag[frame] == '3') {
          flagCoords = { x: 13, y: 1 };
        } else if (positions[j].flag[frame] == '1') {
          flagCoords = { x: 14, y: 1 };
        } else if (positions[j].flag[frame] == '2') {
          flagCoords = { x: 15, y: 1 };
        }
        if (typeof flagCoords != 'undefined') {
          let flagTeam = typeof positions[j].team.length === 'undefined' ? positions[j].team
                                                                     : positions[j].team[frame];
          let flagPos = {
            x: context.canvas.width / 2 + (flagTeam == 1 ? -100 : 80),
            y: context.canvas.height - 50
          };
          context.globalAlpha = 0.5;
          context.drawImage(textures.tiles,
            flagCoords.x * TILE_SIZE, 1 * TILE_SIZE,
            TILE_SIZE, TILE_SIZE,
            flagPos.x, flagPos.y,
            TILE_SIZE * .8, TILE_SIZE * .8);
          context.globalAlpha = 1;
        }
      }
    }
  }
}

function drawFlag(ball, ballx, bally, positions) {
  let flagCodes = {
    1: { x: 14, y: 1 },
    2: { x: 15, y: 1 },
    3: { x: 13, y: 1 }
  };
  let player = positions[ball];
  // null, 0, 1, 2, 3
  if (player.flag[frame]) {
    var flagCoords = flagCodes[player.flag[frame]];
    context.drawImage(textures.tiles,
      flagCoords.x * TILE_SIZE, flagCoords.y * TILE_SIZE,
      TILE_SIZE, TILE_SIZE,
      ballx + 13, bally - 32,
      TILE_SIZE, TILE_SIZE);
  }
}

/**
 * Takes in the replay data and returns a DataURL (png) representing the map.
 * positions - replay data
 */
function drawMap(positions) {
  var newcan = document.createElement('canvas');
  newcan.id = 'newCanvas';
  newcan.style.display = 'none';
  document.body.appendChild(newcan);
  newcan = document.getElementById('newCanvas');
  newcan.width = positions.map.length * TILE_SIZE;
  newcan.height = positions.map[0].length * TILE_SIZE;
  newcan.style.zIndex = 200;
  newcan.style.position = 'absolute';
  newcan.style.top = 0;
  newcan.style.left = 0;
  let newcontext = newcan.getContext('2d');

  var specialTiles = ['11', '12', '17', '18', '23'];
  var specialTileElements = {
    11: { tile: "redtile", coordinates: { x: 14, y: 4 }, tileSize: 40, drawTileFirst: false },
    12: { tile: "bluetile", coordinates: { x: 15, y: 4 }, tileSize: 40, drawTileFirst: false },
    17: { tile: "redgoal", coordinates: { x: 14, y: 5 }, tileSize: 40, drawTileFirst: false },
    18: { tile: "bluegoal", coordinates: { x: 15, y: 5 }, tileSize: 40, drawTileFirst: false },
    23: { tile: "yellowtile", coordinates: { x: 13, y: 5 }, tileSize: 40, drawTileFirst: false }
  };

  var width = positions.tiles.length - 1;
  var height = positions.tiles[0].length - 1;

  // offsets to look for special tiles.
  var walls = {
    '1.1': [1, -1],
    '1.2': [1, 1],
    '1.3': [-1, 1],
    '1.4': [-1, -1]
  };

  // Draw exposed floor under diagonal wall tile.
  function drawSpecialTile(col, row, type) {
    if (!walls[type]) return false;

    let [x_offset, y_offset] = walls[type];
    let [x, y] = [col + x_offset, row + y_offset];

    if (x > width || 0 > x || y > height || 0 > y) return false;
    let id = specialTiles.find((id) => {
      let tile = specialTileElements[id].tile;
      return positions.tiles[x][row].tile == tile && positions.tiles[col][y].tile == tile;
    });
    return id;
  }

  // Don't draw floor tiles on the outside of the map.
  function drawTile(x_0, y_0, type) {
    if (!walls[type]) return false;
    let [x_offset, y_offset] = walls[type];
    let [x, y] = [x_0 + x_offset, y_0 + y_offset];
    let x_inside = 0 <= x && x <= width;
    let y_inside = 0 <= y && y <= height;
    if (x_inside && positions.map[x][y_0] == '0') return false;
    if (y_inside && positions.map[x_0][y] == '0') return false;
    return x_inside || y_inside;
  }

  positions.tiles.forEach((col, x) => {
    col.forEach((tile, y) => {
      // draw floor tile underneath certain tiles
      // but don't draw tile outside bounds of the map
      // also whether to draw team tiles / end zones instead of regular tile
      if (tile.tile == 'diagonalWall') {
        let tileId = positions.map[x][y];
        tile.drawSpecialTileFirst = drawSpecialTile(x, y, tileId);
        tile.drawTileFirst = drawTile(x, y, tileId);
      }
      if (tile.drawTileFirst && !tile.drawSpecialTileFirst) {
        newcontext.drawImage(textures.tiles,
          13 * TILE_SIZE, 4 * TILE_SIZE,
          TILE_SIZE, TILE_SIZE,
          x * TILE_SIZE, y * TILE_SIZE,
          TILE_SIZE, TILE_SIZE);
      }
      if (tile.drawSpecialTileFirst) {
        newcontext.drawImage(textures.tiles,
          specialTileElements[tile.drawSpecialTileFirst].coordinates.x * TILE_SIZE,
          specialTileElements[tile.drawSpecialTileFirst].coordinates.y * TILE_SIZE,
          TILE_SIZE, TILE_SIZE,
          x * TILE_SIZE, y * TILE_SIZE,
          TILE_SIZE, TILE_SIZE);
      }
      if (tile.tile != 'wall' && tile.tile != 'diagonalWall') {
        let tileSize = tile.tileSize
        newcontext.drawImage(textures.tiles,
          tile.coordinates.x * tileSize,
          tile.coordinates.y * tileSize,
          tileSize, tileSize,
          x * tileSize, y * tileSize,
          tileSize, tileSize);
      }
      if (tile.tile == 'wall' || tile.tile == 'diagonalWall') {
        let thisTileSize = tile.tileSize
        for (let quadrant in tile.coordinates) {
          let offset = {};
          if (quadrant == 0) {
            offset.x = 0;
            offset.y = 0;
          } else if (quadrant == 1) {
            offset.x = thisTileSize;
            offset.y = 0;
          } else if (quadrant == 2) {
            offset.x = thisTileSize;
            offset.y = thisTileSize;
          } else if (quadrant == 3) {
            offset.x = 0;
            offset.y = thisTileSize;
          } else {
            continue;
          }
          newcontext.drawImage(textures.tiles,
            tile.coordinates[quadrant][0] * thisTileSize * 2,
            tile.coordinates[quadrant][1] * thisTileSize * 2,
            thisTileSize, thisTileSize,
            x * thisTileSize * 2 + offset.x,
            y * thisTileSize * 2 + offset.y,
            thisTileSize, thisTileSize)
        }
      }
    });
  });
  return newcontext.canvas.toDataURL();
}

function drawFloorTiles(positions, showPreviews) {
  let mod = frame % (replay_data.fps * 2 / 3);
  let fourth = (replay_data.fps * 2 / 3) / 4;
  let animationTile;
  if (mod < fourth) {
    animationTile = 0;
  } else if (mod < fourth * 2) {
    animationTile = 1;
  } else if (mod < fourth * 3) {
    animationTile = 2;
  } else {
    animationTile = 3;
  }
  for (let floor_tile of positions.floorTiles) {
    let x, y;
    let tile_spec = Tiles.floor_tiles[floor_tile.value[frame]];
    if (!tile_spec) {
      logger.error(`Error locating floor tile description for ${floor_tile.value[frame]}`);
      return;
    }
    if (!tile_spec.preview) {
      x = tile_spec.animated ? animationTile
                             : tile_spec.coordinates.x;
      y = tile_spec.coordinates.y;
    } else if (!showPreviews) {
      x = tile_spec.emptyCoordinates.x;
      y = tile_spec.emptyCoordinates.y;
    } else {
      trackPreviewState(positions, floor_tile);
      let coordinates = floor_tile.previewState.isEmpty ? tile_spec.emptyCoordinates
                                                        : tile_spec.coordinates;
      x = coordinates.x;
      y = coordinates.y;
      context.globalAlpha = 0.5;
    } 
    let pos = worldToScreen(floor_tile.x * TILE_SIZE,
                            floor_tile.y * TILE_SIZE);
    context.drawImage(textures[tile_spec.img],
      x * TILE_SIZE,
      y * TILE_SIZE,
      TILE_SIZE, TILE_SIZE,
      pos.x, pos.y,
      TILE_SIZE, TILE_SIZE);
    context.globalAlpha = 1;
  }
}

/**
* Initiate and track state of a preview tile
* @param {object} positions
* @param {object} floor_tile
*/
function trackPreviewState(positions, floor_tile) {
  const stateDuration = 250;
  const clockTime = new Date(positions.clock[frame]).getTime();
  if (!floor_tile.previewState || frame === 0 || floor_tile.value[frame - 1] !== floor_tile.value[frame]) {
    floor_tile.previewState = {
      isEmpty: false,
      switchTime: clockTime + stateDuration
    };
  }
  let state = floor_tile.previewState;
  if (clockTime > state.switchTime) {
    state.switchTime = clockTime + stateDuration;
    state.isEmpty = !state.isEmpty;
  }
}

function bombPop(positions) {
  let now = new Date(positions.clock[frame]).getTime();
  for (let bomb of positions.bombs) {
    if (bomb.type != 2) continue;
    let bTime = new Date(bomb.time).getTime();
    if (bTime <= now && now - bTime < 200) {
      if (typeof bomb.bombAnimation === 'undefined') {
        bomb.bombAnimation = {
          length: Math.round(replay_data.fps / 10),
          frame: 0
        };
      }

      if (bomb.bombAnimation.frame < bomb.bombAnimation.length) {
        bomb.bombAnimation.frame++;
        let bombSize = 40 + (280 * (bomb.bombAnimation.frame / bomb.bombAnimation.length));
        let bombOpacity = 1 - bomb.bombAnimation.frame / bomb.bombAnimation.length;
        context.fillStyle = "#FF8000";
        context.globalAlpha = bombOpacity;
        context.beginPath();
        // Starts at center of player.
        let start = worldToScreen(bomb.x + TILE_SIZE / 2,
                                  bomb.y + TILE_SIZE / 2);
        context.arc(start.x, start.y, Math.round(bombSize), 0, 2 * Math.PI, true);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = "#ffffff";
      }
    } else {
      delete bomb.bombAnimation;
    }
  }
}

function ballCollision(positions, ball) {
  let last_frame = frame - 1;
  let this_ball = positions[ball];
  for (let key in positions) {
    if (key.startsWith('player') && key != ball) {
      let other_ball = positions[key];
      if ((Math.abs(other_ball.x[last_frame] - this_ball.x[last_frame]) < 45 &&
           Math.abs(other_ball.y[last_frame] - this_ball.y[last_frame]) < 45) ||
          (Math.abs(other_ball.x[frame]     - this_ball.x[frame]) < 45 &&
           Math.abs(other_ball.y[frame]     - this_ball.y[frame]) < 45)) {
        return true;
      }
    }
  }
  return false;
}

function rollingBombPop(positions, ball) {
  let me = replay_data.me;
  let player = positions[ball];
  // determine if we need to start a rolling bomb animation: ball has no bomb now, but had bomb one frame ago
  if (!player.bomb[frame] && player.bomb[frame - 1] && ballCollision(positions, ball)) {
    player.rollingBombAnimation = {
      length: Math.round(replay_data.fps / 10),
      frame: 0
    };
  }
  // if an animation should be in progress, draw it
  if (player.rollingBombAnimation) {
    player.rollingBombAnimation.frame++;
    let rollingBombSize = 40 + (200 * (player.rollingBombAnimation.frame / player.rollingBombAnimation.length))
    let rollingBombOpacity = 1 - player.rollingBombAnimation.frame / player.rollingBombAnimation.length

    context.fillStyle = "#FFFF00";
    context.globalAlpha = rollingBombOpacity;
    context.beginPath();
    let rollingBombX = player.x[frame] - positions[me].x[frame] + context.canvas.width / 2;
    let rollingBombY = player.y[frame] - positions[me].y[frame] + context.canvas.height / 2;
    context.arc(rollingBombX, rollingBombY, Math.round(rollingBombSize), 0, 2 * Math.PI, !0);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = "#ffffff";
    if (player.rollingBombAnimation.frame >= player.rollingBombAnimation.length) {
      delete player.rollingBombAnimation;
    }
  }
}

function ballPop(positions, ball) {
  if (!ball.startsWith('player')) return;

  let me = replay_data.me;
  // determine if we need to start a pop animation: ball is dead now, but was not dead one frame ago
  if (positions[ball].dead[frame] && !positions[ball].dead[frame - 1] && positions[ball].draw[frame - 1]) {
    positions[ball].popAnimation = {
      length: Math.round(replay_data.fps / 10),
      frame: 0
    }
  }
  // if an animation should be in progress, draw it
  if (typeof positions[ball].popAnimation != 'undefined') {
    positions[ball].popAnimation.frame++
    let popSize = 40 + (80 * (positions[ball].popAnimation.frame / positions[ball].popAnimation.length))
    let popOpacity = 1 - positions[ball].popAnimation.frame / positions[ball].popAnimation.length

    context.globalAlpha = popOpacity
    context.drawImage(textures.tiles,
      (positions[ball].team[frame] == 1 ? 14 : 15) * TILE_SIZE,
      0,
      TILE_SIZE,
      TILE_SIZE,
      positions[ball].x[frame] - positions[me].x[frame] + context.canvas.width / 2 - popSize / 2,
      positions[ball].y[frame] - positions[me].y[frame] + context.canvas.height / 2 - popSize / 2,
      popSize,
      popSize)
    context.globalAlpha = 1
    if (positions[ball].popAnimation.frame >= positions[ball].popAnimation.length) {
      delete positions[ball].popAnimation;
    }
  }
}

let splat_size = 120;
let splat_fade_duration = 5000;
function drawSplats(positions) {
  if (!positions.splats) return;
  let splats = positions.splats;
  let now = Date.parse(positions.clock[frame]);
  let states = render_state.splats;
  let num_splat_images = textures.splats.width / splat_size;
  for (let i = 0; i < splats.length; i++) {
    let splat = splats[i];
    let splat_time = Date.parse(splat.time);
    if (splat_time > now) break;
    let state;
    if (!states[i]) {
      state = {
        img: Math.floor(Math.random() * num_splat_images)
      };
      states[i] = state;
    } else {
      state = states[i];
    }
    if (splat.temp) {
      let splat_time_alive = now - splat_time;
      // Skip faded splats.
      if (splat_time_alive >= splat_fade_duration) continue;
      context.globalAlpha = 1 - (splat_time_alive / splat_fade_duration);
    } else {
      context.globalAlpha = 1;
    }
    // (player position) -> center of player offset by splat size.
    let pos = worldToScreen(splat.x - splat_size / 2 + TILE_SIZE / 2,
                            splat.y - splat_size / 2 + TILE_SIZE / 2);
    context.drawImage(textures.splats,
      state.img * splat_size,
      (splat.t - 1) * 120,
      splat_size, splat_size,
      pos.x, pos.y,
      splat_size, splat_size);
  }
  // Reset alpha.
  context.globalAlpha = 1;
}

function drawSpawns(positions) {
  if (positions.spawns) {
    context.globalAlpha = .25;
    let now = new Date(positions.clock[frame]).getTime();
    for (let spawn of positions.spawns) {
      let spawn_time = new Date(spawn.time).getTime();
      let diff = now - spawn_time;
      if (diff >= 0 && diff <= spawn.w) {
        let pos = worldToScreen(spawn.x, spawn.y);
        context.drawImage(textures.tiles,
          (spawn.t == 1 ? 14 : 15) * TILE_SIZE, 0,
          40, 40,
          pos.x, pos.y,
          40, 40);
      }
    }
    context.globalAlpha = 1;
  }
}

function drawEndText(positions) {
  if (positions.end) {
    var endTime = new Date(positions.end.time).getTime();
    var thisTime = new Date(positions.clock[frame]).getTime();
    var endColor, endText;
    if (endTime <= thisTime) {
      switch (positions.end.winner) {
      case 'red':
        endColor = "#ff0000";
        endText = "Red Wins!";
        break;
      case 'blue':
        endColor = "#0000ff";
        endText = "Blue Wins!";
        break;
      case 'tie':
        endColor = "#ffffff";
        endText = "It's a Tie!";
        break;
      default:
        endColor = "#ffffff";
        endText = positions.end.winner;
      }
      context.save();
      context.textAlign = "center";
      context.font = "bold 48pt Arial";
      context.fillStyle = endColor;
      context.strokeStyle = "#000000";
      context.lineWidth = 2;
      context.strokeText(endText, context.canvas.width / 2, 100);
      context.fillText(endText, context.canvas.width / 2, 100);
      context.restore();
    }
  }
}

function worldToScreen(x, y) {
  return {
    x: x + render_state.world_offset.x,
    y: y + render_state.world_offset.y
  };
}

// Update frame-specific offset for mapping world to screen coordinates.
function updateOffset(positions) {
  let me = replay_data.me;
  let player = positions[me];
  let center_x = context.canvas.width / 2;
  let center_y = context.canvas.height / 2;
  let player_screen_x = center_x - TILE_SIZE / 2;
  let player_screen_y = center_y - TILE_SIZE / 2;
  let player_world_x = player.x[frame];
  let player_world_y = player.y[frame];
  return {
    x: -player_world_x + player_screen_x,
    y: -player_world_y + player_screen_y
  };
}

/**
 * @param {Replay} positions
 */
function drawBalls(positions) {
  let players = replay_data.players;
  // draw other balls
  for (let id of players) {
    let player = positions[id];
    let {x, y} = worldToScreen(player.x[frame], player.y[frame]);
    if (!player.dead[frame] && player.draw[frame]) {
      let team = Array.isArray(player.team) ? player.team[frame]
                                            : player.team;

      if (!options.spin || !('angle' in player)) {
        context.drawImage(textures.tiles,
          (team == 1 ? 14 : 15) * TILE_SIZE, 0,
          TILE_SIZE, TILE_SIZE,
          x, y,
          TILE_SIZE, TILE_SIZE);
      } else {
        // Move context to be centered on player before rotating.
        context.translate(
          x + TILE_SIZE / 2, y + TILE_SIZE / 2);
        context.rotate(player.angle[frame]);
        context.drawImage(textures.tiles,
          (team == 1 ? 14 : 15) * TILE_SIZE, 0,
          TILE_SIZE, TILE_SIZE,
          -TILE_SIZE / 2, -TILE_SIZE / 2,
          TILE_SIZE, TILE_SIZE);
        context.rotate(-player.angle[frame]);
        context.translate(
          -(x + TILE_SIZE / 2), -(y + TILE_SIZE / 2));
      }

      drawPowerups(id, x, y, positions);
      drawFlag(id, x, y, positions);
      let name = Array.isArray(player.name) ? player.name[frame]
                                            : player.name;
      drawName(name, player.auth[frame], x, y);
      drawDegree(player.degree[frame], x, y);
      drawFlair(player.flair[frame], x, y);
    }
    ballPop(positions, id);
    rollingBombPop(positions, id);
  }
}

function drawObjects(positions) {
  if (!('objects' in positions)) return;
  for (let id in positions.objects) {
    let obj = positions.objects[id];
    if (!obj.draw[frame]) continue;
    if (obj.type == 'egg') {
      let texture = textures.egg;
      let ball_size = 23;
      let pos = worldToScreen(obj.x[frame] + TILE_SIZE / 2,
                              obj.y[frame] + TILE_SIZE / 2);
      context.drawImage(texture,
        0, 0,
        texture.width, texture.height,
        // Offset
        pos.x - 8, pos.y - 8,
        ball_size, ball_size);
    } else if (obj.type == 'marsball') {
      if (!obj.draw[frame]) continue;
      let descriptor = Tiles.tiles.marsball;
      let pos = worldToScreen(obj.x[frame] - TILE_SIZE / 2,
                              obj.y[frame] - TILE_SIZE / 2);
      context.drawImage(textures.tiles,
        descriptor.x * TILE_SIZE, descriptor.y * TILE_SIZE,
        descriptor.size, descriptor.size,
        pos.x, pos.y,
        descriptor.size, descriptor.size);
    } else {
      continue;
    }
  }
}

/**
 * Handle rendering for special events.
 * @param {Replay} positions
 */
function doEvent(positions) {
  if (!('event' in positions)) return;
  let event = positions.event;
  if (event.name == 'spring-2017') {
    let holder_id = event.data.egg_holder[frame];
    if (holder_id) {
      let holder = positions[`player${holder_id}`];
      if (holder.dead[frame] || !holder.draw[frame]) return;
      let {x, y} = worldToScreen(holder.x[frame], holder.y[frame]);
      let offset = 8;
      let icon_size = 23;
      let texture = textures.egg;
      context.drawImage(texture,
        0, 0,
        texture.width, texture.height,
        x + offset, y + offset,
        icon_size, icon_size);
    }
  }
}

/**
 * Edit mapCanvas to reflect the replay at the given frame.
 * frame - frame of replay
 * positions - replay data
 * mapImg - html img element reflecting the image of the map
 */
function animateReplay(frame_n, positions, mapImg, spin, showSplats, showClockAndScore, showChat, showPreviews) {
  frame = frame_n;
  render_state.world_offset = updateOffset(positions);

  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  // Fix for Whammy not handling transparency nicely. See #81.
  context.fillStyle = 'black';
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  let origin = worldToScreen(0, 0);
  context.drawImage(mapImg,
    0, 0,
    mapImg.width, mapImg.height,
    origin.x, origin.y,
    mapImg.width, mapImg.height);
  if (showSplats) {
    drawSplats(positions);
  }
  drawFloorTiles(positions, showPreviews);
  drawSpawns(positions);
  drawBalls(positions);
  drawObjects(positions);
  if (showClockAndScore) {
    drawClock(positions);
    drawScore(positions);
    drawScoreFlag(positions);
  }
  if (showChat) {
    drawChats(positions);
  }
  bombPop(positions);
  drawEndText(positions);
  doEvent(positions);
}

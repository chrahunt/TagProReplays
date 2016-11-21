const loadImage = require('image-promise');
const moment = require('moment');
require('moment-duration-format');

const logger = require('./logger')('renderer');
const Textures = require('./textures');
logger.info('Loading renderer.');

/*
 * Renderer relies heavily on the format of the replay.
 * For replay format information, see the schemas available in
 * https://github.com/chrahunt/TagProReplays/tree/dev/src/schemas
 * This renderer handles v1 replays.
 */
// Renderer-global frame.
var frame, context, textures, options, replay_data;

const TILE_SIZE = 40;

/**
 * Interface for replay rendering. Some async setup is required, so
 * before trying to draw, make sure to wait on Renderer#ready.
 */
class Renderer {
  /**
   * 
   * Takes a canvas to render onto.
   */
  constructor(canvas, replay, these_options={}) {
    // Set globals.
    context = canvas.getContext('2d');
    options = these_options;
    this.canvas = canvas;
    this.replay = replay;
    this.options = these_options;

    this.total_render_time = 0;
    this.rendered_frames = 0;
    
    this.ready_promise = Textures.get(options.custom_textures).then((result) => {
      textures = result;
    }).then(() => loadImage(drawMap(this.replay))).then((image) => {
      this.map = image;
    });
    this._extract_replay_data();
  }

  ready() {
    return this.ready_promise;
  }

  draw(frame) {
    let t0 = performance.now();
    animateReplay(frame, this.replay, this.map, this.options.spin,
      this.options.splats, this.options.ui, this.options.chats);
    let t1 = performance.now();
    this.total_render_time += t1 - t0;
    this.rendered_frames++;
  }

  _extract_replay_data() {
    let id = Object.keys(this.replay).find(
      k => k.startsWith('player') && this.replay[k].me == 'me');
    replay_data = {
      fps: this.replay[id].fps,
      me: id
    };
  }
};

module.exports = Renderer;

function drawText(ballname, namex, namey, auth, degree) {
  context.textAlign = 'left';
  context.fillStyle = (auth == true) ? "#BFFF00"
                                     : "#ffffff";
  context.strokeStyle = "#000000";
  context.shadowColor = "#000000";
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.lineWidth = 2;
  context.font = "bold 8pt Arial";
  context.shadowBlur = 10;
  context.strokeText(ballname, namex + 3, namey);
  if (typeof degree != "undefined" && degree != 0) {
    context.strokeText(degree + "°", namex + 10, namey + 12);
  }
  context.shadowBlur = 0;
  context.fillText(ballname, namex + 3, namey);
  if (typeof degree != "undefined" && degree != 0) {
    context.fillStyle = "#ffffff";
    context.fillText(degree + "°", namex + 10, namey + 12);
  }
}

function drawFlair(ballFlair, flairx, flairy) {
  if (ballFlair !== null) {
    context.drawImage(textures.flair,
      ballFlair.x * 16, ballFlair.y * 16,
      16, 16,
      flairx, flairy,
      16, 16);
  }
}

function prettyText(text, textx, texty, color) {
  context.textAlign = 'left';
  context.fillStyle = color;
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
      let player = positions[`player${chat.from}`];
      if (player.auth[frame]) {
        auth = true;
      }
      name = (typeof player.name === "string") ? player.name
                                               : player.name[frame];
      name_color = player.team[frame] == 1 ? "#FFB5BD"
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
  if (!Array.isArray(positions.gameEndsAt)) {
    end_time = moment(positions.gameEndsAt, 'YYYY-MM-DDTHH:mm:ss.SSSZ');
  } else if (positions.gameEndsAt.length == 1) {
    end_time = moment(positions.gameEndsAt[0], 'x');
  } else if (positions.gameEndsAt.length == 2) {
    end_time = moment(positions.gameEndsAt[1].startTime, 'YYYY-MM-DDTHH:mm:ss.SSSZ');
    if (current_time.isAfter(end_time)) {
      start_time = moment(end_time);
      end_time.add(positions.gameEndsAt[1].time, 'ms');
    } 
  }
  if (!end_time) {
    logger.warning('Error parsing game time.');
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
          flagTeam = typeof positions[j].team.length === 'undefined' ? positions[j].team
                                                                     : positions[j].team[frame];
          flagPos = {
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
  newcontext = newcan.getContext('2d');

  var specialTiles = ['11', '12', '17', '18'];
  var specialTileElements = {
    11: { tile: "redtile", coordinates: { x: 14, y: 4 }, tileSize: 40, drawTileFirst: false },
    12: { tile: "bluetile", coordinates: { x: 15, y: 4 }, tileSize: 40, drawTileFirst: false },
    17: { tile: "redgoal", coordinates: { x: 14, y: 5 }, tileSize: 40, drawTileFirst: false },
    18: { tile: "bluegoal", coordinates: { x: 15, y: 5 }, tileSize: 40, drawTileFirst: false }
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

  for (let col in positions.tiles) {
    for (let row in positions.tiles[col]) {
      // draw floor tile underneath certain tiles
      // but don't draw tile outside bounds of the map
      // also whether to draw team tiles / end zones instead of regular tile
      if (positions.tiles[col][row].tile == 'diagonalWall') {
        positions.tiles[col][row].drawSpecialTileFirst = drawSpecialTile(+col, +row, positions.map[col][row]);
        positions.tiles[col][row].drawTileFirst = true;
        if (positions.map[col][row] == '1.1') {
          if (col != positions.map.length - 1) {
            if (positions.map[+col + 1][row] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (row != 0) {
            if (positions.map[col][+row - 1] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (row == 0 && col == positions.map.length - 1) {
            positions.tiles[col][row].drawTileFirst = false;
          }
        } else if (positions.map[col][row] == '1.2') {
          if (col != positions.map.length - 1) {
            if (positions.map[+col + 1][row] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (row != positions.map[col].length - 1) {
            if (positions.map[col][+row + 1] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (col == positions.map.length - 1 && row == positions.map[col].length - 1) {
            positions.tiles[col][row].drawTileFirst = false;
          }
        } else if (positions.map[col][row] == '1.3') {
          if (col != 0) {
            if (positions.map[+col - 1][row] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (row != positions.map[col].length - 1) {
            if (positions.map[col][+row + 1] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (col == 0 && row == positions.map[col].length - 1)
            positions.tiles[col][row].drawTileFirst = false;
        } else if (positions.map[col][row] == '1.4') {
          if (col != 0) {
            if (positions.map[+col - 1][row] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (row != 0) {
            if (positions.map[col][+row - 1] == '0') {
              positions.tiles[col][row].drawTileFirst = false;
            }
          }
          if (row == 0 && col == 0) {
            positions.tiles[col][row].drawTileFirst = false;
          }
        }
      }
      if (positions.tiles[col][row].drawTileFirst && !positions.tiles[col][row].drawSpecialTileFirst) {
        newcontext.drawImage(textures.tiles,
          13 * TILE_SIZE, 4 * TILE_SIZE,
          TILE_SIZE, TILE_SIZE,
          col * TILE_SIZE, row * TILE_SIZE,
          TILE_SIZE, TILE_SIZE);
      }
      if (positions.tiles[col][row].drawSpecialTileFirst) {
        newcontext.drawImage(textures.tiles,
          specialTileElements[positions.tiles[col][row].drawSpecialTileFirst].coordinates.x * TILE_SIZE,
          specialTileElements[positions.tiles[col][row].drawSpecialTileFirst].coordinates.y * TILE_SIZE,
          TILE_SIZE, TILE_SIZE,
          col * TILE_SIZE, row * TILE_SIZE,
          TILE_SIZE, TILE_SIZE);
      }
      if (positions.tiles[col][row].tile != 'wall' & positions.tiles[col][row].tile != 'diagonalWall') {
        let tileSize = positions.tiles[col][row].tileSize
        newcontext.drawImage(textures.tiles,
          positions.tiles[col][row].coordinates.x * tileSize,
          positions.tiles[col][row].coordinates.y * tileSize,
          tileSize, tileSize,
          col * tileSize, row * tileSize,
          tileSize, tileSize);
      }
      if (positions.tiles[col][row].tile == 'wall' | positions.tiles[col][row].tile == 'diagonalWall') {
        let thisTileSize = positions.tiles[col][row].tileSize
        for (quadrant in positions.tiles[col][row].coordinates) {
          offset = {};
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
            positions.tiles[col][row].coordinates[quadrant][0] * thisTileSize * 2,
            positions.tiles[col][row].coordinates[quadrant][1] * thisTileSize * 2,
            thisTileSize, thisTileSize,
            col * thisTileSize * 2 + offset.x,
            row * thisTileSize * 2 + offset.y,
            thisTileSize, thisTileSize)
        }
      }
    }
  }
  return newcontext.canvas.toDataURL();
}

const floor_tiles = {
  3:    { tile: "redflag",           coordinates: { x: 14, y: 1 }, tileSize: 40, img: "tiles" },
  3.1:  { tile: "redflagtaken",      coordinates: { x: 14, y: 2 }, tileSize: 40, img: "tiles" },
  4:    { tile: "blueflag",          coordinates: { x: 15, y: 1 }, tileSize: 40, img: "tiles" },
  4.1:  { tile: "blueflagtaken",     coordinates: { x: 15, y: 2 }, tileSize: 40, img: "tiles" },
  5:    { tile: "speedpad",          coordinates: { x:  0, y: 0 }, tileSize: 40, img: "speedpad", animated: true },
  5.1:  { tile: "emptyspeedpad",     coordinates: { x:  4, y: 0 }, tileSize: 40, img: "speedpad" },
  6:    { tile: "emptypowerup",      coordinates: { x: 12, y: 8 }, tileSize: 40, img: "tiles" },
  6.1:  { tile: "jukejuice",         coordinates: { x: 12, y: 4 }, tileSize: 40, img: "tiles" },
  6.2:  { tile: "rollingbomb",       coordinates: { x: 12, y: 5 }, tileSize: 40, img: "tiles" },
  6.3:  { tile: "tagpro",            coordinates: { x: 12, y: 6 }, tileSize: 40, img: "tiles" },
  6.4:  { tile: "speed",             coordinates: { x: 12, y: 7 }, tileSize: 40, img: "tiles" },
  9:    { tile: "gate",              coordinates: { x: 12, y: 3 }, tileSize: 40, img: "tiles" },
  9.1:  { tile: "greengate",         coordinates: { x: 13, y: 3 }, tileSize: 40, img: "tiles" },
  9.2:  { tile: "redgate",           coordinates: { x: 14, y: 3 }, tileSize: 40, img: "tiles" },
  9.3:  { tile: "bluegate",          coordinates: { x: 15, y: 3 }, tileSize: 40, img: "tiles" },
  10:   { tile: "bomb",              coordinates: { x: 12, y: 1 }, tileSize: 40, img: "tiles" },
  10.1: { tile: "emptybomb",         coordinates: { x: 12, y: 2 }, tileSize: 40, img: "tiles" },
  13:   { tile: "portal",            coordinates: { x:  0, y: 0 }, tileSize: 40, img: "portal", animated: true },
  13.1: { tile: "emptyportal",       coordinates: { x:  4, y: 0 }, tileSize: 40, img: "portal" },
  14:   { tile: "speedpadred",       coordinates: { x:  0, y: 0 }, tileSize: 40, img: "speedpadred", animated: true },
  14.1: { tile: "emptyspeedpadred",  coordinates: { x:  4, y: 0 }, tileSize: 40, img: "speedpadred" },
  15:   { tile: "speedpadblue",      coordinates: { x:  0, y: 0 }, tileSize: 40, img: "speedpadblue", animated: true },
  15.1: { tile: "emptyspeedpadblue", coordinates: { x:  4, y: 0 }, tileSize: 40, img: "speedpadblue" },
  16:   { tile: "yellowflag",        coordinates: { x: 13, y: 1 }, tileSize: 40, img: "tiles" },
  16.1: { tile: "yellowflagtaken",   coordinates: { x: 13, y: 2 }, tileSize: 40, img: "tiles" }
};

function drawFloorTiles(positions) {
  let mod = frame % (replay_data.fps * 2 / 3);
  let fourth = (replay_data.fps * 2 / 3) / 4;
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
    let tile_spec = floor_tiles[floor_tile.value[frame]];
    if (!tile_spec) {
      logger.error(`Error locating floor tile description for ${floor_tile.value[frame]}`);
      return;
    }
    let x = tile_spec.animated ? animationTile
                               : tile_spec.coordinates.x;
    context.drawImage(textures[tile_spec.img],
      x * TILE_SIZE,
      tile_spec.coordinates.y * TILE_SIZE,
      TILE_SIZE, TILE_SIZE,
      floor_tile.x * TILE_SIZE + posx,
      floor_tile.y * TILE_SIZE + posy,
      TILE_SIZE, TILE_SIZE);
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
        let bombX = bomb.x + posx + TILE_SIZE / 2;
        let bombY = bomb.y + posy + TILE_SIZE / 2;
        context.arc(bombX, bombY, Math.round(bombSize), 0, 2 * Math.PI, true);
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
      if ((Math.abs(other_ball.x[frame - 1] - this_ball.x[frame - 1]) < 45 &&
           Math.abs(other_ball.y[frame - 1] - this_ball.y[frame - 1]) < 45) ||
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
    popSize = 40 + (80 * (positions[ball].popAnimation.frame / positions[ball].popAnimation.length))
    popOpacity = 1 - positions[ball].popAnimation.frame / positions[ball].popAnimation.length

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

function drawSplats(positions) {
  if (positions.splats) {
    let now = new Date(positions.clock[frame]).getTime();
    for (let splat of positions.splats) {
      if (!splat.img) {
        // TODO: dynamic based on splat sprite width.
        splat.img = Math.floor(Math.random() * 7);
      }
      let splat_time = new Date(splat.time).getTime();
      if (splat_time <= now) {
        context.drawImage(textures.splats,
          splat.img * 120,
          (splat.t - 1) * 120,
          120, 120,
          splat.x + posx - 60 + 20,
          splat.y + posy - 60 + 20,
          120, 120);
      }
    }
  }
}

function drawSpawns(positions) {
  if (positions.spawns) {
    context.globalAlpha = .25;
    let now = new Date(positions.clock[frame]).getTime();
    for (let spawn of positions.spawns) {
      let spawn_time = new Date(spawn.time).getTime();
      let diff = now - spawn_time;
      if (diff >= 0 && diff <= spawn.w) {
        context.drawImage(textures.tiles,
          (spawn.t == 1 ? 14 : 15) * TILE_SIZE, 0,
          40, 40,
          spawn.x + posx, spawn.y + posy,
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

function drawBalls(positions) {
  // draw 'me'
  let me = replay_data.me;
  let player = positions[me];
  // what team?
  let team = Array.isArray(player.team) ? player.team[frame]
                                        : player.team;
  if (!player.dead[frame]) {
    // draw own ball with or without spin
    if (!options.spin || typeof player.angle === 'undefined') {
      context.drawImage(textures.tiles,
        (team == 1 ? 14 : 15) * TILE_SIZE, 0,
        TILE_SIZE, TILE_SIZE,
        context.canvas.width / 2 - TILE_SIZE / 2,
        context.canvas.height / 2 - TILE_SIZE / 2,
        TILE_SIZE, TILE_SIZE);
    } else {
      context.translate(context.canvas.width / 2, context.canvas.height / 2);
      context.rotate(player.angle[frame]);
      context.drawImage(textures.tiles,
        (team == 1 ? 14 : 15) * TILE_SIZE, 0,
        TILE_SIZE, TILE_SIZE,
        -20, -20,
        TILE_SIZE,
        TILE_SIZE);
      context.rotate(-player.angle[frame]);
      context.translate(-context.canvas.width / 2, -context.canvas.height / 2);
    }

    drawPowerups(me, context.canvas.width / 2 - TILE_SIZE / 2, context.canvas.height / 2 - TILE_SIZE / 2, positions)
    drawFlag(me, context.canvas.width / 2 - TILE_SIZE / 2, context.canvas.height / 2 - TILE_SIZE / 2, positions)
    let name = Array.isArray(player.name) ? player.name[frame]
                                          : player.name;
    drawText(name,
      context.canvas.width / 2 - TILE_SIZE / 2 + 30,
      context.canvas.height / 2 - TILE_SIZE / 2 - 5,
      (typeof player.auth != 'undefined') ? player.auth[frame] : undefined,
      (typeof player.degree != 'undefined') ? player.degree[frame] : undefined)
    if (typeof player.flair !== 'undefined') {
      drawFlair(positions[me].flair[frame],
        context.canvas.width / 2 - 16 / 2,
        context.canvas.height / 2 - TILE_SIZE / 2 - 17)
    }
  }
  ballPop(positions, me)
  rollingBombPop(positions, me)

  // draw other balls
  for (let j in positions) {
    if (!j.startsWith('player')) continue;
    if (j == me) continue;
    let player = positions[j];
    if (!player.dead[frame] && player.draw[frame]) {
      if (frame == 0 || player.draw[frame - 1] == true) {
        if ((player.dead[frame - 1] &&
             player.x[frame] != player.x[frame - replay_data.fps]) ||
             !player.dead[frame - 1]) {
          let team = Array.isArray(player.team) ? player.team[frame]
                                                : player.team;

          // draw with or without spin
          if (!options.spin || typeof player.angle === 'undefined') {
            context.drawImage(textures.tiles,
              (team == 1 ? 14 : 15) * TILE_SIZE, 0,
              TILE_SIZE, TILE_SIZE,
              player.x[frame] - positions[me].x[frame] + context.canvas.width / 2 - TILE_SIZE / 2,
              player.y[frame] - positions[me].y[frame] + context.canvas.height / 2 - TILE_SIZE / 2,
              TILE_SIZE, TILE_SIZE);
          } else {
            context.translate(
              player.x[frame] - positions[me].x[frame] + context.canvas.width / 2,
              player.y[frame] - positions[me].y[frame] + context.canvas.height / 2);
            context.rotate(player.angle[frame]);
            context.drawImage(textures.tiles,
              (team == 1 ? 14 : 15) * TILE_SIZE, 0,
              TILE_SIZE, TILE_SIZE,
              -TILE_SIZE / 2, -TILE_SIZE / 2,
              TILE_SIZE, TILE_SIZE);
            context.rotate(-player.angle[frame]);
            context.translate(
              -(player.x[frame] - positions[me].x[frame] + context.canvas.width / 2),
              -(player.y[frame] - positions[me].y[frame] + context.canvas.height / 2));
          }

          drawPowerups(j,
            player.x[frame] - positions[me].x[frame] + context.canvas.width / 2 - TILE_SIZE / 2,
            player.y[frame] - positions[me].y[frame] + context.canvas.height / 2 - TILE_SIZE / 2, positions)
          drawFlag(j,
            player.x[frame] - positions[me].x[frame] + context.canvas.width / 2 - TILE_SIZE / 2,
            player.y[frame] - positions[me].y[frame] + context.canvas.height / 2 - TILE_SIZE / 2, positions)
          let name = Array.isArray(player.name) ? player.name[frame]
                                                : player.name;
          drawText(name,
            player.x[frame] - positions[me].x[frame] + context.canvas.width / 2 - TILE_SIZE / 2 + 30,
            player.y[frame] - positions[me].y[frame] + context.canvas.height / 2 - TILE_SIZE / 2 - 5,
            (typeof player.auth != 'undefined') ? player.auth[frame] : undefined,
            (typeof player.degree != 'undefined') ? player.degree[frame] : undefined)
          if (typeof player.flair !== 'undefined') {
            drawFlair(player.flair[frame],
              player.x[frame] - positions[me].x[frame] + context.canvas.width / 2 - 16 / 2,
              player.y[frame] - positions[me].y[frame] + context.canvas.height / 2 - TILE_SIZE / 2 - 20);
          }
          rollingBombPop(positions, j);
        }
      }
    }
    ballPop(positions, j);
  }
}

/**
 * Edit mapCanvas to reflect the replay at the given frame.
 * frame - frame of replay
 * positions - replay data
 * mapImg - html img element reflecting the image of the map
 */
function animateReplay(frame_n, positions, mapImg, spin, showSplats, showClockAndScore, showChat) {
  frame = frame_n;
  let me = replay_data.me;

  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  posx = -(positions[me].x[frame] - context.canvas.width / 2 + TILE_SIZE / 2);
  posy = -(positions[me].y[frame] - context.canvas.height / 2 + TILE_SIZE / 2);
  context.drawImage(mapImg,
    0, 0,
    mapImg.width, mapImg.height,
    posx, posy,
    mapImg.width, mapImg.height);
  if (showSplats) {
    drawSplats(positions);
  }
  drawFloorTiles(positions);
  drawSpawns(positions);
  drawBalls(positions);
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
}

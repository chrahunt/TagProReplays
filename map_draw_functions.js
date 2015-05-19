/**
 * This file contains the functions used to draw the replay data onto
 * the canvas for the in-page preview as well as for replay rendering.
 *
 * This script is included as a content script and a background script.
 */
(function(window) {

// Constant tile size.
var TILE_SIZE = 40;

// Draw-function global. Set in drawReplay and animateReplay.
var thisI = 0;
var context;

// Draw-function globals.
var posx, posy;

// Tile information.
var tiles = {
  0: { x: 15, y: 10 }, // blank.
  1: {},
  1.1: { drawFloor: [{ x: 1, y: 0 }, { x: 0, y: -1 }] },
  1.2: { drawFloor: [{ x: 1, y: 0 }, { x: 0, y: 1 }] },
  1.3: { drawFloor: [{ x: -1, y: 0 }, { x: 0, y: 1 }] },
  1.4: { drawFloor: [{ x: -1, y: 0 }, { x: 0, y: -1 }] },
  2: { x: 13, y: 4 },
  16: { x: 13, y: 1, drawFloor: true, dynamic: true },
  yellowflag: { x: 13, y: 1, dynamic: true },
  16.1: { x: 13, y: 2, drawFloor: true, dynamic: true },
  3: { x: 14, y: 1, drawFloor: true, dynamic: true },
  redflag: { x: 14, y: 1, dynamic: true },
  3.1: { x: 14, y: 2, drawFloor: true, dynamic: true },
  4: { x: 15, y: 1, drawFloor: true, dynamic: true },
  blueflag: { x: 15, y: 1, dynamic: true },
  4.1: { x: 15, y: 2, drawFloor: true, dynamic: true },
  5: { drawFloor: true, dynamic: true, animated: true, img: "speedpad" }, // speedpad
  5.1: { x: 4, y: 0, drawFloor: true, dynamic: true, img: "speedpad" },
  14: { drawFloor: true, dynamic: true, animated: true, img: "speedpadred" }, // speedpadred
  14.1: { x: 4, y: 0, drawFloor: true, dynamic: true, img: "speedpadred" },
  15: { drawFloor: true, dynamic: true, animated: true, img: "speedpadblue" }, // speedpadblue
  15.1: { x: 4, y: 0, drawFloor: true, dynamic: true, img: "speedpadblue" },
  6: { x: 12, y: 8, drawFloor: true, dynamic: true }, // powerups
  6.1: { x: 12, y: 4, drawFloor: true, dynamic: true },
  grip: { x: 12, y: 4, dynamic: true },
  6.2: { x: 12, y: 5, drawFloor: true, dynamic: true },
  bomb: { x: 12, y: 5, dynamic: true },
  6.3: { x: 12, y: 6, drawFloor: true, dynamic: true },
  tagpro: { x: 12, y: 6, dynamic: true },
  6.4: { x: 12, y: 7, drawFloor: true, dynamic: true },
  speed: { x: 12, y: 7, dynamic: true },
  17: { x: 14, y: 5 }, // red goal
  18: { x: 15, y: 5 }, // blue goal
  7: { x: 12, y: 0, drawFloor: true }, // spike
  21: { x: 14, y: 6, drawFloor: true, dynamic: true },
  yellowpotato: { x: 14, y: 6, dynamic: true },
  21.1: { x: 15, y: 6, drawFloor: true, dynamic: true },
  19: { x: 14, y: 7, drawFloor: true, dynamic: true },
  redpotato: { x: 14, y: 7, dynamic: true },
  19.1: { x: 15, y: 7, drawFloor: true, dynamic: true },
  20: { x: 14, y: 8, drawFloor: true, dynamic: true },
  bluepotato: { x: 14, y: 8, dynamic: true },
  20.1: { x: 15, y: 8, drawFloor: true, dynamic: true },
  22: { x: 13, y: 0, drawFloor: true }, // gravity well
  redball: { x: 14, y: 0 },
  blueball: { x: 15, y: 0 },
  8: { x: 13, y: 6, drawFloor: true },
  9: { x: 12, y: 3, dynamic: true },
  9.1: { x: 13, y: 3, dynamic: true },
  9.2: { x: 14, y: 3, dynamic: true },
  9.3: { x: 15, y: 3, dynamic: true },
  10: { x: 12, y: 1, drawFloor: true, dynamic: true },
  10.1: { x: 12, y: 2, drawFloor: true, dynamic: true },
  11: { x: 14, y: 4 }, // red team tile
  12: { x: 15, y: 4 }, // blue team tile
  marsball: { x: 12, y: 9, size: 80, keep: true },
  13: { drawFloor: true, dynamic: true, animated: true, img: "portal" }, // portal
  13.1: { x: 4, y: 0, drawFloor: true, dynamic: true, img: "portal" },
  '1.310': { x: 10.5, y: 7.5, size: 20 },
  '1.410': { x: 11, y: 7.5, size: 20 },
  '1.110': { x: 11, y: 8, size: 20 },
  '1.210': { x: 10.5, y: 8, size: 20 },
  '1.310d': { x: 0.5, y: 3.5, size: 20 },
  '1.410d': { x: 1, y: 3.5, size: 20 },
  '1.210d': { x: 0.5, y: 4, size: 20 },
  1.321: { x: 4.5, y: 9.5, size: 20 },
  1.421: { x: 5, y: 9.5, size: 20 },
  1.121: { x: 5, y: 10, size: 20 },
  1.221: { x: 4.5, y: 10, size: 20 },
  '1.321d': { x: 1.5, y: 2.5, size: 20 },
  '1.421d': { x: 2, y: 2.5, size: 20 },
  '1.221d': { x: 1.5, y: 3, size: 20 },
  1.332: { x: 6.5, y: 9.5, size: 20 },
  1.432: { x: 7, y: 9.5, size: 20 },
  1.132: { x: 7, y: 10, size: 20 },
  1.232: { x: 6.5, y: 10, size: 20 },
  '1.332d': { x: 9.5, y: 2.5, size: 20 },
  '1.432d': { x: 10, y: 2.5, size: 20 },
  '1.132d': { x: 10, y: 3, size: 20 },
  1.343: { x: 0.5, y: 7.5, size: 20 },
  1.443: { x: 1, y: 7.5, size: 20 },
  1.143: { x: 1, y: 8, size: 20 },
  1.243: { x: 0.5, y: 8, size: 20 },
  '1.343d': { x: 10.5, y: 3.5, size: 20 },
  '1.443d': { x: 11, y: 3.5, size: 20 },
  '1.143d': { x: 11, y: 4, size: 20 },
  1.354: { x: 1.5, y: 6.5, size: 20 },
  1.454: { x: 2, y: 6.5, size: 20 },
  1.154: { x: 2, y: 7, size: 20 },
  1.254: { x: 1.5, y: 7, size: 20 },
  '1.454d': { x: 9, y: 1.5, size: 20 },
  '1.154d': { x: 9, y: 2, size: 20 },
  '1.254d': { x: 8.5, y: 2, size: 20 },
  1.365: { x: 6.5, y: 8.5, size: 20 },
  1.465: { x: 7, y: 8.5, size: 20 },
  1.165: { x: 7, y: 9, size: 20 },
  1.265: { x: 6.5, y: 9, size: 20 },
  '1.465d': { x: 11, y: 1.5, size: 20 },
  '1.165d': { x: 11, y: 2, size: 20 },
  '1.265d': { x: 10.5, y: 2, size: 20 },
  1.376: { x: 4.5, y: 8.5, size: 20 },
  1.476: { x: 5, y: 8.5, size: 20 },
  1.176: { x: 5, y: 9, size: 20 },
  1.276: { x: 4.5, y: 9, size: 20 },
  '1.376d': { x: 0.5, y: 1.5, size: 20 },
  '1.176d': { x: 1, y: 2, size: 20 },
  '1.276d': { x: 0.5, y: 2, size: 20 },
  1.307: { x: 9.5, y: 6.5, size: 20 },
  1.407: { x: 10, y: 6.5, size: 20 },
  1.107: { x: 10, y: 7, size: 20 },
  1.207: { x: 9.5, y: 7, size: 20 },
  '1.307d': { x: 2.5, y: 1.5, size: 20 },
  '1.107d': { x: 3, y: 2, size: 20 },
  '1.207d': { x: 2.5, y: 2, size: 20 },
  '1.320': { x: 1.5, y: 7.5, size: 20 },
  '1.420': { x: 2, y: 7.5, size: 20 },
  '1.220': { x: 1.5, y: 8, size: 20 },
  '1.320d': { x: 10.5, y: 0.5, size: 20 },
  '1.420d': { x: 11, y: 0.5, size: 20 },
  '1.220d': { x: 10.5, y: 1, size: 20 },
  1.331: { x: 5.5, y: 6.5, size: 20 },
  1.431: { x: 6, y: 6.5, size: 20 },
  1.131: { x: 6, y: 7, size: 20 },
  1.231: { x: 5.5, y: 7, size: 20 },
  '1.331d': { x: 5.5, y: 0.5, size: 20 },
  '1.431d': { x: 6, y: 0.5, size: 20 },
  1.342: { x: 9.5, y: 7.5, size: 20 },
  1.442: { x: 10, y: 7.5, size: 20 },
  1.142: { x: 10, y: 8, size: 20 },
  '1.342d': { x: 0.5, y: 0.5, size: 20 },
  '1.442d': { x: 1, y: 0.5, size: 20 },
  '1.142d': { x: 1, y: 1, size: 20 },
  1.353: { x: 4.5, y: 5.5, size: 20 },
  1.453: { x: 5, y: 5.5, size: 20 },
  1.153: { x: 5, y: 6, size: 20 },
  1.253: { x: 4.5, y: 6, size: 20 },
  '1.453d': { x: 7, y: 1.5, size: 20 },
  '1.153d': { x: 7, y: 2, size: 20 },
  1.464: { x: 4, y: 9.5, size: 20 },
  1.164: { x: 4, y: 10, size: 20 },
  1.264: { x: 3.5, y: 10, size: 20 },
  '1.464d': { x: 2, y: 3.5, size: 20 },
  '1.164d': { x: 2, y: 4, size: 20 },
  '1.264d': { x: 1.5, y: 4, size: 20 },
  1.375: { x: 5.5, y: 2.5, size: 20 },
  1.475: { x: 6, y: 2.5, size: 20 },
  1.175: { x: 6, y: 4, size: 20 },
  1.275: { x: 5.5, y: 4, size: 20 },
  '1.175d': { x: 6, y: 3, size: 20 },
  '1.275d': { x: 5.5, y: 3, size: 20 },
  1.306: { x: 7.5, y: 9.5, size: 20 },
  1.106: { x: 8, y: 10, size: 20 },
  1.206: { x: 7.5, y: 10, size: 20 },
  '1.306d': { x: 9.5, y: 3.5, size: 20 },
  '1.106d': { x: 10, y: 4, size: 20 },
  '1.206d': { x: 9.5, y: 4, size: 20 },
  1.317: { x: 6.5, y: 5.5, size: 20 },
  1.417: { x: 7, y: 5.5, size: 20 },
  1.117: { x: 7, y: 6, size: 20 },
  1.217: { x: 6.5, y: 6, size: 20 },
  '1.317d': { x: 4.5, y: 1.5, size: 20 },
  '1.217d': { x: 4.5, y: 2, size: 20 },
  1.327: { x: 7.5, y: 8.5, size: 20 },
  1.427: { x: 8, y: 8.5, size: 20 },
  1.101: { x: 4, y: 5, size: 20 },
  1.227: { x: 7.5, y: 9, size: 20 },
  '1.327d': { x: 8.5, y: 3.5, size: 20 },
  '1.227d': { x: 8.5, y: 4, size: 20 },
  '1.330': { x: 8.5, y: 7.5, size: 20 },
  '1.430': { x: 9, y: 7.5, size: 20 },
  1.112: { x: 2, y: 0, size: 20 },
  '1.230': { x: 8.5, y: 8, size: 20 },
  '1.330d': { x: 3.5, y: 0.5, size: 20 },
  '1.430d': { x: 4, y: 0.5, size: 20 },
  1.341: { x: 2.5, y: 7.5, size: 20 },
  1.441: { x: 3, y: 7.5, size: 20 },
  1.141: { x: 3, y: 8, size: 20 },
  1.223: { x: 9.5, y: 0, size: 20 },
  '1.341d': { x: 7.5, y: 0.5, size: 20 },
  '1.441d': { x: 8, y: 0.5, size: 20 },
  1.352: { x: 3.5, y: 8.5, size: 20 },
  1.452: { x: 4, y: 8.5, size: 20 },
  1.152: { x: 4, y: 9, size: 20 },
  1.234: { x: 7.5, y: 5, size: 20 },
  '1.452d': { x: 3, y: 3.5, size: 20 },
  '1.152d': { x: 3, y: 4, size: 20 },
  1.345: { x: 7.5, y: 6.5, size: 20 },
  1.463: { x: 10, y: 8.5, size: 20 },
  1.163: { x: 10, y: 9, size: 20 },
  1.263: { x: 9.5, y: 9, size: 20 },
  '1.463d': { x: 2, y: 0.5, size: 20 },
  '1.163d': { x: 2, y: 1, size: 20 },
  1.356: { x: 6.5, y: 7.5, size: 20 },
  1.474: { x: 9, y: 9.5, size: 20 },
  1.174: { x: 9, y: 10, size: 20 },
  1.274: { x: 8.5, y: 10, size: 20 },
  '1.174d': { x: 10, y: 5, size: 20 },
  '1.274d': { x: 9.5, y: 5, size: 20 },
  1.305: { x: 2.5, y: 9.5, size: 20 },
  1.467: { x: 5, y: 7.5, size: 20 },
  1.105: { x: 3, y: 10, size: 20 },
  1.205: { x: 2.5, y: 10, size: 20 },
  '1.105d': { x: 2, y: 5, size: 20 },
  '1.205d': { x: 1.5, y: 5, size: 20 },
  1.316: { x: 1.5, y: 8.5, size: 20 },
  '1.470': { x: 4, y: 6.5, size: 20 },
  1.116: { x: 2, y: 9, size: 20 },
  1.216: { x: 1.5, y: 9, size: 20 },
  '1.316d': { x: 9.5, y: 0.5, size: 20 },
  '1.216d': { x: 9.5, y: 1, size: 20 },
  1.337: { x: 10.5, y: 9.5, size: 20 },
  1.437: { x: 11, y: 9.5, size: 20 },
  1.102: { x: 0, y: 7, size: 20 },
  1.237: { x: 10.5, y: 10, size: 20 },
  '1.337d': { x: 10.5, y: 4.5, size: 20 },
  '1.102d': { x: 0, y: 0, size: 20 },
  '1.340': { x: 8.5, y: 10.5, size: 20 },
  '1.440': { x: 9, y: 10.5, size: 20 },
  1.113: { x: 6, y: 8, size: 20 },
  1.213: { x: 5.5, y: 8, size: 20 },
  '1.340d': { x: 3.5, y: 2.5, size: 20 },
  '1.440d': { x: 8, y: 2.5, size: 20 },
  1.351: { x: 0.5, y: 9.5, size: 20 },
  1.451: { x: 1, y: 9.5, size: 20 },
  1.151: { x: 1, y: 10, size: 20 },
  1.224: { x: 11.5, y: 7, size: 20 },
  '1.224d': { x: 11.5, y: 0, size: 20 },
  '1.451d': { x: 1, y: 4.5, size: 20 },
  1.335: { x: 11.5, y: 8.5, size: 20 },
  1.462: { x: 0, y: 5.5, size: 20 },
  1.162: { x: 0, y: 5, size: 20 },
  1.235: { x: 11.5, y: 9, size: 20 },
  '1.462d': { x: 0, y: 4.5, size: 20 },
  '1.162d': { x: 0, y: 6, size: 20 },
  1.346: { x: 11.5, y: 7.5, size: 20 },
  1.473: { x: 8, y: 6.5, size: 20 },
  1.173: { x: 8, y: 7, size: 20 },
  1.273: { x: 7.5, y: 7, size: 20 },
  '1.346d': { x: 2.5, y: 4.5, size: 20 },
  '1.173d': { x: 9, y: 3, size: 20 },
  1.357: { x: 5.5, y: 10.5, size: 20 },
  1.457: { x: 6, y: 10.5, size: 20 },
  1.104: { x: 6, y: 5, size: 20 },
  1.204: { x: 5.5, y: 5, size: 20 },
  '1.104d': { x: 7, y: 5, size: 20 },
  '1.204d': { x: 4.5, y: 5, size: 20 },
  1.315: { x: 3.5, y: 6.5, size: 20 },
  '1.460': { x: 0, y: 7.5, size: 20 },
  1.115: { x: 4, y: 7, size: 20 },
  1.215: { x: 3.5, y: 7, size: 20 },
  '1.460d': { x: 9, y: 4.5, size: 20 },
  '1.215d': { x: 2.5, y: 3, size: 20 },
  1.326: { x: 11.5, y: 5.5, size: 20 },
  1.471: { x: 0, y: 8.5, size: 20 },
  1.171: { x: 0, y: 9, size: 20 },
  1.226: { x: 11.5, y: 5, size: 20 },
  '1.326d': { x: 11.5, y: 4.5, size: 20 },
  '1.226d': { x: 11.5, y: 6, size: 20 },
  1.347: { x: 9.5, y: 10.5, size: 20 },
  1.447: { x: 10, y: 10.5, size: 20 },
  1.103: { x: 9, y: 6, size: 20 },
  1.203: { x: 8.5, y: 6, size: 20 },
  '1.347d': { x: 3.5, y: 1.5, size: 20 },
  '1.103d': { x: 4, y: 1, size: 20 },
  '1.350': { x: 1.5, y: 10.5, size: 20 },
  '1.450': { x: 2, y: 10.5, size: 20 },
  1.114: { x: 3, y: 6, size: 20 },
  1.214: { x: 2.5, y: 6, size: 20 },
  '1.214d': { x: 7.5, y: 1, size: 20 },
  '1.450d': { x: 8, y: 1.5, size: 20 },
  1.325: { x: 4.5, y: 7.5, size: 20 },
  1.461: { x: 4, y: 3.5, size: 20 },
  1.161: { x: 4, y: 4, size: 20 },
  1.225: { x: 4.5, y: 8, size: 20 },
  '1.225d': { x: 8.5, y: 5, size: 20 },
  '1.461d': { x: 8, y: 4.5, size: 20 },
  1.336: { x: 7.5, y: 3.5, size: 20 },
  1.472: { x: 7, y: 7.5, size: 20 },
  1.172: { x: 7, y: 8, size: 20 },
  1.236: { x: 7.5, y: 4, size: 20 },
  '1.336d': { x: 3.5, y: 4.5, size: 20 },
  '1.172d': { x: 3, y: 5, size: 20 },
  '1.300': { x: 5.5, y: 5.5, size: 20 },
  '1.400': { x: 6, y: 5.5, size: 20 },
  '1.100': { x: 6, y: 6, size: 20 },
  '1.200': { x: 5.5, y: 6, size: 20 },
  '1.300d': { x: 5.5, y: 8.5, size: 20 },
  '1.400d': { x: 6, y: 8.5, size: 20 },
  '1.100d': { x: 6, y: 10, size: 20 },
  '1.200d': { x: 5.5, y: 10, size: 20 }
};

/**
 * Get the player object that corresponds to the recording player
 * from position data. If the player is not found then null is
 * returned.
 * @param {PositionData} data - The position data to get the player
 *   from.
 * @return {?Player} - The player object.
 */
function getPlayer(data) {
    var playerId = data.info.player;
    return data.data.players[playerId];
}

/**
 * Get the player objects from the data. If no players are found then
 * an empty array is returned.
 * @param {Replay} replay - The replay.
 * @return {Array.<Player>} - The players.
 */
function getPlayers(replay) {
    var players = [];
    for (var i in replay.data.players) {
        players.push(replay.data.players[i]);
    }
    return players;
}

/**
 * @typedef PlayerInfo
 * @type {object}
 * @property {string} name - The name of the player.
 * @property {?integer} degree - The degree of the player, or null if
 *   not visible.
 * @property {?auth} auth - Whether or not the player was
 *   authenticated, or null if not available.
 */
// Uses: context
/**
 * Draw the text around the player.
 * @param {Point} position - The draw position for the player.
 * @param {PlayerInfo} info - The information to draw.
 */
function drawText(position, info) {
    // Move from player position to text drawing position.
    position = {
        x: position.x + 30,
        y: position.y - 5
    };
    context.textAlign = 'left';
    context.fillStyle = info.auth ? "#BFFF00" : "#ffffff";
    context.strokeStyle = "#000000";
    context.shadowColor = "#000000";
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.lineWidth = 2;
    context.font = "bold 8pt Arial";
    context.shadowBlur = 10;
    context.strokeText(info.name, position.x + 3, position.y);
    if (info.degree && info.degree !== 0) {
        context.strokeText(info.degree + "°", position.x + 10, position.y + 12);
    }
    context.shadowBlur = 0;
    context.fillText(info.name, position.x + 3, position.y);
    if (info.degree && info.degree !== 0) {
        context.fillStyle = "#ffffff";
        context.fillText(info.degree + "°", position.x + 10, position.y + 12);
    }
}

// Uses: context
/**
 * [drawFlair description]
 * @param  {Point} ballFlair - Location of flair on sprite.
 * @param  {Point} pos - Location to draw flair on canvas.
 * @param  {Image} flair - Image representing the flair textures.
 */
function drawFlair(ballFlair, pos, flair) {
    if (ballFlair !== null) {
        context.drawImage(flair,
            ballFlair.x * 16,
            ballFlair.y * 16,
            16,
            16,
            pos.x,
            pos.y,
            16,
            16);
    }
}

// Uses: context
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

// Uses: thisI (var), prettyText (fn) - by extension context
function drawChats(replay) {
    var chats = replay.data.chat.slice().reverse();
    var time = replay.data.time[thisI];
    var currentChats = [];
    for (var i = chats.length - 1; i >= 0; i--) {
        var chat = chats[i];
        if (chat.time < time && chat.time + 3e4 > time) {
            currentChats.push(chat);
        }
        if (currentChats.length > 10) break;
    }

    var players = replay.data.players;
    currentChats.forEach(function(chat, i) {
        var left = 10;
        var top = context.canvas.height - 175 + i * 12;
        if (typeof chat.from == 'number') {
            if (players[chat.from].auth[thisI]) {
                left += prettyText("✓ ", left, top, "#BFFF00");
            }
            var chatName = players[chat.from].name[thisI];
            left += prettyText(chatName + ': ',
                left,
                top,
                players[chat.from].team[thisI] === 1 ? "#FFB5BD" : "#CFCFFF");
        }
        var color;
        if (chat.to == 'team') {
            color = players[chat.from].team[thisI] === 1 ? "#FFB5BD" : "#CFCFFF";
        } else if (chat.to == 'group') {
            color = "#E7E700";
        } else if (chat.color) {
            color = chat.color;
        } else {
            color = 'white';
        }
        prettyText(chat.message, left, top, color);
    });
}

// Uses: context
/**
 * Draw the juke juice image at the position specified, which should be
 * the player draw position.
 * @param  {Point} point - The location to draw the powerup over the
 *   player.
 * @param {Image} tiles - The image representing the tiles textures.
 */
function drawGrip(point, tiles) {
    context.drawImage(tiles,
        12 * TILE_SIZE,
        4 * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        point.x,
        point.y + 20,
        TILE_SIZE / 2,
        TILE_SIZE / 2);
}

// Uses: context
/**
 * Draw the rolling bomb powerup image at the position specified, which
 * should be the player draw position.
 * @param  {Point} point - The location to draw the powerup over the
 *   player.
 * @param {Image} rollingbomb - The texture representing the rolling
 *   bomb overlay.
 */
function drawBomb(point, rollingbomb) {
    // Draw 25% of the time.
    if (Math.round(Math.random() * 4) == 1) {
        context.drawImage(rollingbomb,
            0,
            0,
            TILE_SIZE,
            TILE_SIZE,
            point.x,
            point.y,
            TILE_SIZE,
            TILE_SIZE);
    }
}

// Uses: context
/**
 * Draw the tagpro powerup image at the position specified, which
 * should be the player draw position.
 * @param  {Point} point - The location to draw the powerup over the
 *   player.
 * @param {Image} tagpro - The image representing the tagpro overlay.
 */
function drawTagpro(point, tagpro) {
    context.drawImage(tagpro,
        0,
        0,
        TILE_SIZE,
        TILE_SIZE,
        point.x,
        point.y,
        TILE_SIZE,
        TILE_SIZE);
}

// Uses: $, thisI, context
function drawClock(positions) {
    // define the end time that applies to the current frame
    var thisEndTime,
        curTimeMilli,
        endTimes = positions.data.endTimes,
        curTime = '0:00',
        thisTime = positions.data.time[thisI],
        ended = false;
    for(var i = 0; i < endTimes.length; i++) {
        if(thisTime <= endTimes[i]) {
          thisEndTime = endTimes[i];
          break;
        }
        thisEndTime = endTimes[endTimes.length];
    }
    if(positions.data.end && positions.data.end.time <= thisTime) {
        ended = true;
    }


    if (!ended && thisEndTime > thisTime) {
        curTimeMilli = thisEndTime - thisTime;
        var minute = ('0' + Math.floor(curTimeMilli / 1000 / 60)).slice(-2);
        var seconds = ('0' + Math.floor(curTimeMilli / 1000 % 60)).slice(-2);
        seconds = (seconds == '60' ? '00' : seconds);
        curTime = minute + ':' + seconds;
    }
    context.fillStyle = "rgba(255, 255, 255, 1)";
    context.strokeStyle = "rgba(0, 0, 0, .75)";
    context.font = "bold 30pt Arial";
    context.textAlign = 'center';
    context.lineWidth = 4;
    context.strokeText(curTime, context.canvas.width / 2, context.canvas.height - 25);
    context.fillText(curTime, context.canvas.width / 2, context.canvas.height - 25);
}

/**
 * An object that holds the current score for a game.
 * @typedef ScoreObj
 * @type {object}
 * @property {integer} r - The score for the red team.
 * @property {integer} b - The score for the blue team.
 */
// Uses: context
/**
 * Takes a score object and 
 * @param  {ScoreObj} score - The score object for the current frame.
 */
function drawScore(score) {
    context.textAlign = "center";
    context.fillStyle = "rgba(255, 0, 0, .5)";
    context.font = "bold 40pt Arial";
    context.fillText(score.r, context.canvas.width / 2 - 120, context.canvas.height - 50);
    context.fillStyle = "rgba(0, 0, 255, .5)";
    context.fillText(score.b, context.canvas.width / 2 + 120, context.canvas.height - 50);
}

// Uses: thisI, context, img
/**
 * Draw flags at bottom of UI  indicating which flags are held.
 * @param {PositionData} positions
 * @param {Image} tiles
 */
function drawScoreFlag(positions, tiles) {
    var players = getPlayers(positions);
    players.forEach(function(player) {
        // Flag status for this player for this frame.
        var flagStatus = player.flag[thisI];
        // Check if they had the flag this frame.
        if (flagStatus !== null) {
            var flagCoords;
            if (flagStatus == '3') {
                flagCoords = {x: 13, y: 1};
            } else if (flagStatus == '1') {
                flagCoords = {x: 14, y: 1};
            } else if (flagStatus == '2') {
                flagCoords = {x: 15, y: 1};
            }
            if (typeof flagCoords !== 'undefined') {
                // Get team of player with flag.
                var flagTeam = player.team[thisI];
                var flagPos = {
                    x: context.canvas.width / 2 + (flagTeam == 1 ? -100 : 80),
                    y: context.canvas.height - 50
                };
                context.globalAlpha = 0.5;
                context.drawImage(tiles,
                    flagCoords.x * TILE_SIZE,
                    1 * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                    flagPos.x,
                    flagPos.y,
                    TILE_SIZE * 0.8,
                    TILE_SIZE * 0.8);
                context.globalAlpha = 1;
            }
        }
    });
}

// Uses: thisI, context
/**
 * Draw flag being carried by player.
 * @param  {Player} player  - The player to draw the flag for.
 * @param  {Point} point - The point to draw the flag.
 * @param {Image} tiles - The image representing the tiles texture.
 */
function drawFlag(player, point, tiles) {
    // Flag image locations on source image.
    var flagCodes = {
        1: {x: 14, y: 1},
        2: {x: 15, y: 1},
        3: {x: 13, y: 1}
    };
    if (player.flag[thisI] !== null) {
        var flagCoords = flagCodes[player.flag[thisI]];
        context.drawImage(tiles,
            flagCoords.x * TILE_SIZE,
            flagCoords.y * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
            point.x + 10,
            point.y - 30,
            TILE_SIZE,
            TILE_SIZE);
    }
}

/**
 * Given the map for the replay, generate the floorMap, specifying the
 * floor tiles to draw underneath dynamic and partially transparent
 * tiles.
 * @param {} map - The map.
 * @return {Array.<Array.<number>>} - Specifies the floor tiles to be
 *   drawn, or -1 if not needed at a location.
 */
function makeFloorMap(map) {
    // Directions to check for neighboring special tiles.
    var defaultOffsets = [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
    ];

    // Check if position is in the bounds of the map.
    // loc is an object with x and y properties.
    function inBounds(loc) {
        return loc.x >= 0 && loc.x < map.length && loc.y >= 0 && loc.y < map[0].length;
    }

    // Given a position, return the tile value in the map. If outside
    // map bounds, return 0.
    function getTileValue(loc) {
        if (inBounds(loc)) {
            return map[loc.x][loc.y];
        } else {
            return 0;
        }
    }

    // Get values of tiles at provided position.
    function getNeighbors(loc, offsets) {
        return offsets.map(function(offset) {
            return { x: loc.x + offset.x, y: loc.y + offset.y };
        });
    }
    // Takes x and y from map.
    function setFloorTile(x, y) {
        var draw = true,
            val, // Value to use for all contiguous drawFloor tiles.
            nodes = [{ x: x, y: y }],
            adjacent = [],
            visited = {}; // Track visited locations.

        while (nodes.length > 0) {
            var node = nodes.shift();
            if (visited[node.x + ',' + node.y]) {
                continue;
            }
            visited[node.x + ',' + node.y] = true;
            var thisVal = getTileValue(node);
            // Value is in list of special floor tiles.
            if (floorTiles.indexOf(thisVal) !== -1) {
                if (typeof val !== "undefined" && val !== thisVal) {
                    val = 2;
                } else {
                    val = thisVal;
                }
            } else {
                // Node is an adjacent tile that also needs its floor
                // drawn.
                var tile = tiles[thisVal];
                if (tile && tile.drawFloor) {
                    if (tile.redrawFloor) {
                        draw = false;
                    }
                    var neighbors;
                    if (Array.isArray(tile.drawFloor)) {
                        neighbors = getNeighbors(node, tile.drawFloor);
                    } else {
                        neighbors = getNeighbors(node, defaultOffsets);
                    }
                    neighbors.forEach(function(neighbor) {
                        var val = getTileValue(neighbor);
                        // Ensure tiles are in bounds and disregard diagonal tiles that aren't
                        // across from the current tile.
                        if (tiles[val] && Array.isArray(tiles[val].drawFloor) &&
                            !tiles[val].drawFloor.some(function(other) {
                                return other.x == -neighbor.x && other.y == -neighbor.y;
                            })) {
                            return;
                        }
                        nodes.push(neighbor);
                    });
                    adjacent.push(node);
                }
            }
        }
        // Default value for underneath tile.
        if (typeof val == "undefined" || !val && !draw) {
            val = 2;
        }
        adjacent.forEach(function(tile) {
            floorMap[tile.x][tile.y] = val;
        });
    }
    // Tile values that bleed over into adjacent tiles.
    var floorTiles = [0, 2, 11, 12, 17, 18],
        floorMap = [];
    // Initialize floor map array with -1.
    for (var x = 0; x < map.length; x++) {
        floorMap[x] = [];
        for (var y = 0; y < map[0].length; y++) {
            floorMap[x][y] = -1;
        }
    }
    map.forEach(function(row, x) {
        row.forEach(function(val, y) {
            if (floorMap[x][y] == -1 && tiles[val] && tiles[val].drawFloor) {
                setFloorTile(x, y);
            }
        });
    });
    return floorMap;
}

/**
 * Takes in the replay data and returns a DataURL (png) representing the map background.
 * @param {Replay} replay - The replay data.
 * @param {Image} tiles - The image representing the tiles texture.
 * @return {string} - DataURL representing the map.
 */
window.drawMap = function(replay, tilesTexture) {
    var posx = 0;
    var posy = 0;
    var newcan = document.createElement('canvas');
    newcan.id = 'newCanvas';
    newcan.style.display = 'none';
    document.body.appendChild(newcan);
    newcan = document.getElementById('newCanvas');
    newcan.width = replay.data.map.length * TILE_SIZE;
    newcan.height = replay.data.map[0].length * TILE_SIZE;
    newcan.style.zIndex = 200;
    newcan.style.position = 'absolute';
    newcan.style.top = 0;
    newcan.style.left = 0;
    var newcontext = newcan.getContext('2d');

    var floorMap = makeFloorMap(replay.data.map);
    var wallMap = replay.data.wallMap;
    var wallOffsets = [
        { x: 0, y: 0},
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 }
    ];

    replay.data.map.forEach(function(row, x) {
        row.forEach(function(tileId, y) {
            var tile = tiles[tileId];
            var tileSize = tile.size || TILE_SIZE;
            var loc = { x: x, y: y };

            // Draw floor underneath tiles where relevant.
            if (tile.drawFloor) {
                var floorTile = tiles[floorMap[loc.x][loc.y]];
                newcontext.drawImage(tilesTexture,
                    floorTile.x * TILE_SIZE,
                    floorTile.y * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                    loc.x * TILE_SIZE + posx,
                    loc.y * TILE_SIZE + posy,
                    TILE_SIZE,
                    TILE_SIZE);
            }
            // Skip drawing dynamic tiles.
            if (tile.dynamic) return;
            // Get wall quadrants and draw.
            if (Math.floor(tileId) === 1) {
                // Get coordinates for floor tile.
                var quadrants = wallMap[loc.x][loc.y];
                quadrants.forEach(function(quadrant, i) {
                    var offset = wallOffsets[i];
                    var quadrantTile = tiles[quadrant];
                    var quadrantSize = quadrantTile.size;
                    newcontext.drawImage(tilesTexture,
                        quadrantTile.x * tileSize,
                        quadrantTile.y * tileSize,
                        quadrantSize,
                        quadrantSize,
                        loc.x * tileSize + offset.x + posx,
                        loc.y * tileSize + offset.y + posy,
                        quadrantSize,
                        quadrantSize);
                });
            } else {
                // Draw tile.
                newcontext.drawImage(tilesTexture,
                    tile.x * tileSize,
                    tile.y * tileSize,
                    tileSize,
                    tileSize,
                    loc.x * tileSize + posx,
                    loc.y * tileSize + posy,
                    tileSize,
                    tileSize);
            }
        });
    });
    return newcontext.canvas.toDataURL();
};

/**
 * Draw the dynamic floor tiles.
 * @param  {Replay} replay - The replay data.
 * @return {TextureImages} textures
 */
function drawFloorTiles(replay, textures) {
    var player = getPlayer(replay);
    var fps = replay.info.fps;
    var mod = thisI % (fps * 2 / 3);
    var fourth = (fps * 2 / 3) / 4;
    var animationTile = Math.floor(mod / fourth);

    replay.data.dynamicTiles.forEach(function(dynamicTile) {
        var loc = {
          x: dynamicTile.x,
          y: dynamicTile.y
        };
        var tileId = dynamicTile.value[thisI];
        var tile = tiles[tileId];
        var size = tile.size || TILE_SIZE;
        var textureName = tile.img || "tiles";
        var spriteLoc;
        if (tile.animated) {
            spriteLoc = {
              x: animationTile,
              y: 0
            };
        } else {
            spriteLoc = {
              x: tile.x,
              y: tile.y
            };
        }
        context.drawImage(textures[textureName],
            spriteLoc.x * TILE_SIZE,
            spriteLoc.y * TILE_SIZE,
            size,
            size,
            loc.x * TILE_SIZE + posx,
            loc.y * TILE_SIZE + posy,
            size,
            size);
    });
}

function bombPop(replay) {
    replay.data.bombs.forEach(function (bmb) {
        var bTime = bmb.time;
        var cTime = replay.data.time[thisI];
        if(bTime <= cTime && cTime - bTime <= 200 && bmb.type === 2) {
            if(typeof bmb.bombAnimation === 'undefined') {
                bmb.bombAnimation = {
                    length: Math.round(replay.info.fps / 10),
                    frame: 0
                };
            }
            
            if(bmb.bombAnimation.frame < bmb.bombAnimation.length) {
                bmb.bombAnimation.frame++;
                bombSize = 40 + (280 * (bmb.bombAnimation.frame / bmb.bombAnimation.length));
                bombOpacity = 1 - bmb.bombAnimation.frame / bmb.bombAnimation.length;
                context.fillStyle = "#FF8000";
                context.globalAlpha = bombOpacity;
                context.beginPath();
                bombX = bmb.x + posx + TILE_SIZE / 2;
                bombY = bmb.y + posy + TILE_SIZE / 2;
                context.arc(bombX, bombY, Math.round(bombSize), 0, 2 * Math.PI, true);
                context.closePath();
                context.fill();
                context.globalAlpha = 1;
                context.fillStyle = "#ffffff";
            } 
        } else {
            delete bmb.bombAnimation;
        }
    });
}

/**
 * Check if the given player collided with any other players at this
 * point in the replay.
 * @param  {Player} player - The player to check for collisions.
 * @param  {PositionData} data - The replay data.
 * @return {boolean} - Whether or not there was a recent collision.
 */
function ballCollision(player, data) {
    var prevX = player.x[thisI - 1];
    var prevY = player.y[thisI - 1];
    var thisX = player.x[thisI];
    var thisY = player.y[thisI];
    for (var j in data.data.players) {
        var otherPlayer = data.data.players[j];
        // Skip checking current player.
        if (otherPlayer === player) continue;
        var prevOtherX = otherPlayer.x[thisI - 1];
        var prevOtherY = otherPlayer.y[thisI - 1];
        var thisOtherX = otherPlayer.x[thisI];
        var thisOtherY = otherPlayer.y[thisI];
        if ((Math.abs(prevOtherX - prevX) < 45 && Math.abs(prevOtherY - prevY) < 45) ||
            (Math.abs(thisOtherX - thisX) < 45 && Math.abs(thisOtherY - thisY) < 45)) {
            return true;
        }
    }
    return false;
}

// Uses: thisI
/**
 * Initiate or continue a rolling bomb explosion animation for the
 * given player.
 * @param  {Player} player - The player to do the animation update for.
 * @param  {PositionData} data - The replay data.
 */
function rollingBombPop(player, data) {
    var recordingPlayer = getPlayer(data);
    // determine if we need to start a rolling bomb animation: ball has no bomb now, but had bomb one frame ago
    if (!player.bomb[thisI] & player.bomb[thisI - 1] & ballCollision(player, data)) {
        player.rollingBombAnimation = {
            length: Math.round(data.info.fps / 10),
            frame: 0
        };
    }
    // if an animation should be in progress, draw it
    if (typeof player.rollingBombAnimation !== 'undefined') {
        player.rollingBombAnimation.frame++;
        rollingBombSize = 40 + (200 * (player.rollingBombAnimation.frame / player.rollingBombAnimation.length));
        rollingBombOpacity = 1 - player.rollingBombAnimation.frame / player.rollingBombAnimation.length;

        context.fillStyle = "#FFFF00";
        context.globalAlpha = rollingBombOpacity;
        context.beginPath();
        rollingBombX = player.x[thisI] - recordingPlayer.x[thisI] + context.canvas.width / 2;
        rollingBombY = player.y[thisI] - recordingPlayer.y[thisI] + context.canvas.height / 2;
        context.arc(rollingBombX, rollingBombY, Math.round(rollingBombSize), 0, 2 * Math.PI, !0);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = "#ffffff";
        if (player.rollingBombAnimation.frame >= player.rollingBombAnimation.length) {
            delete(player.rollingBombAnimation);
        }
    }
}

// Uses: thisI, context
/**
 * Initiate or continue a ball pop animation for the given player.
 * @param {Player} player - The player to update the ball pop 
 *   animation for.
 * @param {PositionData} data - The replay data.
 * @param {Image} tiles - The image representing the tiles textures.
 */
function ballPop(player, data, tiles) {
    // Get the recording player so we can put the view relative to them.
    var recordingPlayer = getPlayer(data);
    // determine if we need to start a pop animation: ball is dead now, but was not dead one frame ago
    if (player.dead[thisI] && !player.dead[thisI - 1] && player.draw[thisI - 1]) {
        player.popAnimation = {
            length: Math.round(data.info.fps / 10),
            frame: 0
        };
    }
    // if an animation should be in progress, draw it
    if (typeof player.popAnimation !== 'undefined') {
        player.popAnimation.frame++;
        popSize = 40 + (80 * (player.popAnimation.frame / player.popAnimation.length));
        popOpacity = 1 - player.popAnimation.frame / player.popAnimation.length;

        context.globalAlpha = popOpacity;
        context.drawImage(tiles,
            (player.team[thisI] == 1 ? 14 : 15) * TILE_SIZE,
            0,
            TILE_SIZE,
            TILE_SIZE,
            player.x[thisI] - recordingPlayer.x[thisI] + context.canvas.width / 2 - popSize / 2,
            player.y[thisI] - recordingPlayer.y[thisI] + context.canvas.height / 2 - popSize / 2,
            popSize,
            popSize);
        context.globalAlpha = 1;
        if (player.popAnimation.frame >= player.popAnimation.length) {
            delete(player.popAnimation);
        }
    }
}

// Uses: thisI, context, posx, poxy
/**
 * Draw splats.
 * @param  {PositionData} positions
 * @param  {Image} img - The splats image to use.
 */
function drawSplats(positions, img) {
    // Draw the splats that occurred up to this point in time.
    var splats = positions.data.splats;
    splats.forEach(function(splat) {
        // Cache the number corresponding to the splat image used.
        if (!splat.img) {
            splat.img = Math.floor(Math.random() * 7);
        }
        var thisTime = positions.data.time[thisI];
        if (splat.time <= thisTime) {
            context.drawImage(img,
                splat.img * 120,
                (splat.team - 1) * 120,
                120,
                120,
                splat.x + posx - 60 + 20,
                splat.y + posy - 60 + 20,
                120,
                120);
        }
    });
}

// Uses: context, thisI
/**
 * Draw spawning players.
 * @param  {PositioinData} positions
 * @param  {Image} tiles - The tiles texture image.
 */
function drawSpawns(positions, tiles) {
    context.globalAlpha = 0.25;
    var spawns = positions.data.spawns;
    spawns.forEach(function(spawn) {
        var thisTime = positions.data.time[thisI];
        var timeDiff = thisTime - spawn.time; // positive if spawn has already happened
        if (timeDiff >= 0 & timeDiff <= spawn.wait) {
            context.drawImage(tiles,
                (spawn.team == 1 ? 14 : 15) * TILE_SIZE,
                0,
                40,
                40,
                spawn.x + posx,
                spawn.y + posy,
                40,
                40);
        }
    });
    context.globalAlpha = 1;
}

// Scope: file
// Uses: context, thisI
function drawEndText(positions) {
    if (positions.data.end) {
        var endTime = positions.data.end.time;
        var thisTime = positions.data.time[thisI];
        if (endTime <= thisTime) {
            var endColor, endText;
            var winner = positions.data.end.winner;
            if (winner === 'red') {
                endColor = "#ff0000";
                endText = "Red Wins!";
            } else if (winner === 'blue') {
                endColor = "#0000ff";
                endText = "Blue Wins!";
            } else if (winner === 'tie') {
                endColor = "#ffffff";
                endText = "It's a Tie!";
            } else {
                endColor = "#ffffff";
                endText = winner;
            }
            context.save();
            context.textAlign = "center";
            context.font = "bold 48pt Arial";
            context.fillStyle = endColor;
            context.strokeStyle = "#000000";
            context.strokeText(endText, context.canvas.width / 2, 100);
            context.fillText(endText, context.canvas.width / 2, 100);
            context.restore();
        }
    }
}

// scope: file
// uses: context, img, thisI
/**
 * Draw players.
 * @param  {PositionData} positions
 * @param {TextureImages} textures
 * @param  {boolean} spin
 */
function drawBalls(positions, textures, spin) {
    // Get the team for a player object.
    function getTeam(player, frame) {
        return player.team[frame];
    }

    // Get the name for a player object.
    function getName(player, frame) {
        return player.name[frame];
    }

    function getDead(player, frame) {
        return player.dead[frame];
    }

    function getDraw(player, frame) {
        return player.draw[frame];
    }

    /**
     * Get position for the player, in global coordinates. Position in
     * game data corresponds to the top-left corner of player sprite.
     * The center of the player is an additional 20 units more in the
     * x and y directions from the value returned here.
     * @param  {Player} player - The player to get the position for.
     * @param  {integer} frame - The grame to get the position for.
     * @return {Point} - The position of the player.
     */
    function getPos(player, frame) {
        return {
            x: player.x[frame],
            y: player.y[frame]
        };
    }

    /**
     * Get the angle for the player. If no angle is found, returns null.
     * @param  {Player} player - The player to get the angle for.
     * @param  {integer} frame - The frame to get the angle for.
     * @return {?number} - The angle of the player.
     */
    function getAngle(player, frame) {
        if (player.angle) {
            return player.angle[frame];
        } else {
            return null;
        }
    }

    function getDegree(player, frame) {
        if (typeof player.degree !== 'undefined') {
            return player.degree[frame];
        } else {
            return null;
        }
    }

    function getAuth(player, frame) {
        if (typeof player.auth !== 'undefined') {
            return player.auth[frame];
        } else {
            return null;
        }
    }

    function getGrip(player, frame) {
        return player.grip[thisI];
    }

    function getBomb(player, frame) {
        return player.bomb[thisI];
    }

    function getTagpro(player, frame) {
        return player.tagpro[thisI];
    }

    // Get the screen coordinates for the top-left of the player
    // sprite.
    function getDrawPosition(center, position) {
        return {
            x: position.x + center.x,
            y: position.y + center.y
        };
    }

    var screenCenter = {
        x: posx,
        y: posy
    };
    var players = getPlayers(positions);
    players.forEach(function(player) {
        var position = getPos(player, thisI);
        var drawPos = getDrawPosition(screenCenter, position);
        var team = getTeam(player, thisI);
        var name = getName(player, thisI);
        var dead = getDead(player, thisI);
        var angle = getAngle(player, thisI);
        var draw = getDraw(player, thisI);
        var auth = getAuth(player, thisI);
        var degree = getDegree(player, thisI);
        var grip = getGrip(player, thisI);
        var bomb = getBomb(player, thisI);
        var tagpro = getTagpro(player, thisI);

        if (!dead && draw) {
            // If at the start of the replay or the player was drawn last frame.
            if (thisI === 0 || getDraw(player, thisI - 1)) {
                if ((getDead(player, thisI - 1) &&
                     position.x !== getPos(player, thisI - player.fps)) ||
                    !getDead(player, thisI - 1)) {
                    
                    // draw with or without spin
                    if(!spin || !angle) {
                        context.drawImage(textures.tiles,
                            (team == 1 ? 14 : 15) * TILE_SIZE,
                            0,
                            TILE_SIZE,
                            TILE_SIZE,
                            drawPos.x,
                            drawPos.y,
                            TILE_SIZE,
                            TILE_SIZE);
                    } else {
                        // Add half a tile width so this is truly in
                        // the center of the player, so rotation
                        // doesn't change location.
                        var playerCenter = {
                            x: drawPos.x + TILE_SIZE / 2,
                            y: drawPos.y + TILE_SIZE / 2
                        };
                        context.translate(playerCenter.x,
                            playerCenter.y);
                        context.rotate(angle);
                        context.drawImage(textures.tiles,
                            (team == 1 ? 14 : 15) * TILE_SIZE,    
                            0,
                            TILE_SIZE,
                            TILE_SIZE,
                            -TILE_SIZE / 2,
                            -TILE_SIZE / 2,
                            TILE_SIZE,
                            TILE_SIZE);
                        context.rotate(-angle);
                        context.translate(-playerCenter.x,
                            -playerCenter.y);
                    }

                    if (grip) {
                        drawGrip(drawPos, textures.tiles);
                    }
                    if (tagpro) {
                        drawTagpro(drawPos, textures.tagpro);
                    }
                    if (bomb) {
                        drawBomb(drawPos, textures.rollingbomb);
                    }

                    drawFlag(player, drawPos, textures.tiles);
                    drawText(drawPos, {
                        name: name,
                        degree: degree,
                        auth: auth
                    });

                    drawFlair(player.flair[thisI], {
                        x: drawPos.x + 12,
                        y: drawPos.y - 20
                    }, textures.flair);
                }
            }
        }
        rollingBombPop(player, positions);
        ballPop(player, positions, textures.tiles);
    });
}

// Scope: background, in-page-preview
// uses: context
/**
 * Edit canvas to reflect the replay at the given frame.
 * @param  {integer} frame - The frame of the replay to render.
 * @param  {PositionData} positions - The replay data.
 * @param  {?} mapImg
 * @param {Options} [options] - Options for the rendering.
 * @param {Textures} textures - the textures to use.
 * @param {CanvasRenderingContext2D} ctx - The context to draw on.
 */
window.animateReplay = function(frame, positions, mapImg, options, textures, ctx) {
    if (typeof options == 'undefined') options = {};
    // Update drawing function global with frame number.
    thisI = frame;
    context = ctx;

    var player = getPlayer(positions);
    // Clear canvas.
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    // Coordinates for center of canvas.
    posx = -(player.x[thisI] - context.canvas.width / 2 + TILE_SIZE / 2);
    posy = -(player.y[thisI] - context.canvas.height / 2 + TILE_SIZE / 2);
    context.drawImage(mapImg, 0, 0, mapImg.width, mapImg.height,
        posx,
        posy,
        mapImg.width, mapImg.height);
    if (options.splats) {
        drawSplats(positions, textures.splats);
    }
    drawFloorTiles(positions, textures);
    drawSpawns(positions, textures.tiles);
    drawBalls(positions, textures, options.spin);
    if (options.ui) {
        drawClock(positions);
        drawScore(positions.data.score[thisI]);
        drawScoreFlag(positions, textures.tiles);
    }
    if (options.chat) {
        drawChats(positions);
    }
    bombPop(positions);
    drawEndText(positions);
};

// function that takes positions file and draws the frame 75% of the way through the 
// replay at full size. then redraws that at reduced size.
// returns a dataURL of the resulting image
// used by: menu
window.drawPreview = function(positions, options, textures) {
    console.log("Drawing preview.");

    // create two canvases - one to draw full size preview, one to draw the half size one.
    var fullPreviewCanvas = document.createElement('canvas');
    fullPreviewCanvas.width = 1280;
    fullPreviewCanvas.height = 800;
    fullPreviewContext = fullPreviewCanvas.getContext('2d');

    var smallPreviewCanvas = document.createElement('canvas');
    smallPreviewCanvas.width = fullPreviewCanvas.width / 2;
    smallPreviewCanvas.height = fullPreviewCanvas.height / 2;
    smallPreviewContext = smallPreviewCanvas.getContext('2d');
    var thisI = 0;

    smallPreviewContext.rect(0, 0, smallPreviewCanvas.width, smallPreviewCanvas.height);
    smallPreviewContext.fillStyle = 'black';
    smallPreviewContext.fill();
    
    var replayLength = positions.data.time.length;
    thisI = Math.round(replayLength * 0.75);
    
    var previewMapData = drawMap(positions, textures.tiles);
    var previewMap = document.createElement('img');
    previewMap.src = previewMapData;

    animateReplay(thisI, positions, previewMap, options, textures, fullPreviewContext);
    var fullImageData = fullPreviewCanvas.toDataURL();

    var fullSizeImg = document.createElement('img');
    fullSizeImg.src = fullImageData;
    smallPreviewContext.drawImage(fullSizeImg,
                                  0, 
                                  0,
                                  fullPreviewCanvas.width,
                                  fullPreviewCanvas.height,
                                  0,
                                  0,
                                  smallPreviewCanvas.width,
                                  smallPreviewCanvas.height);
    var result = smallPreviewCanvas.toDataURL();
    previewMap.remove();
    fullSizeImg.remove();
    return result;
};

})(window);

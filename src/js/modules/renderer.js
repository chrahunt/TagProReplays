/**
 * This file contains the functions used to draw the replay data onto
 * the canvas for the in-page preview as well as for replay rendering.
 */
var $ = require('jquery');
var moment = require('moment');

// Constant tile size.
var TILE_SIZE = 40;
var SPLAT_SIZE = 120;

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

var flagTiles = {
    1: 'redflag',
    2: 'blueflag',
    3: 'yellowflag'
};

function Renderer(replay, opts) {
    this.options = opts.options;
    this.textures = opts.textures;
    this.replay = replay;
    if (opts.canvas) {
        this.canvas = opts.canvas;
    } else {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.canvas_width;
        this.canvas.height = this.options.canvas_height;
    }
    this.context = this.canvas.getContext('2d');
    this.frame = 0;
    this.state = {
        players: {},
        splats: {},
        bombs: {}
    };
    this.camera = {
        x: 0,
        y: 0
    };
    // Initialize state for each player.
    for (var id in this.replay.data.players) {
        this.state.players[id] = {
            pops: [],
            bombs: []
        };
    }
    var mapImg = this.makeBackgroundTexture();
    // draw background
    this.background = new Image();
    // TODO: fire ready.
    this.background.onload = function() {

    };
    this.background.src = mapImg;
}

module.exports = Renderer;

Renderer.prototype.onReady = function(fn) {
    if (this.ready) {
        fn();
    } else {
        this._onReady = fn;
    }
};

Renderer.prototype.setFrame = function(i) {
    this.frame = i;
};

Renderer.prototype.getCamera = function() {
    var player = this.getPlayer();
    return {
        x: player.x[this.frame] + TILE_SIZE / 2,
        y: player.y[this.frame] + TILE_SIZE / 2
    };
};

Renderer.prototype.toScreen = function(loc) {
    return {
        x: loc.x - this.camera.x + this.center.x,
        y: loc.y - this.camera.y + this.center.y
    };
};

/**
 * Draw frame of replay.
 * @param {integer} i - The frame to draw.
 */
Renderer.prototype.drawFrame = function(i) {
    var ctx = this.context;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    this.setFrame(i);
    this.camera = this.getCamera();
    this.screen = {
        x: ctx.canvas.width,
        y: ctx.canvas.height
    };
    this.center = {
        x: this.screen.x / 2,
        y: this.screen.y / 2
    };

    this.drawBackground();
    if (this.options.splats) {
        this.drawSplats();
    }
    this.drawFloorTiles();
    this.drawSpawns();
    this.drawPlayers();
    if (this.options.ui) {
        this.drawUI();
    }
    if (this.options.chat) {
        this.drawChats();
    }
    this.drawExplosions();
    this.drawEndText();
};

Renderer.prototype.drawUI = function() {
    this.drawClock();
    this.drawScore(this.replay.data.score[this.frame]);
    this.drawScoreFlag();
};

Renderer.prototype.drawBackground = function() {
    var offset = this.toScreen({
        x: 0,
        y: 0
    });
    this.context.drawImage(this.background,
        0,
        0,
        this.background.width,
        this.background.height,
        offset.x,
        offset.y,
        this.background.width,
        this.background.height);
};

Renderer.prototype.getContext = function() {
    return this.context;
};

/**
 * Get the player object that corresponds to the recording player
 * from position data. If the player is not found then null is
 * returned.
 * @param {PositionData} data - The position data to get the player
 *   from.
 * @return {?Player} - The player object.
 */
// done
Renderer.prototype.getPlayer = function() {
    var playerId = this.replay.info.player;
    return this.replay.data.players[playerId];
};

/**
 * Get the player objects from the data. If no players are found then
 * an empty array is returned.
 * @param {Replay} replay - The replay.
 * @return {Array.<Player>} - The players.
 */
// done
Renderer.prototype.getPlayers = function() {
    var players = [];
    for (var i in this.replay.data.players) {
        players.push(this.replay.data.players[i]);
    }
    return players;
};

/**
 * @typedef PlayerInfo
 * @type {object}
 * @property {string} name - The name of the player.
 * @property {?integer} degree - The degree of the player, or null if
 *   not visible.
 * @property {?auth} auth - Whether or not the player was
 *   authenticated, or null if not available.
 */
/**
 * Draw the text around the player.
 * @param {Point} position - The draw position for the player.
 * @param {PlayerInfo} info - The information to draw.
 */
Renderer.prototype.drawText = function(position, info) {
    var ctx = this.context;
    // Move from player position to text drawing position.
    position = {
        x: position.x + 30,
        y: position.y - 5
    };
    ctx.textAlign = 'left';
    ctx.fillStyle = info.auth ? "#BFFF00" : "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.shadowColor = "#000000";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 2;
    ctx.font = "bold 8pt Arial";
    ctx.shadowBlur = 10;
    ctx.strokeText(info.name, position.x + 3, position.y);
    if (info.degree && info.degree !== 0) {
        ctx.strokeText(info.degree + "°", position.x + 10, position.y + 12);
    }
    ctx.shadowBlur = 0;
    ctx.fillText(info.name, position.x + 3, position.y);
    if (info.degree && info.degree !== 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(info.degree + "°", position.x + 10, position.y + 12);
    }
};

/**
 * @param {Point} pos - Location to draw flair on canvas.
 * @param {Point} ballFlair - Location of flair on sprite.
 */
Renderer.prototype.drawFlair = function(pos, flair) {
    this.context.drawImage(this.textures.flair,
        flair.x * 16,
        flair.y * 16,
        16,
        16,
        pos.x,
        pos.y,
        16,
        16);
};

Renderer.prototype.prettyText = function(text, textx, texty, color) {
    var ctx = this.context;
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.strokeStyle = "#000000";
    ctx.shadowColor = "#000000";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 2;
    ctx.font = "bold 8pt Arial";
    ctx.shadowBlur = 10;
    ctx.strokeText(text, textx, texty);
    ctx.shadowBlur = 0;
    ctx.fillText(text, textx, texty);
    return ctx.measureText(text).width;
};

Renderer.prototype.drawChats = function() {
    var chats = this.replay.data.chat.slice().reverse();
    var frame = this.frame;
    var self = this;
    var time = this.replay.data.time[frame];
    var currentChats = [];
    for (var i = chats.length - 1; i >= 0; i--) {
        var chat = chats[i];
        if (chat.time < time && chat.time + 3e4 > time) {
            currentChats.push(chat);
        }
        if (currentChats.length > 10) break;
    }
    var ctx = this.context;
    var players = this.replay.data.players;
    currentChats.forEach(function(chat, i) {
        var left = 10;
        var top = ctx.canvas.height - 175 + i * 12;
        if (typeof chat.from == 'number') {
            if (players[chat.from].auth[frame]) {
                left += self.prettyText("✓ ", left, top, "#BFFF00");
            }
            var chatName = players[chat.from].name[frame];
            left += self.prettyText(chatName + ': ',
                left,
                top,
                players[chat.from].team[frame] === 1 ? "#FFB5BD" : "#CFCFFF");
        }
        var color;
        if (chat.to == 'team') {
            color = players[chat.from].team[frame] === 1 ? "#FFB5BD" : "#CFCFFF";
        } else if (chat.to == 'group') {
            color = "#E7E700";
        } else if (chat.color) {
            color = chat.color;
        } else {
            color = 'white';
        }
        self.prettyText(chat.message, left, top, color);
    });
};

/**
 * Draw the juke juice image at the position specified, which should be
 * the player draw position.
 * @param  {Point} point - The location to draw the powerup over the
 *   player.
 */
// done
Renderer.prototype.drawGrip = function(point) {
    this.context.drawImage(this.textures.tiles,
        12 * TILE_SIZE,
        4 * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        point.x,
        point.y + 20,
        TILE_SIZE / 2,
        TILE_SIZE / 2);
};

/**
 * Draw the rolling bomb powerup image at the position specified, which
 * should be the player draw position.
 * @param  {Point} point - The location to draw the powerup over the
 *   player.
 */
// done
Renderer.prototype.drawBomb = function(point) {
    // Draw 25% of the time.
    if (Math.round(Math.random() * 4) == 1) {
        this.context.drawImage(this.textures.rollingbomb,
            0,
            0,
            TILE_SIZE,
            TILE_SIZE,
            point.x,
            point.y,
            TILE_SIZE,
            TILE_SIZE);
    }
};

/**
 * Draw the tagpro powerup image at the position specified, which
 * should be the player draw position.
 * @param  {Point} point - The location to draw the powerup over the
 *   player.
 */
// done
Renderer.prototype.drawTagpro = function(point) {
    this.context.drawImage(this.textures.tagpro,
        0,
        0,
        TILE_SIZE,
        TILE_SIZE,
        point.x,
        point.y,
        TILE_SIZE,
        TILE_SIZE);
};

Renderer.prototype.drawClock = function() {
    // define the end time that applies to the current frame
    var endTimes = this.replay.data.endTimes.map(function (t) {
            return moment(t);
        }),
        time = moment(this.replay.data.time[this.frame]),
        endTime, clockTime;

    for (var i = 0; i < endTimes.length; i++) {
        if (time.isBefore(endTimes[i])) {
          endTime = endTimes[i];
          break;
        }
    }

    if (endTime) {
        if (this.replay.data.gameEnd) {
            var gameEnd = moment(this.replay.data.gameEnd.time);
            if (gameEnd.isBefore(time)) {
                clockTime = moment(endTime.diff(gameEnd)).format("mm:ss");
            }
        }
        if (!clockTime) {
            clockTime = moment(endTime.diff(time)).format("mm:ss");
        }
    } else {
        // After clock has run out.
        clockTime = "0:00";
    }
    var ctx = this.context;
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.strokeStyle = "rgba(0, 0, 0, .75)";
    ctx.font = "bold 30pt Arial";
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeText(clockTime, ctx.canvas.width / 2, ctx.canvas.height - 25);
    ctx.fillText(clockTime, ctx.canvas.width / 2, ctx.canvas.height - 25);
};

/**
 * An object that holds the current score for a game.
 * @typedef ScoreObj
 * @type {object}
 * @property {integer} r - The score for the red team.
 * @property {integer} b - The score for the blue team.
 */
/**
 * Draws score.
 * @param  {ScoreObj} score - The score object for the current frame.
 */
// done
Renderer.prototype.drawScore = function(score) {
    var ctx = this.context;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 0, 0, .5)";
    ctx.font = "bold 40pt Arial";
    ctx.fillText(score.r, ctx.canvas.width / 2 - 120, ctx.canvas.height - 50);
    ctx.fillStyle = "rgba(0, 0, 255, .5)";
    ctx.fillText(score.b, ctx.canvas.width / 2 + 120, ctx.canvas.height - 50);
};

/**
 * Draw flags at bottom of UI  indicating which flags are held.
 */
Renderer.prototype.drawScoreFlag = function() {
    var ctx = this.context;
    var players = this.getPlayers();
    var frame = this.frame;
    var self = this;
    players.forEach(function(player) {
        // Flag status for this player for this frame.
        var flagStatus = player.flag[frame];
        // Check if they had the flag this frame.
        if (flagStatus) {
            var flagCoords = tiles[flagTiles[flagStatus]];
            // Get team of player with flag.
            var flagTeam = player.team[frame];
            var flagPos = {
                x: ctx.canvas.width / 2 + (flagTeam == 1 ? -100 : 80),
                y: ctx.canvas.height - 50
            };
            ctx.globalAlpha = 0.5;
            ctx.drawImage(self.textures.tiles,
                flagCoords.x * TILE_SIZE,
                flagCoords.y * TILE_SIZE,
                TILE_SIZE,
                TILE_SIZE,
                flagPos.x,
                flagPos.y,
                TILE_SIZE * 0.8,
                TILE_SIZE * 0.8);
            ctx.globalAlpha = 1;
        }
    });
};

/**
 * Draw flag being carried by player.
 * @param  {Player} player  - The player to draw the flag for.
 * @param  {Point} point - The point to draw the flag.
 * @param {Image} tiles - The image representing the tiles texture.
 */
// done
Renderer.prototype.drawFlag = function(point, flag) {
    var flagCoords = tiles[flagTiles[flag]];
    this.context.drawImage(this.textures.tiles,
        flagCoords.x * TILE_SIZE,
        flagCoords.y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        point.x + 10,
        point.y - 30,
        TILE_SIZE,
        TILE_SIZE);
};

/**
 * Given the map for the replay, generate the floorMap, specifying the
 * floor tiles to draw underneath dynamic and partially transparent
 * tiles.
 * @param {} map - The map.
 * @return {Array.<Array.<number>>} - Specifies the floor tiles to be
 *   drawn, or -1 if not needed at a location.
 */
Renderer.prototype.makeFloorMap = function(map) {
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
};

/**
 * Takes in the replay data and returns a DataURL (png) representing the map background.
 * @param {Replay} replay - The replay data.
 * @param {Image} tiles - The image representing the tiles texture.
 * @return {string} - DataURL representing the map.
 */
Renderer.prototype.makeBackgroundTexture = function() {
    var canvas = document.createElement('canvas');
    canvas.id = 'newCanvas';
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    canvas = document.getElementById('newCanvas');
    canvas.width = this.replay.data.map.length * TILE_SIZE;
    canvas.height = this.replay.data.map[0].length * TILE_SIZE;
    canvas.style.zIndex = 200;
    canvas.style.position = 'absolute';
    canvas.style.top = 0;
    canvas.style.left = 0;
    var ctx = canvas.getContext('2d');

    var floorMap = this.makeFloorMap(this.replay.data.map);
    var wallMap = this.replay.data.wallMap;
    var wallOffsets = [
        { x: 0, y: 0},
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 }
    ];
    var self = this;
    this.replay.data.map.forEach(function(row, x) {
        row.forEach(function(tileId, y) {
            var tile = tiles[tileId];
            var tileSize = tile.size || TILE_SIZE;
            var loc = { x: x, y: y };

            // Draw floor underneath tiles where relevant.
            if (tile.drawFloor) {
                var floorTile = tiles[floorMap[loc.x][loc.y]];
                ctx.drawImage(self.textures.tiles,
                    floorTile.x * TILE_SIZE,
                    floorTile.y * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                    loc.x * TILE_SIZE,
                    loc.y * TILE_SIZE,
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
                    ctx.drawImage(self.textures.tiles,
                        quadrantTile.x * tileSize,
                        quadrantTile.y * tileSize,
                        quadrantSize,
                        quadrantSize,
                        loc.x * tileSize + offset.x,
                        loc.y * tileSize + offset.y,
                        quadrantSize,
                        quadrantSize);
                });
            } else {
                // Draw tile.
                ctx.drawImage(self.textures.tiles,
                    tile.x * tileSize,
                    tile.y * tileSize,
                    tileSize,
                    tileSize,
                    loc.x * tileSize,
                    loc.y * tileSize,
                    tileSize,
                    tileSize);
            }
        });
    });
    return ctx.canvas.toDataURL();
};

/**
 * Draw the dynamic floor tiles.
 */
// done
Renderer.prototype.drawFloorTiles = function() {
    var fps = this.replay.info.fps;
    var mod = this.frame % (fps * 2 / 3);
    var fourth = (fps * 2 / 3) / 4;
    var animationTile = Math.floor(mod / fourth);
    var self = this;
    this.replay.data.dynamicTiles.forEach(function(dynamicTile) {
        var loc = self.toScreen({
          x: dynamicTile.x * TILE_SIZE,
          y: dynamicTile.y * TILE_SIZE
        });
        var tileId = dynamicTile.value[self.frame];
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
        self.context.drawImage(self.textures[textureName],
            spriteLoc.x * TILE_SIZE,
            spriteLoc.y * TILE_SIZE,
            size,
            size,
            loc.x,
            loc.y,
            size,
            size);
    });
};

/**
 * Draws exploding bombs. Animation.
 */
Renderer.prototype.drawExplosions = function() {
    var bombs = this.replay.data.bombs;
    // Current animations.
    var states = this.state.bombs;
    var fps = this.replay.info.fps;
    var frame = this.frame;
    var time = this.replay.data.time[this.frame];

    // Create animations.
    for (var i = 0; i < bombs.length; i++) {
        var bomb = bombs[i];
        // This and all following are in the future.
        if (bomb.time > time) break;
        // Too far in the past.
        if (bomb.time + 100 < time) continue;
        // Only bomb tile explosions.
        if (bomb.type !== 2) continue;
        // Don't create duplicates.
        if (states.hasOwnProperty(i)) continue;
        states[i] = {
            length: Math.round(fps / 10),
            start: frame - Math.floor((time - bomb.time) / fps),
            frame: 0,
            loc: this.toScreen({
                x: bomb.x + TILE_SIZE / 2,
                y: bomb.y + TILE_SIZE / 2
            })
        };
    }

    var ctx = this.context;
    // Draw animations.
    for (var j in states) {
        var animation = states[j];
        // Prune animations.
        if (animation.frame >= animation.length || animation.start > frame) {
            delete states[j];
            continue;
        }
        animation.frame = frame - animation.start;

        var bombSize = 40 + (280 * (animation.frame / animation.length));
        var bombOpacity = 1 - animation.frame / animation.length;
        ctx.fillStyle = "#FF8000";
        ctx.globalAlpha = bombOpacity;
        ctx.beginPath();
        ctx.arc(animation.loc.x, animation.loc.y, Math.round(bombSize), 0, 2 * Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
    }
};

/**
 * Check if the given player collided with any other players at this
 * point in the replay.
 * @param  {Player} player - The player to check for collisions.
 * @param  {PositionData} data - The replay data.
 * @return {boolean} - Whether or not there was a recent collision.
 */
Renderer.prototype.collided = function(player) {
    var frame = this.frame;
    var prevX = player.x[frame - 1];
    var prevY = player.y[frame - 1];
    var thisX = player.x[frame];
    var thisY = player.y[frame];
    for (var id in this.replay.data.players) {
        if (id === player.id) continue;
        var otherPlayer = this.replay.data.players[id];
        var prevOtherX = otherPlayer.x[frame - 1];
        var prevOtherY = otherPlayer.y[frame - 1];
        var thisOtherX = otherPlayer.x[frame];
        var thisOtherY = otherPlayer.y[frame];
        if ((Math.abs(prevOtherX - prevX) < 45 && Math.abs(prevOtherY - prevY) < 45) ||
            (Math.abs(thisOtherX - thisX) < 45 && Math.abs(thisOtherY - thisY) < 45)) {
            return true;
        }
    }
    return false;
};

/**
 * Handle rolling bomb detonation animation.
 * @param  {Player} player - The player to do the animation update for.
 */
// done
Renderer.prototype.rollingBombPop = function(player) {
    var state = this.state.players[player.id].bombs;
    var frame = this.frame;
    // Determine if a rolling bomb went off.
    if (!player.bomb[frame] & player.bomb[frame - 1] & this.collided(player)) {
        state.push({
            length: Math.round(this.replay.info.fps / 10),
            frame: 0
        });
    }
    var ctx = this.context;
    for (var i = state.length - 1; i >= 0; i--) {
        var bombAnimation = state[i];
        bombAnimation.frame++;

        var rollingBombSize = 40 + (200 * (bombAnimation.frame / bombAnimation.length));
        var rollingBombOpacity = 1 - bombAnimation.frame / bombAnimation.length;

        ctx.fillStyle = "#FFFF00";
        ctx.globalAlpha = rollingBombOpacity;
        ctx.beginPath();
        var rollingBombX = player.x[frame] - this.camera.x + ctx.canvas.width / 2;
        var rollingBombY = player.y[frame] - this.camera.y + ctx.canvas.height / 2;
        ctx.arc(rollingBombX, rollingBombY, Math.round(rollingBombSize), 0, 2 * Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        // Remove from list if over.
        if (bombAnimation.frame >= bombAnimation.length) {
            state.splice(i, 1);
        }
    }
};

/**
 * Initiate or continue a ball pop animation for the given player. Animation.
 * @param {Player} player - The player to update the ball pop 
 *   animation for.
 * @param {PositionData} data - The replay data.
 * @param {Image} tiles - The image representing the tiles textures.
 */
Renderer.prototype.ballPop = function(player, data, tiles) {
    var state = this.state.players[player.id].pops;
    var frame = this.frame;

    // determine if we need to start a pop animation: ball is dead now, but was not dead one frame ago
    if (player.dead[frame] && !player.dead[frame - 1] && player.draw[frame - 1]) {
        state.push({
            start: frame,
            frame: 0,
            length: Math.round(this.replay.info.fps / 10),
            loc: this.toScreen({
              x: player.x[frame] + TILE_SIZE / 2,
              y: player.y[frame] + TILE_SIZE / 2
            })
        });
    }
    var ctx = this.context;
    for (var i = state.length - 1; i >= 0; i--) {
        var popAnimation = state[i];
        if (popAnimation.start > frame || popAnimation.frame >= popAnimation.length) {
            state.splice(i, 1);
            continue;
        }
        popAnimation.frame = frame - popAnimation.start;
        var popSize = 40 + (80 * (popAnimation.frame / popAnimation.length));
        var popOpacity = 1 - popAnimation.frame / popAnimation.length;
        ctx.globalAlpha = popOpacity;
        ctx.drawImage(this.textures.tiles,
            (player.team[frame] == 1 ? 14 : 15) * TILE_SIZE,
            0,
            TILE_SIZE,
            TILE_SIZE,
            popAnimation.loc.x - popSize / 2,
            popAnimation.loc.y - popSize / 2,
            popSize,
            popSize);
        ctx.globalAlpha = 1;
    }
};

/**
 * Draw a single splat.
 * @param {[type]} loc [description]
 * @param {[type]} team [description]
 * @param {[type]} img [description]
 * @return {[type]} [description]
 */
Renderer.prototype.drawSplat = function(loc, team, img) {
    this.context.drawImage(this.textures.splats,
        img * SPLAT_SIZE,
        (team - 1) * SPLAT_SIZE,
        SPLAT_SIZE,
        SPLAT_SIZE,
        loc.x,
        loc.y,
        SPLAT_SIZE,
        SPLAT_SIZE);
};

/**
 * Draw splats. Animation.
 */
Renderer.prototype.drawSplats = function() {
    // Draw the splats that occurred up to this point in time.
    var splats = this.replay.data.splats;
    var states = this.state.splats;
    var frameTime = this.replay.data.time[this.frame];
    var ctx = this.context;
    for (var i = 0; i < splats.length; i++) {
        var splat = splats[i];
        if (splat.time > frameTime) break;
        var state;
        if (!states.hasOwnProperty(i)) {
            state = {
                img: Math.floor(Math.random() * (this.textures.splats.width / 120))
            };
            if (splat.temp) {
                state.fade = true;
                state.fadeStart = splat.time;
                state.fadeUntil = state.fadeStart + 5000;
            }
            states[i] = state;
        } else {
            state = states[i];
        }
        // Ignore faded splats.
        if (!state) continue;
        // Location of top-left of splat.
        var loc = this.toScreen({
            x: splat.x - SPLAT_SIZE / 2 + TILE_SIZE / 2,
            y: splat.y - SPLAT_SIZE / 2 + TILE_SIZE / 2
        });
        if (state.fade) {
            // Remove completely faded splats.
            if (state.fadeUntil < frameTime) {
                states[i] = false;
            } else {
                var alpha = 1 - ((frameTime - state.fadeStart) / (state.fadeUntil - state.fadeStart));
                ctx.globalAlpha = alpha;
                this.drawSplat(loc, splat.team, state.img);
                ctx.globalAlpha = 1;
            }
        } else {
            this.drawSplat(loc, splat.team, state.img);
        }
    }
};

/**
 * Draw spawning players.
 */
Renderer.prototype.drawSpawns = function() {
    this.context.globalAlpha = 0.25;
    var spawns = this.replay.data.spawns;
    var time = this.replay.data.time[this.frame];
    for (var i = 0; i < spawns.length; i++) {
        var spawn = spawns[i];
        if (spawn.time < time) {
            if (spawn.time + spawn.wait < time) {
                break;
            } else {
                var pos = this.toScreen(spawn);
                this.context.drawImage(this.textures.tiles,
                    (spawn.team == 1 ? 14 : 15) * TILE_SIZE,
                    0,
                    40,
                    40,
                    pos.x,
                    pos.y,
                    40,
                    40);
            }
        }
    }
    this.context.globalAlpha = 1;
};

/**
 * Draw game result at end.
 */
Renderer.prototype.drawEndText = function() {
    var gameEnd = this.replay.data.gameEnd;
    if (gameEnd) {
        var ctx = this.context;
        var endTime = gameEnd.time;
        var winner = gameEnd.winner;
        var thisTime = this.replay.data.time[this.frame];
        if (endTime <= thisTime) {
            var endColor, endText;
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
            ctx.save();
            ctx.textAlign = "center";
            ctx.font = "bold 48pt Arial";
            ctx.fillStyle = endColor;
            ctx.strokeStyle = "#000000";
            ctx.strokeText(endText, ctx.canvas.width / 2, 100);
            ctx.fillText(endText, ctx.canvas.width / 2, 100);
            ctx.restore();
        }
    }
};

Renderer.prototype.drawBall = function() {
    
};

Renderer.prototype.drawPlayer = function(player) {
    var frame = this.frame;
    var fps = this.replay.info.fps;
    var position = {
        x: player.x[frame],
        y: player.y[frame]
    };
    var drawPos = this.toScreen(position);
    var team = player.team[frame];
    var name = player.name[frame];
    var dead = player.dead[frame];
    var angle = player.angle && player.angle[frame];
    var draw = player.draw[frame];
    var auth = player.auth[frame];
    var degree = player.degree[frame];
    var grip = player.grip[frame];
    var bomb = player.bomb[frame];
    var tagpro = player.tagpro[frame];
    var flair = player.flair[frame];
    var flag = player.flag[frame];
    var spin = this.options.spin;

    if (!dead && draw) {
        // If at the start of the replay or the player was drawn last frame.
        if (frame === 0 || player.draw[frame - 1]) {
            // TODO: Figure out what case the first part of this is handling
            if ((player.dead[frame - 1] && position.x !== player.x[frame - fps]) ||
                !player.dead[frame - 1]) {
                
                // draw with or without spin
                if(!spin || !angle) {
                    this.context.drawImage(this.textures.tiles,
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
                    this.context.translate(playerCenter.x,
                        playerCenter.y);
                    this.context.rotate(angle);
                    this.context.drawImage(this.textures.tiles,
                        (team == 1 ? 14 : 15) * TILE_SIZE,    
                        0,
                        TILE_SIZE,
                        TILE_SIZE,
                        -TILE_SIZE / 2,
                        -TILE_SIZE / 2,
                        TILE_SIZE,
                        TILE_SIZE);
                    this.context.rotate(-angle);
                    this.context.translate(-playerCenter.x,
                        -playerCenter.y);
                }

                if (grip) {
                   this.drawGrip(drawPos);
                }
                if (tagpro) {
                    this.drawTagpro(drawPos);
                }
                if (bomb) {
                    this.drawBomb(drawPos);
                }
                if (flag) {
                    this.drawFlag(drawPos, flag);
                }

                this.drawText(drawPos, {
                    name: name,
                    degree: degree,
                    auth: auth
                });
                if (flair) {
                    this.drawFlair({
                        x: drawPos.x + 12,
                        y: drawPos.y - 20
                    }, flair);
                }
            }
        }
    }
    // animations
    this.rollingBombPop(player);
    this.ballPop(player);
};

Renderer.prototype.drawPlayers = function() {
    var players = this.getPlayers();
    var self = this;
    players.forEach(function(player) {
        self.drawPlayer(player);
    });
};

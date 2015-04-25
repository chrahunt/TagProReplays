/**
 * Record and save the state of the game, emitting an event to the
 * window with the replay data.
 * 
 * This file is injected into the page by the content script
 * TagProReplays. This is necessary in order to listen to the game
 * socket which provides game state information.
 */
(function(window, document, undefined) {

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

/**
 * Read cookie with given name, returning its value if found. If no
 * cookie with the name is found, returns `null`.
 * @param {string} name - The name of the cookie to retrieve the value
 *   for.
 * @return {?string} - The value of the cookie, or null if not found.
 */
function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

/**
 * @typedef Options
 * @type {object}
 * @property {integer} fps - The FPS at which the replay should be
 *   recorded at.
 * @property {integer} duration - The duration (in seconds) of the
 *   replay.
 * @property {boolean} record_key_enabled - Whether or not the record
 *   hotkey should function.
 * @property {integer} record_key - The KeyCode for the hotkey that can
 *   be used to save a replay.
 * @property {boolean} record - Whether or not recording should occur.
 * @property {??} treter - ??
 */
/**
 * Get set options from cookies, or default options if no cookies are
 * set.
 * @return {Options} - The options to use when recording.
 */
function getOptions() {
    function getBooleanCookie(name, defaultValue) {
        var cookie = readCookie(name);
        if (cookie) {
            return cookie == "true";
        } else {
            return defaultValue;
        }
    }

    var fps = +readCookie('fps') || 60;
    var duration = +readCookie('duration') || 30;
    var record_key_enabled = getBooleanCookie('useRecordKey', true);
    var record_key = +readCookie('replayRecordKey') || 47;
    var record = getBooleanCookie('record', true);
    // What is this for?
    var treter = getBooleanCookie('treter', false);

    var options = {
        fps: fps,
        duration: duration,
        record_key_enabled: record_key_enabled,
        record_key: record_key,
        record: record,
        treter: treter
    };
    return options;
}

// Initially retrieve options.
var options = getOptions();

function recordReplayData() {
    var savingIndex = 0;
    var fps = options.fps;
    var saveDuration = options.duration;

    // set up map data
    positions.chat = [];
    positions.splats = [];
    positions.bombs = [];
    positions.spawns = [];
    positions.map = tagpro.map;
    delete positions.map.splats;
    positions.wallMap = tagpro.wallMap;
    positions.floorTiles = [];
    positions.score = createZeroArray(saveDuration * fps);
    positions.gameEndsAt = [new Date(tagpro.gameEndsAt).getTime()];
    positions.clock = createZeroArray(saveDuration * fps);
    decipheredData = decipherMapdata(positions.map, mapElements);
    positions.tiles = translateWallTiles(decipheredData, positions.wallMap, quadrantCoords);

    for (tilecol in positions.map) {
        for (tilerow in positions.map[tilecol]) {
            thisTile = positions.map[tilecol][tilerow];
            if (thisTile >= 3 & thisTile < 7 | thisTile >= 9 & thisTile < 11 | thisTile >= 13 & thisTile < 17) {
                positions.floorTiles.push({x: tilecol, y: tilerow, value: createZeroArray(saveDuration * fps)});
            }
        }
    }

    // set up listener for chats, splats, and bombs
    tagpro.socket.on('chat', function (CHAT) {
        CHAT.removeAt = Date.now()+30000;
        positions.chat.push(CHAT);
    });

    tagpro.socket.on('splat', function (SPLAT) {
        SPLAT.time = new Date();
        positions.splats.push(SPLAT);
    });

    tagpro.socket.on('bomb', function (BOMB) {
        BOMB.time = new Date();
        positions.bombs.push(BOMB);
    });

    tagpro.socket.on('spawn', function (SPAWN) {
        SPAWN.time = new Date();
        positions.spawns.push(SPAWN);
    });

    tagpro.socket.on('end', function (END) {
        END.time = new Date();
        positions.end = END;
    });

    tagpro.socket.on('time', function (TIME) {
        TIME.startTime = new Date();
        positions.gameEndsAt.push(TIME);
    });

    // function to save game data
    saveGameData = function () {
        currentPlayers = tagpro.players;
        for (var player in currentPlayers) {
            if (!positions['player' + player]) {
                positions['player' + player] = {
                    x: createZeroArray(saveDuration * fps),
                    y: createZeroArray(saveDuration * fps),
                    name: createZeroArray(saveDuration * fps),
                    fps: fps,
                    team: createZeroArray(saveDuration * fps), //players[player].team, // 1:red, 2:blue
                    map: $('#mapInfo').text().replace('Map: ', '').replace(/ by.*/, ''),
                    flag: createZeroArray(saveDuration * fps),
                    bomb: createZeroArray(saveDuration * fps),
                    grip: createZeroArray(saveDuration * fps),
                    tagpro: createZeroArray(saveDuration * fps),
                    dead: createZeroArray(saveDuration * fps),
                    draw: createZeroArray(saveDuration * fps),
                    me: (+tagpro.playerId == +player ? 'me' : 'other'),
                    auth: createZeroArray(saveDuration * fps),
                    degree: createZeroArray(saveDuration * fps),
                    flair: createZeroArray(saveDuration * fps),
                    angle: createZeroArray(saveDuration * fps)
                };
            }
        }
        for (var player in positions) {
            if (player.search('player') === 0) {
                for (var prop in positions[player]) {
                    // Only apply to properties tracked over time.
                    if ($.isArray(positions[player][prop])) {
                        var frames = positions[player][prop];
                        var playerId = player.replace('player', '');

                        frames.shift();
                        if (typeof tagpro.players[playerId] !== 'undefined') {
                            frames.push(tagpro.players[playerId][prop]);
                        } else {
                            frames.push(null);
                        }
                    }
                }
            }
        }
        for (var j in positions.floorTiles) {
            positions.floorTiles[j].value.shift();
            positions.floorTiles[j].value.push(tagpro.map[positions.floorTiles[j].x][positions.floorTiles[j].y]);
        }
        positions.clock.shift();
        positions.clock.push(new Date());
        positions.score.shift();
        positions.score.push(tagpro.score);
    }

    thing = setInterval(saveGameData, 1000 / fps);
}

//////////////////////////////////////////
/// Interpretation of wall and map data //
//////////////////////////////////////////

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
 * @param {[type]} mapElements [description]
 * @return {[type]} [description]
 */
function decipherMapdata(mapData, mapElements) {
    var result = [];
    console.log(mapData);
    for (var col in mapData) {
        result.push([]);
        for (var row in mapData[col]) {
            result[col].push({});
        }
    }

    for (var col in mapData) {
        for (var row in mapData[col]) {
            var tileId = mapData[col][row];
            if (tileId == 1) {
                result[col][row].tile = 'wall';
                result[col][row].tileSize = 20;
                result[col][row].coordinates = {0: {}, 1: {}, 2: {}, 3: {}};
            } else if (Math.floor(tileId) == 1) {
                result[col][row].tile = 'diagonalWall';
                result[col][row].tileSize = 20;
                result[col][row].coordinates = {0: {}, 1: {}, 2: {}, 3: {}};
                result[col][row].coordinates.x = 13;
                result[col][row].coordinates.y = 4;
            } else {
                result[col][row] = mapElements[tileId];
            }
        }
    }
    return result;
}

function translateWallTiles(decipheredData, wallData, quadrantCoords) {
    function getWallId(id) {
        return id.toString().replace('1.', '');
    }
    decipheredData.forEach(function(col, c) {
        col.forEach(function(data, r) {
            var tile = data.tile;
            if (tile == "wall" || tile == "diagonalWall") {
                var coordinates = data.coordinates;
                var wallCoords = wallData[c][r];
                var wallId = getWallId(wallCoords[0]);
                coordinates[0] = quadrantCoords[wallId];
                wallId = getWallId(wallCoords[1]);
                coordinates[1] = quadrantCoords[wallId];
                wallId = getWallId(wallCoords[2]);
                coordinates[2] = quadrantCoords[wallId];
                wallId = getWallId(wallCoords[3]);
                coordinates[3] = quadrantCoords[wallId];
            }
        });
    });
    return decipheredData;
}


// TL, TR, BR, BL
var quadrantCoords = {
    "0": [15, 10],
    0: [15, 10],
    "310": [10.5, 7.5],
    "410": [11, 7.5],
    "110": [11, 8],
    "210": [10.5, 8],
    "310d": [.5, 3.5],
    "410d": [1, 3.5],
    "210d": [.5, 4],
    321: [4.5, 9.5],
    421: [5, 9.5],
    121: [5, 10],
    221: [4.5, 10],
    "321d": [1.5, 2.5],
    "421d": [2, 2.5],
    "221d": [1.5, 3],
    332: [6.5, 9.5],
    432: [7, 9.5],
    132: [7, 10],
    232: [6.5, 10],
    "332d": [9.5, 2.5],
    "432d": [10, 2.5],
    "132d": [10, 3],
    343: [.5, 7.5],
    443: [1, 7.5],
    143: [1, 8],
    243: [.5, 8],
    "343d": [10.5, 3.5],
    "443d": [11, 3.5],
    "143d": [11, 4],
    354: [1.5, 6.5],
    454: [2, 6.5],
    154: [2, 7],
    254: [1.5, 7],
    "454d": [9, 1.5],
    "154d": [9, 2],
    "254d": [8.5, 2],
    365: [6.5, 8.5],
    465: [7, 8.5],
    165: [7, 9],
    265: [6.5, 9],
    "465d": [11, 1.5],
    "165d": [11, 2],
    "265d": [10.5, 2],
    376: [4.5, 8.5],
    476: [5, 8.5],
    176: [5, 9],
    276: [4.5, 9],
    "376d": [.5, 1.5],
    "176d": [1, 2],
    "276d": [.5, 2],
    307: [9.5, 6.5],
    407: [10, 6.5],
    107: [10, 7],
    207: [9.5, 7],
    "307d": [2.5, 1.5],
    "107d": [3, 2],
    "207d": [2.5, 2],
    "320": [1.5, 7.5],
    "420": [2, 7.5],
    "220": [1.5, 8],
    "320d": [10.5, .5],
    "420d": [11, .5],
    "220d": [10.5, 1],
    331: [5.5, 6.5],
    431: [6, 6.5],
    131: [6, 7],
    231: [5.5, 7],
    "331d": [5.5, .5],
    "431d": [6, .5],
    342: [9.5, 7.5],
    442: [10, 7.5],
    142: [10, 8],
    "342d": [.5, .5],
    "442d": [1, .5],
    "142d": [1, 1],
    353: [4.5, 5.5],
    453: [5, 5.5],
    153: [5, 6],
    253: [4.5, 6],
    "453d": [7, 1.5],
    "153d": [7, 2],
    464: [4, 9.5],
    164: [4, 10],
    264: [3.5, 10],
    "464d": [2, 3.5],
    "164d": [2, 4],
    "264d": [1.5, 4],
    375: [5.5, 2.5],
    475: [6, 2.5],
    175: [6, 4],
    275: [5.5, 4],
    "175d": [6, 3],
    "275d": [5.5, 3],
    306: [7.5, 9.5],
    106: [8, 10],
    206: [7.5, 10],
    "306d": [9.5, 3.5],
    "106d": [10, 4],
    "206d": [9.5, 4],
    317: [6.5, 5.5],
    417: [7, 5.5],
    117: [7, 6],
    217: [6.5, 6],
    "317d": [4.5, 1.5],
    "217d": [4.5, 2],
    327: [7.5, 8.5],
    427: [8, 8.5],
    101: [4, 5],
    227: [7.5, 9],
    "327d": [8.5, 3.5],
    "227d": [8.5, 4],
    "330": [8.5, 7.5],
    "430": [9, 7.5],
    112: [2, 0],
    "230": [8.5, 8],
    "330d": [3.5, .5],
    "430d": [4, .5],
    341: [2.5, 7.5],
    441: [3, 7.5],
    141: [3, 8],
    223: [9.5, 0],
    "341d": [7.5, .5],
    "441d": [8, .5],
    352: [3.5, 8.5],
    452: [4, 8.5],
    152: [4, 9],
    234: [7.5, 5],
    "452d": [3, 3.5],
    "152d": [3, 4],
    345: [7.5, 6.5],
    463: [10, 8.5],
    163: [10, 9],
    263: [9.5, 9],
    "463d": [2, .5],
    "163d": [2, 1],
    356: [6.5, 7.5],
    474: [9, 9.5],
    174: [9, 10],
    274: [8.5, 10],
    "174d": [10, 5],
    "274d": [9.5, 5],
    305: [2.5, 9.5],
    467: [5, 7.5],
    105: [3, 10],
    205: [2.5, 10],
    "105d": [2, 5],
    "205d": [1.5, 5],
    316: [1.5, 8.5],
    "470": [4, 6.5],
    116: [2, 9],
    216: [1.5, 9],
    "316d": [9.5, .5],
    "216d": [9.5, 1],
    337: [10.5, 9.5],
    437: [11, 9.5],
    102: [0, 7],
    237: [10.5, 10],
    "337d": [10.5, 4.5],
    "102d": [0, 0],
    "340": [8.5, 10.5],
    "440": [9, 10.5],
    113: [6, 8],
    213: [5.5, 8],
    "340d": [3.5, 2.5],
    "440d": [8, 2.5],
    351: [.5, 9.5],
    451: [1, 9.5],
    151: [1, 10],
    224: [11.5, 7],
    "224d": [11.5, 0],
    "451d": [1, 4.5],
    335: [11.5, 8.5],
    462: [0, 5.5],
    162: [0, 5],
    235: [11.5, 9],
    "462d": [0, 4.5],
    "162d": [0, 6],
    346: [11.5, 7.5],
    473: [8, 6.5],
    173: [8, 7],
    273: [7.5, 7],
    "346d": [2.5, 4.5],
    "173d": [9, 3],
    357: [5.5, 10.5],
    457: [6, 10.5],
    104: [6, 5],
    204: [5.5, 5],
    "104d": [7, 5],
    "204d": [4.5, 5],
    315: [3.5, 6.5],
    "460": [0, 7.5],
    115: [4, 7],
    215: [3.5, 7],
    "460d": [9, 4.5],
    "215d": [2.5, 3],
    326: [11.5, 5.5],
    471: [0, 8.5],
    171: [0, 9],
    226: [11.5, 5],
    "326d": [11.5, 4.5],
    "226d": [11.5, 6],
    347: [9.5, 10.5],
    447: [10, 10.5],
    103: [9, 6],
    203: [8.5, 6],
    "347d": [3.5, 1.5],
    "103d": [4, 1],
    "350": [1.5, 10.5],
    "450": [2, 10.5],
    114: [3, 6],
    214: [2.5, 6],
    "214d": [7.5, 1],
    "450d": [8, 1.5],
    325: [4.5, 7.5],
    461: [4, 3.5],
    161: [4, 4],
    225: [4.5, 8],
    "225d": [8.5, 5],
    "461d": [8, 4.5],
    336: [7.5, 3.5],
    472: [7, 7.5],
    172: [7, 8],
    236: [7.5, 4],
    "336d": [3.5, 4.5],
    "172d": [3, 5],
    "300": [5.5, 5.5],
    "400": [6, 5.5],
    "100": [6, 6],
    "200": [5.5, 6],
    "300d": [5.5, 8.5],
    "400d": [6, 8.5],
    "100d": [6, 10],
    "200d": [5.5, 10]
};


var mapElements = {
    0: {tile: "blank", coordinates: {x: 15, y: 10}, tileSize: 40, drawTileFirst: false},
    2: {tile: "tile", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    3: {tile: "redflag", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    3.1: {tile: "regflagtaken", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    4: {tile: "blueflag", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    4.1: {tile: "blueflagtaken", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    5: {tile: "speedpad", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    5.1: {tile: "emptyspeedpad", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    6: {tile: "emptypowerup", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    6.1: {tile: "jukejuice", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    6.2: {tile: "rollingbomb", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    6.3: {tile: "tagpro", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    6.4: {tile: "speed", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    7: {tile: "spike", coordinates: {x: 12, y: 0}, tileSize: 40, drawTileFirst: true},
    8: {tile: "button", coordinates: {x: 13, y: 6}, tileSize: 40, drawTileFirst: true},
    9: {tile: "gate", coordinates: {x: 12, y: 3}, tileSize: 40, drawTileFirst: false},
    9.1: {tile: "greengate", coordinates: {x: 13, y: 3}, tileSize: 40, drawTileFirst: false},
    9.2: {tile: "redgate", coordinates: {x: 14, y: 3}, tileSize: 40, drawTileFirst: false},
    9.3: {tile: "bluegate", coordinates: {x: 15, y: 3}, tileSize: 40, drawTileFirst: false},
    10: {tile: "bomb", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    10.1: {tile: "emptybomb", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    11: {tile: "redtile", coordinates: {x: 14, y: 4}, tileSize: 40, drawTileFirst: false},
    12: {tile: "bluetile", coordinates: {x: 15, y: 4}, tileSize: 40, drawTileFirst: false},
    13: {tile: "portal", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    13.1: {tile: "emptyportal", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    14: {tile: "speedpadred", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    14.1: {tile: "emptyspeedpadred", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    15: {tile: "speedpadblue", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    15.1: {tile: "emptyspeedpadblue", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    16: {tile: "yellowflag", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    16.1: {tile: "yellowflagtaken", coordinates: {x: 13, y: 4}, tileSize: 40, drawTileFirst: false},
    17: {tile: "redgoal", coordinates: {x: 14, y: 5}, tileSize: 40, drawTileFirst: false},
    18: {tile: "bluegoal", coordinates: {x: 15, y: 5}, tileSize: 40, drawTileFirst: false},
    22: {tile: "gravitywell", coordinates: {x: 13, y: 0}, tileSize: 40, drawTileFirst: true}
};



function emit(event, data) {
    var e = new CustomEvent(event, {detail: data});
    window.dispatchEvent(e);
}


// send position data to content script
function saveReplayData(positions) {
    var data = JSON.stringify(positions);
    console.log('Sending replay data from injected script to content script.');
    emit('saveReplay', data);
}

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function (e) {
        listener(e.detail);
    });
}

// TODO: Handle possible failure alert from content script.
listen('replaySaved', function() {
    console.log('Got message confirming data save.')
    $(savedFeedback).fadeIn(300);
    $(savedFeedback).fadeOut(900);
});


// function to add button to record replay data AND if user has turned on key recording, add listener for that key.
function recordButton() {
    var recordButton = document.createElement("img")
    recordButton.id = 'recordButton'
    recordButton.src = 'http://i.imgur.com/oS1bPqR.png'
    recordButton.onclick = function () {
        saveReplayData(positions)
    }
    recordButton.style.position = "absolute"
    recordButton.style.margin = "auto"
    recordButton.style.right = "30px"
    recordButton.style.top = "65px"
    recordButton.style.cursor = "pointer"
    $('body').append(recordButton)

    var savedFeedback = document.createElement('a')
    savedFeedback.id = 'savedFeedback'
    savedFeedback.textContent = 'Saved!'
    savedFeedback.style.right = '20px'
    savedFeedback.style.top = '100px'
    savedFeedback.style.position = "absolute"
    savedFeedback.style.color = '#00CC00'
    savedFeedback.style.fontSize = '20px'
    savedFeedback.style.fontWeight = 'bold'
    $('body').append(savedFeedback)
    $(savedFeedback).hide()

    if (options.record_key_enabled) {
        $(document).on("keypress", function (e) {
            if (e.which == options.record_key) {
                saveReplayData(positions)
            }
        })
    }
}

if(options.record && !options.treter) {
    tagpro.ready(function() {
        var startInterval = setInterval(function() {
            //console.log('map: '+(typeof tagpro.map == "undefined" ? 'undefined' : 'defined'))
            //console.log('wallMap: '+(typeof tagpro.wallMap == "undefined" ? 'undefined' : 'defined'))
            if(tagpro.map && tagpro.wallMap) {
                clearInterval(startInterval);
                positions = {};
                recordButton();
                recordReplayData();
            }
        }, 1000);
    });
}

})(window, document);

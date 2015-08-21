/**
 * This file contains the functions used to draw the replay data onto
 * the canvas for the in-page preview as well as for the replay
 * rendering.
 *
 * This script is included as a content script and a background script.
 */
// TODO: Texture and setting interface. interval determination interface.
(function(window) {

// Constant tile size.
var TILE_SIZE = 40;

// Draw-function global. Set in drawReplay and animateReplay.
var thisI = 0;
var context;

// Draw-function globals.
var posx, posy;

/**
 * Get the player object that corresponds to the recording player
 * from position data. If the player is not found then null is
 * returned.
 * @param {PositionData} data - The position data to get the player
 *   from.
 * @return {?Player} - The player object.
 */
function getPlayer(data) {
    for (var j in data) {
        if (data[j].me == 'me') {
            return data[j];
        }
    }
    return null;
}

/**
 * Get the player objects from the data. If no players are found then
 * an empty array is returned.
 * @param {PositionData} data - The position data to get the players
 *   from.
 * @return {Array.<Player>} - The players.
 */
function getPlayers(data) {
    var players = [];
    for (var j in data) {
        if (j.search("player") === 0) {
            players.push(data[j]);
        }
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
    if (info.degree && info.degree != 0) {
        context.strokeText(info.degree + "°", position.x + 10, position.y + 12);
    }
    context.shadowBlur = 0;
    context.fillText(info.name, position.x + 3, position.y);
    if (info.degree && info.degree != 0) {
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
            16)
    }
}

// Uses: context
function prettyText(text, textx, texty, color) {
    context.textAlign = 'left'
    context.fillStyle = color
    context.strokeStyle = "#000000"
    context.shadowColor = "#000000"
    context.shadowOffsetX = 0
    context.shadowOffsetY = 0
    context.lineWidth = 2
    context.font = "bold 8pt Arial"
    context.shadowBlur = 10
    context.strokeText(text, textx, texty)
    context.shadowBlur = 0
    context.fillText(text, textx, texty)
    return context.measureText(text).width;
}

// Uses: thisI (var), prettyText (fn) - by extension context
function drawChats(positions) {
    if (positions.chat) {
        var chats = positions.chat;
        var thisTime = new Date(positions.clock[thisI]).getTime();
        var currentChats = new Array(10);
        for (var chatI in chats) {
            if (chats[chatI].removeAt - 30000 < thisTime & chats[chatI].removeAt > thisTime) {
                currentChats.shift();
                currentChats.push(chats[chatI]);
            }
        }
        for (var chatI = 0; chatI < currentChats.length; chatI++) {
            if (typeof currentChats[0] == 'undefined') {
                currentChats.shift();
                chatI--;
            }
        }

        for (var chatI in currentChats) {
            var thisChat = currentChats[chatI];
            var chatLeft = 10;
            var chatTop = context.canvas.height - 175 + chatI * 12
            if (typeof thisChat.from == 'number') {
                if (positions['player' + thisChat.from].auth[thisI]) {
                    chatLeft += prettyText("✓ ", chatLeft, chatTop, "#BFFF00")
                }
                chatName = (typeof positions['player' + thisChat.from].name === "string") ? positions['player' + thisChat.from].name : positions['player' + thisChat.from].name[thisI]
                chatLeft += prettyText(chatName + ': ',
                    chatLeft,
                    chatTop,
                    positions['player' + thisChat.from].team[thisI] == 1 ? "#FFB5BD" : "#CFCFFF")
            }
            if (thisChat.to == 'team') {
                chatColor = positions['player' + thisChat.from].team[thisI] == 1 ? "#FFB5BD" : "#CFCFFF"
            } else if (thisChat.to == 'group') {
                chatColor = "#E7E700"
            } else {
                chatColor = 'white'
            }
            prettyText(thisChat.message, chatLeft, chatTop, chatColor)
        }
    }
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
 * @param  {integer} fps - Framerate of the recording.
 */
function drawBomb(point, fps) {
    var path = new Path2D();
    path.arc(point.x + TILE_SIZE / 2, point.y + TILE_SIZE / 2, TILE_SIZE / 2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255,255,0,' + Math.abs(.75 * Math.cos(thisI * 20 / (3 * fps))) + ')';
    context.fill(path);
}

// Uses: context
/**
 * Draw the tagpro powerup image at the position specified, which
 * should be the player draw position.
 * @param  {Point} point - The location to draw the powerup over the
 *   player.
 */
function drawTagpro(point) {
    var path = new Path2D();
    path.arc(point.x + TILE_SIZE / 2, point.y + TILE_SIZE / 2, TILE_SIZE / 2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(0,255,0,.25)';
    context.fill(path);
    context.lineWidth = 3;
    context.strokeStyle = 'rgb(0,255,0)';
    context.stroke(path);
}

// Uses: $, thisI, context
function drawClock(positions) {
    if (!positions.end || new Date(positions.end.time).getTime() > new Date(positions.clock[thisI]).getTime()) {
        var curTimeMilli;
        // Handle old version of replay data where gameEndsAt was not an array.
        if (!$.isArray(positions.gameEndsAt)) {
            if (new Date(positions.gameEndsAt).getTime() <= new Date(positions.clock[thisI]).getTime()) {
                curTimeMilli = new Date(positions.gameEndsAt).getTime() + 12 * 60 * 1000 - new Date(positions.clock[thisI]).getTime()
            } else {
                curTimeMilli = new Date(positions.gameEndsAt) - new Date(positions.clock[thisI])
            }
        } else {
            if (positions.gameEndsAt.length < 2) {
                curTimeMilli = new Date(positions.gameEndsAt[0]).getTime() - new Date(positions.clock[thisI]).getTime()
            } else {
                if (new Date(positions.clock[thisI]).getTime() >= new Date(positions.gameEndsAt[1].startTime).getTime()) {
                    curTimeMilli = new Date(positions.gameEndsAt[1].startTime).getTime() + positions.gameEndsAt[1].time - new Date(positions.clock[thisI]).getTime()
                } else {
                    curTimeMilli = new Date(positions.gameEndsAt[0]).getTime() - new Date(positions.clock[thisI]).getTime()
                }
            }
        }
        var minute = ('0' + Math.floor(curTimeMilli / 1000 / 60)).slice(-2)
        var seconds = ('0' + Math.floor(curTimeMilli / 1000 % 60)).slice(-2)
        seconds = (seconds == '60' ? '00' : seconds)
        var curTime = minute + ':' + seconds
    }
    context.fillStyle = "rgba(255, 255, 255, 1)";
    context.strokeStyle = "rgba(0, 0, 0, .75)";
    context.font = "bold 30pt Arial";
    context.textAlign = 'center'
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
                flagCoords = {x: 13, y: 1}
            } else if (flagStatus == '1') {
                flagCoords = {x: 14, y: 1}
            } else if (flagStatus == '2') {
                flagCoords = {x: 15, y: 1}
            }
            if (typeof flagCoords !== 'undefined') {
                // Get team of player with flag.
                var flagTeam = typeof player.team.length === 'undefined' ? player.team : player.team[thisI]
                var flagPos = {
                    x: context.canvas.width / 2 + (flagTeam == 1 ? -100 : 80),
                    y: context.canvas.height - 50
                }
                context.globalAlpha = 0.5
                context.drawImage(tiles,
                    flagCoords.x * TILE_SIZE,
                    1 * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                    flagPos.x,
                    flagPos.y,
                    TILE_SIZE * .8,
                    TILE_SIZE * .8)
                context.globalAlpha = 1
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
    if (player.flag[thisI] != null) {
        var flagCoords = flagCodes[player.flag[thisI]];
        context.drawImage(tiles,
            flagCoords.x * TILE_SIZE,
            flagCoords.y * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
            point.x + 10,
            point.y - 30,
            TILE_SIZE,
            TILE_SIZE)
    }
}

// Scope: background, inpagepreview
// Uses: $, 
/**
 * Takes in the replay data and returns a DataURL (png) representing the map.
 * @param {PositionData} positions - The replay data.
 * @param {Image} tiles - The image representing the tiles texture.
 * @return {string} - DataURL representing the map.
 */
window.drawMap = function(positions, tiles) {
    var posx = 0;
    var posy = 0;
    var newcan = document.createElement('canvas')
    newcan.id = 'newCanvas'
    newcan.style.display = 'none'
    document.body.appendChild(newcan)
    newcan = document.getElementById('newCanvas')
    newcan.width = positions.map.length * TILE_SIZE
    newcan.height = positions.map[0].length * TILE_SIZE
    newcan.style.zIndex = 200
    newcan.style.position = 'absolute'
    newcan.style.top = 0
    newcan.style.left = 0
    var newcontext = newcan.getContext('2d')
    
    var specialTiles = ['11', '12', '17', '18'];
    var specialTileElements = {
        11: {tile: "redtile", coordinates: {x: 14, y: 4}, tileSize: 40, drawTileFirst: false},
        12: {tile: "bluetile", coordinates: {x: 15, y: 4}, tileSize: 40, drawTileFirst: false},
        17: {tile: "redgoal", coordinates: {x: 14, y: 5}, tileSize: 40, drawTileFirst: false},
        18: {tile: "bluegoal", coordinates: {x: 15, y: 5}, tileSize: 40, drawTileFirst: false}
    }
    
    function drawSpecialTile(col, row, type) {
        if ( type == '1.1' && col != positions.tiles.length-1 && row != 0 ) {
            var test = specialTiles.map(function(tile) {
                if (positions.tiles[+col + 1][row].tile == specialTileElements[tile].tile && positions.tiles[col][+row - 1].tile == specialTileElements[tile].tile) 
                    return ({test:true,tile:tile});
            });
        } else if ( type == '1.2' && col != positions.tiles.length-1 && row != positions.tiles[col].length-1 ) {
            var test = specialTiles.map(function(tile) {
                if (positions.tiles[+col + 1][row].tile == specialTileElements[tile].tile && positions.tiles[col][+row + 1].tile == specialTileElements[tile].tile) 
                    return ({test:true,tile:tile});
            });
        } else if ( type == '1.3' && col != 0 && row != positions.tiles[col].length-1 ) {
            var test = specialTiles.map(function(tile) {
                if (positions.tiles[+col - 1][row].tile == specialTileElements[tile].tile && positions.tiles[col][+row + 1].tile == specialTileElements[tile].tile) 
                    return ({test:true,tile:tile});
            });
        } else if ( type == '1.4' && col != 0 && row != 0 ) {
            var test = specialTiles.map(function(tile) {
                if (positions.tiles[+col - 1][row].tile == specialTileElements[tile].tile && positions.tiles[col][+row - 1].tile == specialTileElements[tile].tile) 
                    return ({test:true,tile:tile});
            });
        };
        if(typeof test === 'undefined' || $.map(test, function(obj, index){if(typeof obj === 'object') return(index)})[0] < 0) return false;
        var specialTile = $.map(test, function(obj, index){if(typeof obj === 'object') return(obj.tile)})[0]
        return specialTile;
    }

    for (col in positions.tiles) {
        for (row in positions.tiles[col]) {
            // draw floor tile underneath certain tiles
            // but don't draw tile outside bounds of the map
            // also whether to draw team tiles / end zones instead of regular tile
            if (positions.tiles[col][row].tile == 'diagonalWall') {
                positions.tiles[col][row].drawSpecialTileFirst = drawSpecialTile(col, row, positions.map[col][row]);
                positions.tiles[col][row].drawTileFirst = true
                if (positions.map[col][row] == '1.1') {
                    if (col != positions.map.length - 1) {
                        if (positions.map[+col + 1][row] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (row != 0) {
                        if (positions.map[col][+row - 1] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (row == 0 && col == positions.map.length - 1)
                        positions.tiles[col][row].drawTileFirst = false;
                } else if (positions.map[col][row] == '1.2') {
                    if (col != positions.map.length - 1) {
                        if (positions.map[+col + 1][row] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (row != positions.map[col].length - 1) {
                        if (positions.map[col][+row + 1] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (col == positions.map.length - 1 && row == positions.map[col].length - 1)
                        positions.tiles[col][row].drawTileFirst = false
                } else if (positions.map[col][row] == '1.3') {
                    if (col != 0) {
                        if (positions.map[+col - 1][row] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (row != positions.map[col].length - 1) {
                        if (positions.map[col][+row + 1] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (col == 0 && row == positions.map[col].length - 1)
                        positions.tiles[col][row].drawTileFirst = false;
                } else if (positions.map[col][row] == '1.4') {
                    if (col != 0) {
                        if (positions.map[+col - 1][row] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (row != 0) {
                        if (positions.map[col][+row - 1] == '0') {
                            positions.tiles[col][row].drawTileFirst = false
                        }
                    }
                    if (row == 0 && col == 0) 
                        positions.tiles[col][row].drawTileFirst = false;
                }
            }
            if (positions.tiles[col][row].drawTileFirst && !positions.tiles[col][row].drawSpecialTileFirst) {
                newcontext.drawImage(tiles,                                         // image
                    13 * TILE_SIZE,                                     // x coordinate of image
                    4 * TILE_SIZE,                                    // y coordinate of image
                    TILE_SIZE,                                        // width of image
                    TILE_SIZE,                                        // height of image
                    col * TILE_SIZE + posx,                            // destination x coordinate
                    row * TILE_SIZE + posy,                            // destination y coordinate
                    TILE_SIZE,                                        // width of destination
                    TILE_SIZE)                                     // height of destination
            }
            if (positions.tiles[col][row].drawSpecialTileFirst) {
                newcontext.drawImage(tiles,
                    specialTileElements[positions.tiles[col][row].drawSpecialTileFirst].coordinates.x * TILE_SIZE,
                    specialTileElements[positions.tiles[col][row].drawSpecialTileFirst].coordinates.y * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE,
                    col * TILE_SIZE + posx,
                    row * TILE_SIZE + posy,
                    TILE_SIZE,
                    TILE_SIZE)
            }
            if (positions.tiles[col][row].tile != 'wall' & positions.tiles[col][row].tile != 'diagonalWall') {
                var thisTileSize = positions.tiles[col][row].tileSize
                newcontext.drawImage(tiles,                                             // image
                    positions.tiles[col][row].coordinates.x * thisTileSize,         // x coordinate of image
                    positions.tiles[col][row].coordinates.y * thisTileSize,        // y coordinate of image
                    thisTileSize,                                        // width of image
                    thisTileSize,                                        // height of image
                    col * thisTileSize + posx,                            // destination x coordinate
                    row * thisTileSize + posy,                            // destination y coordinate
                    thisTileSize,                                        // width of destination
                    thisTileSize)                                     // height of destination
            }
            if (positions.tiles[col][row].tile == 'wall' | positions.tiles[col][row].tile == 'diagonalWall') {
                var thisTileSize = positions.tiles[col][row].tileSize
                for (quadrant in positions.tiles[col][row].coordinates) {
                    offset = {}
                    if (quadrant == 0) {
                        offset.x = 0
                        offset.y = 0
                    } else if (quadrant == 1) {
                        offset.x = thisTileSize
                        offset.y = 0
                    } else if (quadrant == 2) {
                        offset.x = thisTileSize
                        offset.y = thisTileSize
                    } else if (quadrant == 3) {
                        offset.x = 0
                        offset.y = thisTileSize
                    } else {
                        continue
                    }
                    newcontext.drawImage(tiles,
                        positions.tiles[col][row].coordinates[quadrant][0] * thisTileSize * 2,
                        positions.tiles[col][row].coordinates[quadrant][1] * thisTileSize * 2,
                        thisTileSize,
                        thisTileSize,
                        col * thisTileSize * 2 + offset.x + posx,
                        row * thisTileSize * 2 + offset.y + posy,
                        thisTileSize,
                        thisTileSize)
                }
            }
        }
    }
    return (newcontext.canvas.toDataURL())
}

// Uses: thisI
/**
 * Draw the floor tiles.
 * @param  {PositionData} positions
 * @return {TextureImages} textures
 */
function drawFloorTiles(positions, textures) {
    var floorTileElements = {
        3: {tile: "redflag", coordinates: {x: 14, y: 1}, tileSize: 40, tilesImg: "tiles"},
        3.1: {tile: "redflagtaken", coordinates: {x: 14, y: 2}, tileSize: 40, tilesImg: "tiles"},
        4: {tile: "blueflag", coordinates: {x: 15, y: 1}, tileSize: 40, tilesImg: "tiles"},
        4.1: {tile: "blueflagtaken", coordinates: {x: 15, y: 2}, tileSize: 40, tilesImg: "tiles"},
        5: {tile: "speedpad", coordinates: {x: 0, y: 0}, tileSize: 40, tilesImg: "speedpad"},
        5.1: {tile: "emptyspeedpad", coordinates: {x: 4, y: 0}, tileSize: 40, tilesImg: "speedpad"},
        6: {tile: "emptypowerup", coordinates: {x: 12, y: 8}, tileSize: 40, tilesImg: "tiles"},
        6.1: {tile: "jukejuice", coordinates: {x: 12, y: 4}, tileSize: 40, tilesImg: "tiles"},
        6.2: {tile: "rollingbomb", coordinates: {x: 12, y: 5}, tileSize: 40, tilesImg: "tiles"},
        6.3: {tile: "tagpro", coordinates: {x: 12, y: 6}, tileSize: 40, tilesImg: "tiles"},
        6.4: {tile: "speed", coordinates: {x: 12, y: 7}, tileSize: 40, tilesImg: "tiles"},
        9: {tile: "gate", coordinates: {x: 12, y: 3}, tileSize: 40, tilesImg: "tiles"},
        9.1: {tile: "greengate", coordinates: {x: 13, y: 3}, tileSize: 40, tilesImg: "tiles"},
        9.2: {tile: "redgate", coordinates: {x: 14, y: 3}, tileSize: 40, tilesImg: "tiles"},
        9.3: {tile: "bluegate", coordinates: {x: 15, y: 3}, tileSize: 40, tilesImg: "tiles"},
        10: {tile: "bomb", coordinates: {x: 12, y: 1}, tileSize: 40, tilesImg: "tiles"},
        10.1: {tile: "emptybomb", coordinates: {x: 12, y: 2}, tileSize: 40, tilesImg: "tiles"},
        13: {tile: "portal", coordinates: {x: 0, y: 0}, tileSize: 40, tilesImg: "portal"},
        13.1: {tile: "emptyportal", coordinates: {x: 4, y: 0}, tileSize: 40, tilesImg: "portal"},
        14: {tile: "speedpadred", coordinates: {x: 0, y: 0}, tileSize: 40, tilesImg: "speedpadred"},
        14.1: {tile: "emptyspeedpadred", coordinates: {x: 4, y: 0}, tileSize: 40, tilesImg: "speedpadred"},
        15: {tile: "speedpadblue", coordinates: {x: 0, y: 0}, tileSize: 40, tilesImg: "speedpadblue"},
        15.1: {tile: "emptyspeedpadblue", coordinates: {x: 4, y: 0}, tileSize: 40, tilesImg: "speedpadblue"},
        16: {tile: "yellowflag", coordinates: {x: 13, y: 1}, tileSize: 40, tilesImg: "tiles"},
        16.1: {tile: "yellowflagtaken", coordinates: {x: 13, y: 2}, tileSize: 40, tilesImg: "tiles"}
    }

    var player = getPlayer(positions);
    for (var floorTile in positions.floorTiles) {
        var mod = thisI % (player.fps * 2 / 3);
        var fourth = (player.fps * 2 / 3) / 4;
        var animationTile;
        if (mod < fourth) {
            animationTile = 0;
        } else if (mod < fourth * 2) {
            animationTile = 1;
        } else if (mod < fourth * 3) {
            animationTile = 2;
        } else {
            animationTile = 3;
        }

        var thisFloorTile = floorTileElements[positions.floorTiles[floorTile].value[thisI]]
        if (typeof thisFloorTile === 'undefined') {
            return null;
        } else {
            var thisImg;
            if (thisFloorTile.tilesImg == 'tiles') {
                thisImg = textures.tiles;
            } else if (thisFloorTile.tilesImg == 'speedpad') {
                thisImg = textures.speedpad;
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'portal') {
                thisImg = textures.portal;
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'speedpadred') {
                thisImg = textures.speedpadred;
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'speedpadblue') {
                thisImg = textures.speedpadblue;
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            }

            context.drawImage(thisImg,
                thisFloorTile.coordinates.x * TILE_SIZE,
                thisFloorTile.coordinates.y * TILE_SIZE,
                TILE_SIZE,
                TILE_SIZE,
                positions.floorTiles[floorTile].x * TILE_SIZE + posx,
                positions.floorTiles[floorTile].y * TILE_SIZE + posy,
                TILE_SIZE,
                TILE_SIZE);
        }
    }
}

function bombPop(positions) {
    positions.bombs.forEach(function (bmb) {
        for (j in positions) {
            if (positions[j].me == 'me') {
                me = j
            }
        }
        var bTime = new Date(bmb.time).getTime();
        var cTime = new Date(positions.clock[thisI]).getTime();
        if(bTime <= cTime && cTime - bTime < 200 && bmb.type === 2) {
            if(typeof bmb.bombAnimation === 'undefined') {
                bmb.bombAnimation = {
                    length: Math.round(positions[me].fps / 10),
                    frame: 0
                }
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
    for (var j in data) {
        // Check that this is a player object.
        if (j.search('player') == 0) {
            var otherPlayer = data[j];
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
            length: Math.round(player.fps / 10),
            frame: 0
        }
    }
    // if an animation should be in progress, draw it
    if (typeof player.rollingBombAnimation != 'undefined') {
        player.rollingBombAnimation.frame++
        rollingBombSize = 40 + (200 * (player.rollingBombAnimation.frame / player.rollingBombAnimation.length))
        rollingBombOpacity = 1 - player.rollingBombAnimation.frame / player.rollingBombAnimation.length

        context.fillStyle = "#FFFF00"
        context.globalAlpha = rollingBombOpacity
        context.beginPath()
        rollingBombX = player.x[thisI] - recordingPlayer.x[thisI] + context.canvas.width / 2;
        rollingBombY = player.y[thisI] - recordingPlayer.y[thisI] + context.canvas.height / 2;
        context.arc(rollingBombX, rollingBombY, Math.round(rollingBombSize), 0, 2 * Math.PI, !0)
        context.closePath()
        context.fill()
        context.globalAlpha = 1
        context.fillStyle = "#ffffff"
        if (player.rollingBombAnimation.frame >= player.rollingBombAnimation.length) {
            delete(player.rollingBombAnimation)
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
    if (player.dead[thisI] & !player.dead[thisI - 1] & player.draw[thisI - 1]) {
        player.popAnimation = {
            length: Math.round(player.fps / 10),
            frame: 0
        }
    }
    // if an animation should be in progress, draw it
    if (typeof player.popAnimation != 'undefined') {
        player.popAnimation.frame++
        popSize = 40 + (80 * (player.popAnimation.frame / player.popAnimation.length))
        popOpacity = 1 - player.popAnimation.frame / player.popAnimation.length

        context.globalAlpha = popOpacity
        context.drawImage(tiles,
            (player.team[thisI] == 1 ? 14 : 15) * TILE_SIZE,
            0,
            TILE_SIZE,
            TILE_SIZE,
            player.x[thisI] - recordingPlayer.x[thisI] + context.canvas.width / 2 - popSize / 2,
            player.y[thisI] - recordingPlayer.y[thisI] + context.canvas.height / 2 - popSize / 2,
            popSize,
            popSize)
        context.globalAlpha = 1
        if (player.popAnimation.frame >= player.popAnimation.length) {
            delete(player.popAnimation)
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
    if (positions.splats) {
        // Draw the splats that occurred up to this point in time.
        for (var splatI in positions.splats) {
            // Cache the number corresponding to the splat image used.
            if (!positions.splats[splatI].img) {
                positions.splats[splatI].img = Math.floor(Math.random() * 7);
            }
            var thisSplat = positions.splats[splatI];
            var thisTime = new Date(positions.clock[thisI]).getTime();
            var thisSplatTime = new Date(thisSplat.time).getTime();
            if (thisSplatTime <= thisTime) {
                context.drawImage(img,
                    thisSplat.img * 120,
                    (thisSplat.t - 1) * 120,
                    120,
                    120,
                    thisSplat.x + posx - 60 + 20,
                    thisSplat.y + posy - 60 + 20,
                    120,
                    120);
            }
        }
    }
}

// Uses: context, thisI
/**
 * Draw spawning players.
 * @param  {PositioinData} positions
 * @param  {Image} tiles - The tiles texture image.
 */
function drawSpawns(positions, tiles) {
    if (positions.spawns) {
        context.globalAlpha = .25;
        for (var spawnI in positions.spawns) {
            var thisSpawn = positions.spawns[spawnI];
            var thisTime = new Date(positions.clock[thisI]).getTime()
            var thisSpawnTime = new Date(thisSpawn.time).getTime()
            var timeDiff = thisTime - thisSpawnTime // positive if spawn has already happened
            if (timeDiff >= 0 & timeDiff <= thisSpawn.w) {
                context.drawImage(tiles,
                    (thisSpawn.t == 1 ? 14 : 15) * TILE_SIZE,
                    0,
                    40,
                    40,
                    thisSpawn.x + posx,
                    thisSpawn.y + posy,
                    40,
                    40)
            }
        }
        context.globalAlpha = 1;
    }
}

// Scope: file
// Uses: context, thisI
function drawEndText(positions) {
    if (positions.end) {
        var endTime = new Date(positions.end.time).getTime()
        var thisTime = new Date(positions.clock[thisI]).getTime()
        if (endTime <= thisTime) {
            var endColor, endText;
            var winner = positions.end.winner;
            if (winner == 'red') {
                endColor = "#ff0000";
                endText = "Red Wins!";
            } else if (winner == 'blue') {
                endColor = "#0000ff";
                endText = "Blue Wins!";
            } else if (winner == 'tie') {
                endColor = "#ffffff";
                endText = "It's a Tie!";
            } else {
                endColor = "#ffffff";
                endText = winner;
            }
            context.save()
            context.textAlign = "center"
            context.font = "bold 48pt Arial"
            context.fillStyle = endColor
            context.strokeStyle = "#000000"
            context.lineWidth = 2
            context.strokeText(endText, context.canvas.width / 2, 100)
            context.fillText(endText, context.canvas.width / 2, 100)
            context.restore()
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
        // Handling the possibility that player team is not an array?
        if (typeof player.team.length === 'undefined') {
            return player.team;
        } else {
            return player.team[frame];
        }
    }

    // Get the name for a player object.
    function getName(player, frame) {
        if (typeof player.name == 'string') {
            return player.name;
        } else {
            return player.name[frame];
        }
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
            if (thisI == 0 || getDraw(player, thisI - 1)) {
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
                        drawTagpro(drawPos);
                    }
                    if (bomb) {
                        drawBomb(drawPos, player.fps);
                    }

                    drawFlag(player, drawPos, textures.tiles);
                    drawText(drawPos, {
                        name: name,
                        degree: degree,
                        auth: auth
                    });

                    if (typeof player.flair !== 'undefined') {
                        drawFlair(player.flair[thisI], {
                            x: drawPos.x + 12,
                            y: drawPos.y - 20
                        }, textures.flair);
                    }
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
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    // Coordinates for center of canvas.
    posx = -(player.x[thisI] - context.canvas.width / 2 + TILE_SIZE / 2)
    posy = -(player.y[thisI] - context.canvas.height / 2 + TILE_SIZE / 2)
    context.drawImage(mapImg, 0, 0, mapImg.width, mapImg.height,
        posx,
        posy,
        mapImg.width, mapImg.height)
    if (options.splats) {
        drawSplats(positions, textures.splats)
    }
    drawFloorTiles(positions, textures);
    drawSpawns(positions, textures.tiles);
    drawBalls(positions, textures, options.spin);
    if (options.ui) {
        drawClock(positions)
        drawScore(positions.score[thisI]);
        drawScoreFlag(positions, textures.tiles);
    }
    if (options.chat) {
        drawChats(positions)
    }
    bombPop(positions)
    drawEndText(positions)
}

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
    
    var replayLength = positions.clock.length;
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
}

})(window);

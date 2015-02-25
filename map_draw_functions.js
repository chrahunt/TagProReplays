/**
 * This file contains the functions used to draw the replay data onto
 * the canvas for the in-page preview as well as for the replay
 * rendering.
 *
 * This script is included as a content script and a background script.
 */
(function(window) {

// Constant tile size.
var TILE_SIZE = 40;

// Draw-function global. Set in drawReplay and animateReplay.
var thisI = 0;

// Draw-function global. Set in 
var posx, posy;

/**
 * Check whether spin should be used when drawing balls.
 * @return {boolean} - Whether to use spin.
 */
// Scope: file
// Uses: localStorage for whether to use spin
function useSpin() {
    var spin = false;
    // Check for function presence for use in content script.
    if (typeof readCookie !== 'undefined') {
        if (readCookie('useSpin') == 'true') {
            spin = true;
        }
    }
    if (localStorage.getItem('useSpin') == 'true') {
        spin = true;
    }
    return spin;
}

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

// Scope: file
// Uses: context
function drawText(ballname, namex, namey, auth, degree) {
    context.textAlign = 'left'
    context.fillStyle = (auth == true) ? "#BFFF00" : "#ffffff"
    context.strokeStyle = "#000000"
    context.shadowColor = "#000000"
    context.shadowOffsetX = 0
    context.shadowOffsetY = 0
    context.lineWidth = 2
    context.font = "bold 8pt Arial"
    context.shadowBlur = 10
    context.strokeText(ballname, namex + 3, namey)
    if (typeof degree != "undefined" && degree != 0) {
        context.strokeText(degree + "°", namex + 10, namey + 12)
    }
    context.shadowBlur = 0
    context.fillText(ballname, namex + 3, namey)
    if (typeof degree != "undefined" && degree != 0) {
        context.fillStyle = "#ffffff"
        context.fillText(degree + "°", namex + 10, namey + 12)
    }
}

// Scope: file
// Uses: context
function drawFlair(ballFlair, flairx, flairy) {
    if (ballFlair !== null) {
        context.drawImage(flairImg,
            ballFlair.x * 16,
            ballFlair.y * 16,
            16,
            16,
            flairx,
            flairy,
            16,
            16)
    }
}

// Scope: file
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
    return (context.measureText(text).width)
}

// Scope: file
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

// Scope: file
// Uses: thisI, img, tagproImg, rollingbombImg, img, context
function drawPowerups(ball, ballx, bally, positions) {
    if (positions[ball].tagpro[thisI] == true) {
        context.drawImage(tagproImg,
            0,
            0,
            TILE_SIZE,
            TILE_SIZE,
            ballx,
            bally,
            TILE_SIZE,
            TILE_SIZE)
    }
    if (positions[ball].bomb[thisI] == true) {
        if (Math.round(Math.random() * 4) == 1) {
            context.drawImage(rollingbombImg,
                0,
                0,
                TILE_SIZE,
                TILE_SIZE,
                ballx,
                bally,
                TILE_SIZE,
                TILE_SIZE)
        }
    }
    if (positions[ball].grip[thisI] == true) {
        context.drawImage(img,
            12 * TILE_SIZE,
            4 * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
            ballx,
            bally + 20,
            TILE_SIZE / 2,
            TILE_SIZE / 2)
    }
}

// Scope: file
// Uses: $, thisI, context
function drawClock(positions) {
    if (!positions.end || new Date(positions.end.time).getTime() > new Date(positions.clock[thisI]).getTime()) {
        var curTimeMilli;
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

// Scope: file
// Uses: thisI, context
function drawScore(positions) {
    var thisScore = positions.score[thisI]
    context.textAlign = "center"
    context.fillStyle = "rgba(255, 0, 0, .5)"
    context.font = "bold 40pt Arial"
    context.fillText(thisScore.r, context.canvas.width / 2 - 120, context.canvas.height - 50)
    context.fillStyle = "rgba(0, 0, 255, .5)",
        context.fillText(thisScore.b, context.canvas.width / 2 + 120, context.canvas.height - 50)
}

// Scope: file
// Uses: thisI, context
function drawScoreFlag(positions) {
    for (var j in positions) {
        var flagCoords;
        if (typeof positions[j].flag != 'undefined') {
            if (positions[j].flag[thisI] != null) {
                if (positions[j].flag[thisI] == '3') {
                    flagCoords = {x: 13, y: 1}
                } else if (positions[j].flag[thisI] == '1') {
                    flagCoords = {x: 14, y: 1}
                } else if (positions[j].flag[thisI] == '2') {
                    flagCoords = {x: 15, y: 1}
                }
                if (typeof flagCoords !== 'undefined') {
                    var flagTeam = typeof positions[j].team.length === 'undefined' ? positions[j].team : positions[j].team[thisI]
                    var flagPos = {
                        x: context.canvas.width / 2 + (flagTeam == 1 ? -100 : 80),
                        y: context.canvas.height - 50
                    }
                    context.globalAlpha = 0.5
                    context.drawImage(img,
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
        }
    }
}

// Scope: file
// uses: thisI, context
function drawFlag(ball, ballx, bally, positions) {
    var flagCodes = {
        1: {x: 14, y: 1},
        2: {x: 15, y: 1},
        3: {x: 13, y: 1}
    };
    if (positions[ball].flag[thisI] != null) {
        var flagCoords = flagCodes[positions[ball].flag[thisI]]
        context.drawImage(img,
            flagCoords.x * TILE_SIZE,
            flagCoords.y * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
            ballx + 10,
            bally - 30,
            TILE_SIZE,
            TILE_SIZE)
    }
}

/**
 * Takes in the replay data and returns a DataURL (png) representing the map.
 * posx - offset of actual map image from left side of generated image
 * posy - offset of actual map image from top of generated image
 * positions - replay data
 */
// Scope: background, inpagepreview
// Uses: $
// Need to finish this one.
window.drawMap = function(posx, posy, positions) {
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
                newcontext.drawImage(img,                                         // image
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
                newcontext.drawImage(img,
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
                newcontext.drawImage(img,                                             // image
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
                    newcontext.drawImage(img,
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

// Scope: file
// Uses: thisI, img, speedpadImg, portalImg, speedpadredImg, speedpadblueImg
function drawFloorTiles(positions) {
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
                thisImg = img;
            } else if (thisFloorTile.tilesImg == 'speedpad') {
                thisImg = speedpadImg;
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'portal') {
                thisImg = portalImg;
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'speedpadred') {
                thisImg = speedpadredImg;
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'speedpadblue') {
                thisImg = speedpadblueImg;
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

/**
 * Initiate or continue a rolling bomb explosion animation for the
 * given player.
 * @param  {Player} player - The player to do the animation update for.
 * @param  {PositionData} data - The replay data.
 * @return {[type]}           [description]
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

// Scope: file
// Uses: thisI, img, context
/**
 * Initiate or continue a ball pop animation for the given player.
 * @param {Player} player - The player to update the ball pop 
 *   animation for.
 * @param {PositionData} data - The replay data.
 */
function ballPop(player, data) {
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
        context.drawImage(img,
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

// Scope: file
// Uses: thisI, context, splatsImg
function drawSplats(positions) {
    if (positions.splats) {
        // Draw the splats that occurred up to this point in time.
        for (var splatI in positions.splats) {
            if (!positions.splats[splatI].img) {
                positions.splats[splatI].img = Math.floor(Math.random() * 7)
            }
            var thisSplat = positions.splats[splatI]
            var thisTime = new Date(positions.clock[thisI]).getTime()
            var thisSplatTime = new Date(thisSplat.time).getTime()
            if (thisSplatTime <= thisTime) {
                context.drawImage(splatsImg,
                    thisSplat.img * 120,
                    (thisSplat.t - 1) * 120,
                    120,
                    120,
                    thisSplat.x + posx - 60 + 20,
                    thisSplat.y + posy - 60 + 20,
                    120,
                    120)
            }
        }
    }
}

// Scope: file
// Uses: context, thisI, img
function drawSpawns(positions) {
    if (positions.spawns) {
        context.globalAlpha = .25
        for (var spawnI in positions.spawns) {
            var thisSpawn = positions.spawns[spawnI]
            var thisTime = new Date(positions.clock[thisI]).getTime()
            var thisSpawnTime = new Date(thisSpawn.time).getTime()
            var timeDiff = thisTime - thisSpawnTime // positive if spawn has already happened
            if (timeDiff >= 0 & timeDiff <= thisSpawn.w) {
                context.drawImage(img,
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
        context.globalAlpha = 1
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
            context.strokeText(endText, context.canvas.width / 2, 100)
            context.fillText(endText, context.canvas.width / 2, 100)
            context.restore()
        }
    }
}

// scope: file
// uses: 
// TODO
function drawBalls(positions) {
    var spin = useSpin();

    var player = getPlayer(positions);
    // what team?
    var myTeam;
    if (typeof player.team.length === 'undefined') {
        myTeam = player.team
    } else {
        myTeam = player.team[thisI]
    }
    if (player.dead[thisI] == false) {
    
        // draw own ball with or without spin
        if(spin === false || typeof player.angle === 'undefined') {
            context.drawImage(img,
                (myTeam == 1 ? 14 : 15) * TILE_SIZE,
                0,
                TILE_SIZE,
                TILE_SIZE,
                context.canvas.width / 2 - TILE_SIZE / 2,
                context.canvas.height / 2 - TILE_SIZE / 2,
                TILE_SIZE,
                TILE_SIZE);
        } else {
            context.translate(context.canvas.width/2, context.canvas.height/2);
            context.rotate(player.angle[thisI]);
            context.drawImage(img,
                (myTeam == 1 ? 14 : 15) * TILE_SIZE,    
                0,
                TILE_SIZE,
                TILE_SIZE,
                -20,
                -20,
                TILE_SIZE,
                TILE_SIZE);
            context.rotate(-player.angle[thisI]);
            context.translate(-context.canvas.width/2, -context.canvas.height/2);        
        }

        drawPowerups(me, context.canvas.width / 2 - TILE_SIZE / 2, context.canvas.height / 2 - TILE_SIZE / 2, positions)
        drawFlag(me, context.canvas.width / 2 - TILE_SIZE / 2, context.canvas.height / 2 - TILE_SIZE / 2, positions)
        thisName = (typeof player.name == 'string') ? player.name : player.name[thisI]
        drawText(thisName,
            context.canvas.width / 2 - TILE_SIZE / 2 + 30,
            context.canvas.height / 2 - TILE_SIZE / 2 - 5,
            (typeof player.auth != 'undefined') ? player.auth[thisI] : undefined,
            (typeof player.degree != 'undefined') ? player.degree[thisI] : undefined)
        if (typeof player.flair !== 'undefined') {
            drawFlair(player.flair[thisI],
                context.canvas.width / 2 - 16 / 2,
                context.canvas.height / 2 - TILE_SIZE / 2 - 17)
        }
    }
    ballPop(player, positions);
    rollingBombPop(player, positions);

    // draw other balls
    for (var j in positions) {
        if (typeof positions[j].me != undefined & positions[j].me == 'other') {
            var otherPlayer = positions[j];
            if (otherPlayer.dead[thisI] == false) {
                if (otherPlayer.draw[thisI] == true) {
                    if (thisI == 0 || otherPlayer.draw[thisI - 1] == true) {
                        if ((otherPlayer.dead[thisI - 1] == true & otherPlayer.x[thisI] != otherPlayer.x[thisI - otherPlayer.fps]) | otherPlayer.dead[thisI - 1] != true) {
                            // what team?
                            if (typeof otherPlayer.team.length === 'undefined') {
                                thisTeam = otherPlayer.team
                            } else {
                                thisTeam = otherPlayer.team[thisI]
                            }
                            
                            // draw with or without spin
                            if(spin === false || typeof otherPlayer.angle === 'undefined') {
                                context.drawImage(img,                                                                        // image
                                    (thisTeam == 1 ? 14 : 15) * TILE_SIZE,                                                        // x coordinate of image
                                    0,                                                                                        // y coordinate of image
                                    TILE_SIZE,                                                                                // width of image
                                    TILE_SIZE,                                                                                // height of image
                                    otherPlayer.x[thisI] - player.x[thisI] + context.canvas.width / 2 - TILE_SIZE / 2,    // destination x coordinate
                                    otherPlayer.y[thisI] - player.y[thisI] + context.canvas.height / 2 - TILE_SIZE / 2,    // destination y coordinate
                                    TILE_SIZE,                                                                                // width of destination
                                    TILE_SIZE)                                                                                // height of destination
                            } else {
                                context.translate(otherPlayer.x[thisI] - player.x[thisI] + context.canvas.width / 2, 
                                                  otherPlayer.y[thisI] - player.y[thisI] + context.canvas.height / 2);
                                context.rotate(otherPlayer.angle[thisI]);
                                context.drawImage(img,
                                    (thisTeam == 1 ? 14 : 15) * TILE_SIZE,    
                                    0,
                                    TILE_SIZE,
                                    TILE_SIZE,
                                    -20,
                                    -20,
                                    TILE_SIZE,
                                    TILE_SIZE);
                                context.rotate(-otherPlayer.angle[thisI]);
                                context.translate(-(otherPlayer.x[thisI] - player.x[thisI] + context.canvas.width / 2), 
                                                  -(otherPlayer.y[thisI] - player.y[thisI] + context.canvas.height / 2));    
                            }

                            drawPowerups(j, otherPlayer.x[thisI] - player.x[thisI] + context.canvas.width / 2 - TILE_SIZE / 2,
                                otherPlayer.y[thisI] - player.y[thisI] + context.canvas.height / 2 - TILE_SIZE / 2, positions)
                            drawFlag(j, otherPlayer.x[thisI] - player.x[thisI] + context.canvas.width / 2 - TILE_SIZE / 2,
                                otherPlayer.y[thisI] - player.y[thisI] + context.canvas.height / 2 - TILE_SIZE / 2, positions)
                            thisName = (typeof otherPlayer.name === 'string') ? otherPlayer.name : otherPlayer.name[thisI]
                            drawText(thisName,
                                otherPlayer.x[thisI] - player.x[thisI] + context.canvas.width / 2 - TILE_SIZE / 2 + 30,
                                otherPlayer.y[thisI] - player.y[thisI] + context.canvas.height / 2 - TILE_SIZE / 2 - 5,
                                (typeof otherPlayer.auth != 'undefined') ? otherPlayer.auth[thisI] : undefined,
                                (typeof otherPlayer.degree != 'undefined') ? otherPlayer.degree[thisI] : undefined)
                            if (typeof otherPlayer.flair !== 'undefined') {
                                drawFlair(otherPlayer.flair[thisI],
                                    otherPlayer.x[thisI] - player.x[thisI] + context.canvas.width / 2 - 16 / 2,
                                    otherPlayer.y[thisI] - player.y[thisI] + context.canvas.height / 2 - TILE_SIZE / 2 - 20)
                            }
                            rollingBombPop(otherPlayer, positions);
                        }
                    }
                }
            }
            ballPop(otherPlayer, positions);
        }
    }
}

/**
 * Edit mapCanvas to reflect the replay at the given frame.
 * frame - frame number of replay
 * positions - replay data
 * mapImg - html img element reflecting the image of the map
 */
// Scope: background, in-page-preview, TagProReplays
// uses: context, mapImg, 
window.animateReplay = function(frame, positions, mapImg, spin, showSplats, showClockAndScore, showChat) {
    // Update drawing function global with frame number.
    thisI = frame;
    var player = getPlayer(positions);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    // Coordinates for center of canvas.
    posx = -(player.x[thisI] - context.canvas.width / 2 + TILE_SIZE / 2)
    posy = -(player.y[thisI] - context.canvas.height / 2 + TILE_SIZE / 2)
    context.drawImage(mapImg, 0, 0, mapImg.width, mapImg.height,
        posx,
        posy,
        mapImg.width, mapImg.height)
    if (showSplats) {
        drawSplats(positions)
    }
    drawFloorTiles(positions)
    drawSpawns(positions)
    drawBalls(positions)
    if (showClockAndScore) {
        drawClock(positions)
        drawScore(positions)
        drawScoreFlag(positions)
    }
    if (showChat) {
        drawChats(positions)
    }
    bombPop(positions)
    drawEndText(positions)
}

/**
 * Edit mapCanvas to reflect the replay at the given frame.
 * frame - frame number of replay
 * positions - replay data
 * mapImg - html img element reflecting the image of the map
 */
// function to draw stuff onto the canvas
function drawReplay(frame, positions, mapImg, thisContext) {
    thisI = frame;
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j;
        }
    }
    context = thisContext;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    posx = -(positions[me].x[thisI] - context.canvas.width / 2 + TILE_SIZE / 2)
    posy = -(positions[me].y[thisI] - context.canvas.height / 2 + TILE_SIZE / 2)
    context.drawImage(mapImg, 0, 0, mapImg.width, mapImg.height,
        posx,
        posy,
        mapImg.width, mapImg.height)
    drawSplats(positions)
    drawFloorTiles(positions)
    drawSpawns(positions)
    drawBalls(positions)
    drawClock(positions)
    drawScore(positions)
    drawScoreFlag(positions)
    drawChats(positions)
    bombPop(positions)
    drawEndText(positions)
    return (context.canvas.toDataURL());
}

// function that takes positions file and draws the frame 75% of the way through the 
// replay at full size. then redraws that at reduced size.
// returns a dataURL of the resulting image
// used by: background
window.drawPreview = function(positions) {
    console.log("Drawing preview.");
    $('#tiles')[0].src = defaultTextures.tiles
    $('#portal')[0].src = defaultTextures.portal
    $('#speedpad')[0].src = defaultTextures.speedpad
    $('#speedpadred')[0].src = defaultTextures.speedpadred
    $('#speedpadblue')[0].src = defaultTextures.speedpadblue
    $('#splats')[0].src = defaultTextures.splats

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
    
    var previewMapData = drawMap(0,0,positions);
    var previewMap = document.createElement('img');
    previewMap.src = previewMapData;

    var fullImageData = drawReplay(thisI, positions, previewMap, fullPreviewContext);
    var img = document.createElement('img');
    img.src = fullImageData;
    smallPreviewContext.drawImage(img,
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
    img.remove();
    return result;
}

})(window);

(function() {
var logger = Logger('map_draw_functions');
logger.info('Loading map_draw_functions.');

// Renderer-global frame.
var frame;

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

function drawChats(positions) {
    if (positions.chat) {
        chats = positions.chat
        thisTime = new Date(positions.clock[frame]).getTime()
        currentChats = new Array(10)
        for (chatI in chats) {
            if (chats[chatI].removeAt - 30000 < thisTime & chats[chatI].removeAt > thisTime) {
                currentChats.shift()
                currentChats.push(chats[chatI])
            }
        }
        for (chatI = 0; chatI < currentChats.length; chatI++) {
            if (typeof currentChats[0] == 'undefined') {
                currentChats.shift()
                chatI--
            }
        }

        for (chatI in currentChats) {
            thisChat = currentChats[chatI]
            chatLeft = 10
            chatTop = context.canvas.height - 175 + chatI * 12
            if (typeof thisChat.from == 'number') {
                if (positions['player' + thisChat.from].auth[frame]) {
                    chatLeft += prettyText("✓ ", chatLeft, chatTop, "#BFFF00")
                }
                chatName = (typeof positions['player' + thisChat.from].name === "string") ? positions['player' + thisChat.from].name : positions['player' + thisChat.from].name[frame]
                chatLeft += prettyText(chatName + ': ',
                    chatLeft,
                    chatTop,
                    positions['player' + thisChat.from].team[frame] == 1 ? "#FFB5BD" : "#CFCFFF")
            }
            if (thisChat.to == 'team') {
                chatColor = positions['player' + thisChat.from].team[frame] == 1 ? "#FFB5BD" : "#CFCFFF"
            } else if (thisChat.to == 'group') {
                chatColor = "#E7E700"
            } else {
                chatColor = 'white'
            }
            prettyText(thisChat.message, chatLeft, chatTop, chatColor)
        }
    }
}


function drawPowerups(ball, ballx, bally, positions) {
    if (positions[ball].tagpro[frame] != false) {
        context.drawImage(tagproImg,
            0,
            0,
            tileSize,
            tileSize,
            ballx,
            bally,
            tileSize,
            tileSize)
    }
    if (positions[ball].bomb[frame] != false) {
        if (Math.round(Math.random() * 4) == 1) {
            context.drawImage(rollingbombImg,
                0,
                0,
                tileSize,
                tileSize,
                ballx,
                bally,
                tileSize,
                tileSize)
        }
    }
    if (positions[ball].grip[frame] != false) {
        context.drawImage(img,
            12 * tileSize,
            4 * tileSize,
            tileSize,
            tileSize,
            ballx,
            bally + 20,
            tileSize / 2,
            tileSize / 2)
    }
}

function drawClock(positions) {
    if (!positions.end || new Date(positions.end.time).getTime() > new Date(positions.clock[frame]).getTime()) {
        if (!$.isArray(positions.gameEndsAt)) {
            if (new Date(positions.gameEndsAt).getTime() <= new Date(positions.clock[frame]).getTime()) {
                curTimeMilli = new Date(positions.gameEndsAt).getTime() + 12 * 60 * 1000 - new Date(positions.clock[frame]).getTime()
            } else {
                curTimeMilli = new Date(positions.gameEndsAt) - new Date(positions.clock[frame])
            }
        } else {
            if (positions.gameEndsAt.length < 2) {
                curTimeMilli = new Date(positions.gameEndsAt[0]).getTime() - new Date(positions.clock[frame]).getTime()
            } else {
                if (new Date(positions.clock[frame]).getTime() >= new Date(positions.gameEndsAt[1].startTime).getTime()) {
                    curTimeMilli = new Date(positions.gameEndsAt[1].startTime).getTime() + positions.gameEndsAt[1].time - new Date(positions.clock[frame]).getTime()
                } else {
                    curTimeMilli = new Date(positions.gameEndsAt[0]).getTime() - new Date(positions.clock[frame]).getTime()
                }
            }
        }
        minute = ('0' + Math.floor(curTimeMilli / 1000 / 60)).slice(-2)
        seconds = ('0' + Math.floor(curTimeMilli / 1000 % 60)).slice(-2)
        seconds = (seconds == '60' ? '00' : seconds)
        curTime = minute + ':' + seconds
    }
    context.fillStyle = "rgba(255, 255, 255, 1)";
    context.strokeStyle = "rgba(0, 0, 0, .75)";
    context.font = "bold 30pt Arial";
    context.textAlign = 'center'
    context.lineWidth = 4;
    context.strokeText(curTime, context.canvas.width / 2, context.canvas.height - 25);
    context.fillText(curTime, context.canvas.width / 2, context.canvas.height - 25);
}

function drawScore(positions) {
    thisScore = positions.score[frame]
    context.textAlign = "center"
    context.fillStyle = "rgba(255, 0, 0, .5)"
    context.font = "bold 40pt Arial"
    context.fillText(thisScore.r, context.canvas.width / 2 - 120, context.canvas.height - 50)
    context.fillStyle = "rgba(0, 0, 255, .5)",
        context.fillText(thisScore.b, context.canvas.width / 2 + 120, context.canvas.height - 50)
}

function drawScoreFlag(positions) {
    for (j in positions) {
        delete(flagCoords)
        if (typeof positions[j].flag != 'undefined') {
            if (positions[j].flag[frame] != null) {
                if (positions[j].flag[frame] == '3') {
                    flagCoords = {x: 13, y: 1}
                } else if (positions[j].flag[frame] == '1') {
                    flagCoords = {x: 14, y: 1}
                } else if (positions[j].flag[frame] == '2') {
                    flagCoords = {x: 15, y: 1}
                }
                if (typeof flagCoords != 'undefined') {
                    flagTeam = typeof positions[j].team.length === 'undefined' ? positions[j].team : positions[j].team[frame]
                    flagPos = {
                        x: context.canvas.width / 2 + (flagTeam == 1 ? -100 : 80),
                        y: context.canvas.height - 50
                    }
                    context.globalAlpha = 0.5
                    context.drawImage(img,
                        flagCoords.x * tileSize,
                        1 * tileSize,
                        tileSize,
                        tileSize,
                        flagPos.x,
                        flagPos.y,
                        tileSize * .8,
                        tileSize * .8)
                    context.globalAlpha = 1
                }
            }
        }
    }
}


function drawFlag(ball, ballx, bally, positions) {
    flagCodes = {
        1: {x: 14, y: 1},
        2: {x: 15, y: 1},
        3: {x: 13, y: 1}
    }
    if (positions[ball].flag[frame] != null) {
        flagCoords = flagCodes[positions[ball].flag[frame]]
        context.drawImage(img,
            flagCoords.x * tileSize,
            flagCoords.y * tileSize,
            tileSize,
            tileSize,
            ballx + 10,
            bally - 30,
            tileSize,
            tileSize)
    }
}

/**
 * Takes in the replay data and returns a DataURL (png) representing the map.
 * posx - offset of actual map image from left side of generated image
 * posy - offset of actual map image from top of generated image
 * positions - replay data
 */
drawMap = function(posx, posy, positions) {
    newcan = document.createElement('canvas')
    newcan.id = 'newCanvas'
    newcan.style.display = 'none'
    document.body.appendChild(newcan)
    newcan = document.getElementById('newCanvas')
    newcan.width = positions.map.length * tileSize
    newcan.height = positions.map[0].length * tileSize
    newcan.style.zIndex = 200
    newcan.style.position = 'absolute'
    newcan.style.top = 0
    newcan.style.left = 0
    newcontext = newcan.getContext('2d')
    
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
                tileSize = 40
                newcontext.drawImage(img, 										// image
                    13 * tileSize, 									// x coordinate of image
                    4 * tileSize,									// y coordinate of image
                    tileSize,										// width of image
                    tileSize,										// height of image
                    col * tileSize + posx,							// destination x coordinate
                    row * tileSize + posy,							// destination y coordinate
                    tileSize,										// width of destination
                    tileSize) 									// height of destination
            }
            if (positions.tiles[col][row].drawSpecialTileFirst) {
            	newcontext.drawImage(img,
            		specialTileElements[positions.tiles[col][row].drawSpecialTileFirst].coordinates.x * tileSize,
            		specialTileElements[positions.tiles[col][row].drawSpecialTileFirst].coordinates.y * tileSize,
            		tileSize,
            		tileSize,
            		col * tileSize + posx,
            		row * tileSize + posy,
            		tileSize,
            		tileSize)
            }
            if (positions.tiles[col][row].tile != 'wall' & positions.tiles[col][row].tile != 'diagonalWall') {
                tileSize = positions.tiles[col][row].tileSize
                newcontext.drawImage(img, 											// image
                    positions.tiles[col][row].coordinates.x * tileSize, 		// x coordinate of image
                    positions.tiles[col][row].coordinates.y * tileSize,		// y coordinate of image
                    tileSize,										// width of image
                    tileSize,										// height of image
                    col * tileSize + posx,							// destination x coordinate
                    row * tileSize + posy,							// destination y coordinate
                    tileSize,										// width of destination
                    tileSize) 									// height of destination
            }
            if (positions.tiles[col][row].tile == 'wall' | positions.tiles[col][row].tile == 'diagonalWall') {
                thisTileSize = positions.tiles[col][row].tileSize
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

function drawFloorTiles(positions) {
    floorTileElements = {
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
    for (floorTile in positions.floorTiles) {
        mod = frame % (positions[me].fps * 2 / 3)
        fourth = (positions[me].fps * 2 / 3) / 4
        if (mod < fourth) {
            animationTile = 0
        } else if (mod < fourth * 2) {
            animationTile = 1
        } else if (mod < fourth * 3) {
            animationTile = 2
        } else {
            animationTile = 3
        }

        thisFloorTile = floorTileElements[positions.floorTiles[floorTile].value[frame]]
        if (typeof thisFloorTile === 'undefined') {
            return (null)
        } else {
            if (thisFloorTile.tilesImg == 'tiles') {
                framemg = img
            } else if (thisFloorTile.tilesImg == 'speedpad') {
                framemg = speedpadImg
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'portal') {
                framemg = portalImg
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'speedpadred') {
                framemg = speedpadredImg
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            } else if (thisFloorTile.tilesImg == 'speedpadblue') {
                framemg = speedpadblueImg
                if (thisFloorTile.coordinates.x != 4) {
                    thisFloorTile.coordinates.x = animationTile
                }
            }

            context.drawImage(framemg,								// image
                thisFloorTile.coordinates.x * tileSize, 				// x coordinate of image
                thisFloorTile.coordinates.y * tileSize,				// y coordinate of image
                tileSize,											// width of image
                tileSize,											// height of image
                positions.floorTiles[floorTile].x * tileSize + posx,	// destination x coordinate
                positions.floorTiles[floorTile].y * tileSize + posy,	// destination y coordinate
                tileSize,											// width of destination
                tileSize) 											// height of destination
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
        var cTime = new Date(positions.clock[frame]).getTime();
        if(bTime <= cTime && cTime - bTime < 200 && bmb.type === 2) {
        	if(typeof bmb.bombAnimation === 'undefined') {
        		bmb.bombAnimation = {
        			length: Math.round(positions[me].fps / 10),
        			frame: 0
        		}
        	}
        	
        	if(bmb.bombAnimation.frame < bmb.bombAnimation.length) {
        		bmb.bombAnimation.frame++
        		bombSize = 40 + (280 * (bmb.bombAnimation.frame / bmb.bombAnimation.length))
            	bombOpacity = 1 - bmb.bombAnimation.frame / bmb.bombAnimation.length
            	context.fillStyle = "#FF8000"
            	context.globalAlpha = bombOpacity
            	context.beginPath()
            	bombX = bmb.x + posx + tileSize / 2 //- context.canvas.width/2 + 60
            	bombY = bmb.y + posy + tileSize / 2 //- context.canvas.height/2 - 20
            	context.arc(bombX, bombY, Math.round(bombSize), 0, 2 * Math.PI, !0)
            	context.closePath()
            	context.fill()
            	context.globalAlpha = 1
            	context.fillStyle = "#ffffff"
            } 
        } else {
            delete bmb.bombAnimation;
        }
    })
}
        		

function ballCollision(positions, ball) {
    for (j in positions) {
        if (j.search('player') == 0 & j != ball) {
            if ((Math.abs(positions[j].x[frame - 1] - positions[ball].x[frame - 1]) < (45) & Math.abs(positions[j].y[frame - 1] - positions[ball].y[frame - 1]) < (45)) | (Math.abs(positions[j].x[frame] - positions[ball].x[frame]) < (45) & Math.abs(positions[j].y[frame] - positions[ball].y[frame]) < (45))) {
                return (true)
            }
        }
    }
    return (false)
}

function rollingBombPop(positions, ball) {
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j
        }
    }
    // determine if we need to start a rolling bomb animation: ball has no bomb now, but had bomb one frame ago
    if (!positions[ball].bomb[frame] & positions[ball].bomb[frame - 1] & ballCollision(positions, ball)) {
        positions[ball].rollingBombAnimation = {
            length: Math.round(positions[ball].fps / 10),
            frame: 0
        }
    }
    // if an animation should be in progress, draw it
    if (typeof positions[ball].rollingBombAnimation != 'undefined') {
        positions[ball].rollingBombAnimation.frame++
        rollingBombSize = 40 + (200 * (positions[ball].rollingBombAnimation.frame / positions[ball].rollingBombAnimation.length))
        rollingBombOpacity = 1 - positions[ball].rollingBombAnimation.frame / positions[ball].rollingBombAnimation.length

        context.fillStyle = "#FFFF00"
        context.globalAlpha = rollingBombOpacity
        context.beginPath()
        rollingBombX = positions[ball].x[frame] - positions[me].x[frame] + context.canvas.width / 2 //- tileSize/2
        rollingBombY = positions[ball].y[frame] - positions[me].y[frame] + context.canvas.height / 2  //- tileSize/2
        context.arc(rollingBombX, rollingBombY, Math.round(rollingBombSize), 0, 2 * Math.PI, !0)
        context.closePath()
        context.fill()
        context.globalAlpha = 1
        context.fillStyle = "#ffffff"
        if (positions[ball].rollingBombAnimation.frame >= positions[ball].rollingBombAnimation.length) {
            delete(positions[ball].rollingBombAnimation)
        }
    }
}

function ballPop(positions, ball) {
    if (ball.search('player') != 0) {
        return
    }

    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j
        }
    }
    // determine if we need to start a pop animation: ball is dead now, but was not dead one frame ago
    if (positions[ball].dead[frame] & !positions[ball].dead[frame - 1] & positions[ball].draw[frame - 1]) {
        positions[ball].popAnimation = {
            length: Math.round(positions[ball].fps / 10),
            frame: 0
        }
    }
    // if an animation should be in progress, draw it
    if (typeof positions[ball].popAnimation != 'undefined') {
        positions[ball].popAnimation.frame++
        popSize = 40 + (80 * (positions[ball].popAnimation.frame / positions[ball].popAnimation.length))
        popOpacity = 1 - positions[ball].popAnimation.frame / positions[ball].popAnimation.length

        context.globalAlpha = popOpacity
        context.drawImage(img,
            (positions[ball].team[frame] == 1 ? 14 : 15) * tileSize,
            0,
            tileSize,
            tileSize,
            positions[ball].x[frame] - positions[me].x[frame] + context.canvas.width / 2 - popSize / 2,
            positions[ball].y[frame] - positions[me].y[frame] + context.canvas.height / 2 - popSize / 2,
            popSize,
            popSize)
        context.globalAlpha = 1
        if (positions[ball].popAnimation.frame >= positions[ball].popAnimation.length) {
            delete(positions[ball].popAnimation)
        }
    }
}

function drawSplats(positions) {
    if (positions.splats) {
        for (splatI in positions.splats) {
            if (!positions.splats[splatI].img) {
                positions.splats[splatI].img = Math.floor(Math.random() * 7)
            }
            thisSplat = positions.splats[splatI]
            thisTime = new Date(positions.clock[frame]).getTime()
            thisSplatTime = new Date(thisSplat.time).getTime()
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

function drawSpawns(positions) {
    if (positions.spawns) {
        context.globalAlpha = .25
        for (spawnI in positions.spawns) {
            thisSpawn = positions.spawns[spawnI]
            thisTime = new Date(positions.clock[frame]).getTime()
            thisSpawnTime = new Date(thisSpawn.time).getTime()
            timeDiff = thisTime - thisSpawnTime // positive if spawn has already happened
            if (timeDiff >= 0 & timeDiff <= thisSpawn.w) {
                context.drawImage(img,
                    (thisSpawn.t == 1 ? 14 : 15) * tileSize,
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

function drawEndText(positions) {
    if (positions.end) {
        endTime = new Date(positions.end.time).getTime()
        thisTime = new Date(positions.clock[frame]).getTime()
        if (endTime <= thisTime) {
            positions.end.winner == 'red' ? endColor = "#ff0000" : positions.end.winner == 'blue' ? endColor = "#0000ff" : endColor = "#ffffff"
            switch(positions.end.winner) {
    			case 'red':
        			endText = "Red Wins!";
        			break;
    			case 'blue':
        			endText = "Blue Wins!";
        			break;
        		case 'tie':
        			endText = "It's a Tie!";
        			break;
    			default:
        			endText = positions.end.winner;
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

function drawBalls(positions) {
	spin = (localStorage.getItem('useSpin') == 'true' || readCookie('useSpin') == 'true') 

    // draw 'me'
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j
        }
    }
    // what team?
    if (typeof positions[me].team.length === 'undefined') {
        meTeam = positions[me].team
    } else {
        meTeam = positions[me].team[frame]
    }
    if (positions[me].dead[frame] == false) {
    
    	// draw own ball with or without spin
    	if(spin === false || typeof positions[me].angle === 'undefined') {
        	context.drawImage(img, 								// image
            	(meTeam == 1 ? 14 : 15) * tileSize,				 	// x coordinate of image
            	0,												// y coordinate of image
            	tileSize,										// width of image
            	tileSize,										// height of image
            	context.canvas.width / 2 - tileSize / 2,			// destination x coordinate
            	context.canvas.height / 2 - tileSize / 2,			// destination y coordinate
            	tileSize,										// width of destination
            	tileSize) 										// height of destination
        } else {
        	context.translate(context.canvas.width/2, context.canvas.height/2);
        	context.rotate(positions[me].angle[frame]);
        	context.drawImage(img,
        		(meTeam == 1 ? 14 : 15) * tileSize,	
        		0,
        		tileSize,
        		tileSize,
        		-20,
        		-20,
        		tileSize,
        		tileSize);
        	context.rotate(-positions[me].angle[frame]);
        	context.translate(-context.canvas.width/2, -context.canvas.height/2);		
        }

        drawPowerups(me, context.canvas.width / 2 - tileSize / 2, context.canvas.height / 2 - tileSize / 2, positions)
        drawFlag(me, context.canvas.width / 2 - tileSize / 2, context.canvas.height / 2 - tileSize / 2, positions)
        thisName = (typeof positions[me].name == 'string') ? positions[me].name : positions[me].name[frame]
        drawText(thisName,
            context.canvas.width / 2 - tileSize / 2 + 30,
            context.canvas.height / 2 - tileSize / 2 - 5,
            (typeof positions[me].auth != 'undefined') ? positions[me].auth[frame] : undefined,
            (typeof positions[me].degree != 'undefined') ? positions[me].degree[frame] : undefined)
        if (typeof positions[me].flair !== 'undefined') {
            drawFlair(positions[me].flair[frame],
                context.canvas.width / 2 - 16 / 2,
                context.canvas.height / 2 - tileSize / 2 - 17)
        }
    }
    ballPop(positions, me)
    rollingBombPop(positions, me)

    // draw other balls
    for (j in positions) {
        if (typeof positions[j].me != undefined & positions[j].me == 'other') {
            if (positions[j].dead[frame] == false) {
                if (positions[j].draw[frame] == true) {
                    if (frame == 0 || positions[j].draw[frame - 1] == true) {
                        if ((positions[j].dead[frame - 1] == true & positions[j].x[frame] != positions[j].x[frame - positions[j].fps]) | positions[j].dead[frame - 1] != true) {
                            // what team?
                            if (typeof positions[j].team.length === 'undefined') {
                                thisTeam = positions[j].team
                            } else {
                                thisTeam = positions[j].team[frame]
                            }
                            
                            // draw with or without spin
                            if(spin === false || typeof positions[j].angle === 'undefined') {
                            	context.drawImage(img,																		// image
                                	(thisTeam == 1 ? 14 : 15) * tileSize,														// x coordinate of image
                                	0,																						// y coordinate of image
                                	tileSize,																				// width of image
                                	tileSize,																				// height of image
                                	positions[j].x[frame] - positions[me].x[frame] + context.canvas.width / 2 - tileSize / 2,	// destination x coordinate
                                	positions[j].y[frame] - positions[me].y[frame] + context.canvas.height / 2 - tileSize / 2,	// destination y coordinate
                                	tileSize,																				// width of destination
                                	tileSize)																				// height of destination
                            } else {
                            	context.translate(positions[j].x[frame] - positions[me].x[frame] + context.canvas.width / 2, 
                            					  positions[j].y[frame] - positions[me].y[frame] + context.canvas.height / 2);
        						context.rotate(positions[j].angle[frame]);
        						context.drawImage(img,
        							(thisTeam == 1 ? 14 : 15) * tileSize,	
        							0,
        							tileSize,
        							tileSize,
        							-20,
        							-20,
        							tileSize,
        							tileSize);
        						context.rotate(-positions[j].angle[frame]);
        						context.translate(-(positions[j].x[frame] - positions[me].x[frame] + context.canvas.width / 2), 
                            					  -(positions[j].y[frame] - positions[me].y[frame] + context.canvas.height / 2));	
                            }

                            drawPowerups(j, positions[j].x[frame] - positions[me].x[frame] + context.canvas.width / 2 - tileSize / 2,
                                positions[j].y[frame] - positions[me].y[frame] + context.canvas.height / 2 - tileSize / 2, positions)
                            drawFlag(j, positions[j].x[frame] - positions[me].x[frame] + context.canvas.width / 2 - tileSize / 2,
                                positions[j].y[frame] - positions[me].y[frame] + context.canvas.height / 2 - tileSize / 2, positions)
                            thisName = (typeof positions[j].name === 'string') ? positions[j].name : positions[j].name[frame]
                            drawText(thisName,
                                positions[j].x[frame] - positions[me].x[frame] + context.canvas.width / 2 - tileSize / 2 + 30,
                                positions[j].y[frame] - positions[me].y[frame] + context.canvas.height / 2 - tileSize / 2 - 5,
                                (typeof positions[j].auth != 'undefined') ? positions[j].auth[frame] : undefined,
                                (typeof positions[j].degree != 'undefined') ? positions[j].degree[frame] : undefined)
                            if (typeof positions[j].flair !== 'undefined') {
                                drawFlair(positions[j].flair[frame],
                                    positions[j].x[frame] - positions[me].x[frame] + context.canvas.width / 2 - 16 / 2,
                                    positions[j].y[frame] - positions[me].y[frame] + context.canvas.height / 2 - tileSize / 2 - 20)
                            }
                            rollingBombPop(positions, j)
                        }
                    }
                }
            }
            ballPop(positions, j)
        }
    }
}

/**
 * Edit mapCanvas to reflect the replay at the given frame.
 * frame - frame of replay
 * positions - replay data
 * mapImg - html img element reflecting the image of the map
 */
animateReplay = function(frame_n, positions, mapImg, spin, showSplats, showClockAndScore, showChat) {
    frame = frame_n;
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j
        }
    }
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    posx = -(positions[me].x[frame] - context.canvas.width / 2 + tileSize / 2)
    posy = -(positions[me].y[frame] - context.canvas.height / 2 + tileSize / 2)
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


// Preview creation.
getPosData2 = function getPosData(dataFileName) {
    positionData = []
    var transaction = db.transaction(["positions"], "readonly");
    var store = transaction.objectStore("positions");
    var request = store.get(dataFileName);
    request.onsuccess = function () {
        hh=request.result
    }
}

// create two canvases - one to draw full size preview, one to draw the half size one.
fullPreviewCanvas = document.createElement('canvas');
fullPreviewCanvas.width = 1280;
fullPreviewCanvas.height = 800;
fullPreviewContext = fullPreviewCanvas.getContext('2d');

smallPreviewCanvas = document.createElement('canvas');
smallPreviewCanvas.width = fullPreviewCanvas.width / 2;
smallPreviewCanvas.height = fullPreviewCanvas.height / 2;
smallPreviewContext = smallPreviewCanvas.getContext('2d');

// function to draw stuff onto the canvas
function drawReplay(thisI, positions, mapImg, thisContext) {
  frame = thisI;
	tileSize = 40;
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j;
        }
    }
    context = thisContext;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    posx = -(positions[me].x[frame] - context.canvas.width / 2 + tileSize / 2)
    posy = -(positions[me].y[frame] - context.canvas.height / 2 + tileSize / 2)
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
drawPreview = function(positions) {
	$('#tiles')[0].src = defaultTextures.tiles
    $('#portal')[0].src = defaultTextures.portal
    $('#speedpad')[0].src = defaultTextures.speedpad
    $('#speedpadred')[0].src = defaultTextures.speedpadred
    $('#speedpadblue')[0].src = defaultTextures.speedpadblue
    $('#splats')[0].src = defaultTextures.splats
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
	return(result);
}

})();
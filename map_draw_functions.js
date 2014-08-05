function drawText(ballname, namex, namey) {
		context.textAlign = 'left'
		context.fillStyle="#ffffff"
		context.strokeStyle="#000000"
		context.shadowColor="#000000"
		context.shadowOffsetX=0
		context.shadowOffsetY=0
		context.lineWidth=2
		context.font="bold 8pt Arial"
		context.shadowBlur=10
		context.strokeText(ballname, namex, namey)
		context.shadowBlur=0
		context.fillText(ballname, namex, namey)
}

function drawPowerups(ball, ballx, bally, positions) {
		if(positions[ball].tagpro[thisI] == true) {
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
		if(positions[ball].bomb[thisI] == true) {
			if(thisI % (positions[ball].fps/6) == 0) {
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
		if(positions[ball].grip[thisI] == true) {
			context.drawImage(img,
							  12*tileSize,
							  4*tileSize,
							  tileSize,
							  tileSize,
							  ballx,
							  bally + 20,
							  tileSize/2,
							  tileSize/2)
		}
} 

function drawClock(positions) {
	if(new Date(positions.gameEndsAt).getTime() <= new Date(positions.clock[thisI]).getTime()) {
		curTimeMilli = new Date(positions.gameEndsAt).getTime() + 12*60*1000 - new Date(positions.clock[thisI]).getTime()
	} else {
		curTimeMilli = new Date(positions.gameEndsAt) - new Date(positions.clock[thisI])
	}
	minute = ('0'+Math.floor(curTimeMilli/1000/60)).slice(-2)
	seconds = ('0'+Math.round(curTimeMilli/1000 % 60)).slice(-2)
	seconds = (seconds == '60' ? '00':seconds)
	curTime = minute+':'+seconds
	context.fillStyle="rgba(255, 255, 255, 1)";
    context.strokeStyle="rgba(0, 0, 0, .75)";
	context.font="bold 30pt Arial";
	context.textAlign = 'center'
	context.lineWidth=4;
    context.strokeText(curTime,context.canvas.width/2,context.canvas.height-25);
    context.fillText(curTime,context.canvas.width/2,context.canvas.height-25);
}

function drawScore(positions) {
	thisScore = positions.score[thisI]
	context.textAlign="center"
    context.fillStyle="rgba(255, 0, 0, .5)"
    context.font="bold 40pt Arial"
	context.fillText(thisScore.r, context.canvas.width/2 - 120, context.canvas.height-50)
	context.fillStyle="rgba(0, 0, 255, .5)",
	context.fillText(thisScore.b, context.canvas.width/2 + 120, context.canvas.height-50)
}

function drawFlag(ball, ballx, bally, positions) {
		flagCodes = {
			1	: {x:14,	y:1},
			2	: {x:15,	y:1},
			3	: {x:13,	y:1}
		}
		if(positions[ball].flag[thisI] != null) {
			flagCoords = flagCodes[positions[ball].flag[thisI]]
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


function drawMap(posx, posy, positions) {
	newcan = document.createElement('canvas')
	newcan.id = 'newCanvas'
	document.body.appendChild(newcan)
	newcan = document.getElementById('newCanvas')
	newcan.width = positions.map.length*tileSize
	newcan.height = positions.map[0].length*tileSize
	newcan.style.zIndex = 200
	newcan.style.position = 'absolute'
	newcan.style.top = 0
	newcan.style.left = 0
	newcontext = newcan.getContext('2d')
	
	for(col in positions.tiles) {
		for(row in positions.tiles[col]) {
			if(positions.tiles[col][row].drawTileFirst) {
				tileSize = 40
				newcontext.drawImage(img, 										// image
						 		  13*tileSize, 									// x coordinate of image
						  		  4*tileSize,									// y coordinate of image
					  			  tileSize,										// width of image
					  			  tileSize,										// height of image
						  		  col*tileSize + posx,							// destination x coordinate
						  		  row*tileSize + posy,							// destination y coordinate
						  		  tileSize,										// width of destination
					  			  tileSize) 									// height of destination
			}
			if(positions.tiles[col][row].tile != 'wall') {
				if(positions.tiles[col][row].tile == 'diagonalWall') {
					tileSize = 40
				} else {
					tileSize = positions.tiles[col][row].tileSize
				}
				newcontext.drawImage(img, 											// image
						 		  positions.tiles[col][row].coordinates.x*tileSize, 		// x coordinate of image
						  		  positions.tiles[col][row].coordinates.y*tileSize,		// y coordinate of image
					  			  tileSize,										// width of image
					  			  tileSize,										// height of image
						  		  col*tileSize + posx,							// destination x coordinate
						  		  row*tileSize + posy,							// destination y coordinate
						  		  tileSize,										// width of destination
					  			  tileSize) 									// height of destination
			}
			if(positions.tiles[col][row].tile == 'wall' | positions.tiles[col][row].tile == 'diagonalWall') {
				thisTileSize = positions.tiles[col][row].tileSize
				for(quadrant in positions.tiles[col][row].coordinates) {
					offset = {}
					if(quadrant == 0) {
						offset.x = 0
						offset.y = 0
					} else if(quadrant == 1) {
						offset.x = thisTileSize
						offset.y = 0
					} else if(quadrant == 2) {
						offset.x = thisTileSize
						offset.y = thisTileSize
					} else if(quadrant == 3) {
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
						col*thisTileSize*2 + offset.x + posx,
						row*thisTileSize*2 + offset.y + posy,
						thisTileSize,
						thisTileSize)
				}
			} 				  
		}
	}
	return(newcontext.canvas.toDataURL())
} 

function drawFloorTiles(positions) {
	floorTileElements = {
				3		: {tile : "redflag",			coordinates : {x:14,	y:1},	tileSize:40,	tilesImg:"tiles"},
				3.1		: {tile : "redflagtaken",		coordinates : {x:14,	y:2},	tileSize:40,	tilesImg:"tiles"},
				4		: {tile : "blueflag",			coordinates : {x:15,	y:1},	tileSize:40,	tilesImg:"tiles"},
				4.1		: {tile : "blueflagtaken",		coordinates : {x:15,	y:2},	tileSize:40,	tilesImg:"tiles"},
				5		: {tile : "speedpad",			coordinates : {x:0,		y:0},	tileSize:40,	tilesImg:"speedpad"},
				5.1		: {tile : "emptyspeedpad",		coordinates : {x:4,		y:0},	tileSize:40,	tilesImg:"speedpad"},
				6		: {tile : "emptypowerup",		coordinates : {x:12,	y:8},	tileSize:40,	tilesImg:"tiles"},
				6.1		: {tile : "jukejuice",			coordinates : {x:12,	y:4},	tileSize:40,	tilesImg:"tiles"},
				6.2		: {tile : "rollingbomb",		coordinates : {x:12,	y:5},	tileSize:40,	tilesImg:"tiles"},
				6.3		: {tile : "tagpro",				coordinates : {x:12,	y:6},	tileSize:40,	tilesImg:"tiles"},
				6.4		: {tile : "speed",				coordinates : {x:12,	y:7},	tileSize:40,	tilesImg:"tiles"},
				9 		: {tile : "gate", 				coordinates : {x:12,	y:3},	tileSize:40,	tilesImg:"tiles"},
				9.1 	: {tile : "greengate", 			coordinates : {x:13,	y:3},	tileSize:40,	tilesImg:"tiles"},
				9.2 	: {tile : "redgate", 			coordinates : {x:14,	y:3},	tileSize:40,	tilesImg:"tiles"},
				9.3 	: {tile : "bluegate", 			coordinates : {x:15,	y:3},	tileSize:40,	tilesImg:"tiles"},
				10		: {tile : "bomb",				coordinates : {x:12,	y:1},	tileSize:40,	tilesImg:"tiles"},
				10.1	: {tile : "emptybomb",			coordinates : {x:12,	y:2},	tileSize:40,	tilesImg:"tiles"},
				13		: {tile : "portal",				coordinates : {x:0,		y:0},	tileSize:40,	tilesImg:"portal"},
				13.1	: {tile : "emptyportal",		coordinates : {x:4,		y:0},	tileSize:40,	tilesImg:"portal"},
				14		: {tile : "speedpadred",		coordinates : {x:0,		y:0},	tileSize:40,	tilesImg:"speedpadred"},
				14.1	: {tile : "emptyspeedpadred",	coordinates : {x:4,		y:0},	tileSize:40,	tilesImg:"speedpadred"},
				15		: {tile : "speedpadblue",		coordinates : {x:0,		y:0},	tileSize:40,	tilesImg:"speedpadblue"},
				15.1	: {tile : "emptyspeedpadblue",	coordinates : {x:4,		y:0},	tileSize:40,	tilesImg:"speedpadblue"},
				16		: {tile : "yellowflag",			coordinates : {x:13,	y:1},	tileSize:40,	tilesImg:"tiles"},
				16.1	: {tile : "yellowflagtaken",	coordinates : {x:13,	y:2},	tileSize:40,	tilesImg:"tiles"}
	}
	for(floorTile in positions.floorTiles) {
		mod = thisI % (positions[me].fps * 2/3)
		if(mod < 5) {
			animationTile = 0
		} else if(mod < 10) {
			animationTile = 1
		} else if(mod < 15) {
			animationTile = 2
		} else {
			animationTile = 3
		}
		
		thisFloorTile = floorTileElements[positions.floorTiles[floorTile].value[thisI]]
		if(typeof thisFloorTile === 'undefined') {
			return(null)
		} else {
			if(thisFloorTile.tilesImg == 'tiles') {
				thisImg = img
			} else if(thisFloorTile.tilesImg == 'speedpad') {
				thisImg = speedpadImg
				if(thisFloorTile.coordinates.x != 4) {
					thisFloorTile.coordinates.x = animationTile
				}
			} else if(thisFloorTile.tilesImg == 'portal') {
				thisImg = portalImg
				if(thisFloorTile.coordinates.x != 4) {
					thisFloorTile.coordinates.x = animationTile
				}
			} else if(thisFloorTile.tilesImg == 'speedpadred') {
				thisImg = speedpadredImg
				if(thisFloorTile.coordinates.x != 4) {
					thisFloorTile.coordinates.x = animationTile
				}
			} else if(thisFloorTile.tilesImg == 'speedpadblue') {
				thisImg = speedpadblueImg
				if(thisFloorTile.coordinates.x != 4) {
					thisFloorTile.coordinates.x = animationTile
				}
			}
		
			context.drawImage(thisImg,								// image
				thisFloorTile.coordinates.x*tileSize, 				// x coordinate of image
		    	thisFloorTile.coordinates.y*tileSize,				// y coordinate of image
				tileSize,											// width of image
				tileSize,											// height of image
				positions.floorTiles[floorTile].x*tileSize + posx,	// destination x coordinate
				positions.floorTiles[floorTile].y*tileSize + posy,	// destination y coordinate
				tileSize,											// width of destination
				tileSize) 											// height of destination
		}
	}
}
function drawBalls(positions) { 	
	// draw 'me'
	for(j in positions) {
		if(positions[j].me == 'me') {
			me = j
		}
	}
	if(positions[me].dead[thisI] == false) {
		context.drawImage(img, 								// image
			(positions[me].team == 1 ? 14:15)*tileSize, 	// x coordinate of image
	   		0,												// y coordinate of image
			tileSize,										// width of image
			tileSize,										// height of image
			context.canvas.width/2 - tileSize/2,			// destination x coordinate
			context.canvas.height/2 - tileSize/2,			// destination y coordinate
			tileSize,										// width of destination
			tileSize) 										// height of destination
		
		drawPowerups(me, context.canvas.width/2 - tileSize/2, context.canvas.height/2 - tileSize/2, positions)
		drawFlag(me, context.canvas.width/2 - tileSize/2, context.canvas.height/2 - tileSize/2, positions)	
		drawText(positions[me].name, 
				 context.canvas.width/2 - tileSize/2 + 30, 
				 context.canvas.height/2 - tileSize/2 - 5)
	}
	// draw other balls
	for(j in positions) { 
		if(positions[j].me=='other') {
			if(positions[j].dead[thisI] == false) {
				if(positions[j].draw[thisI] == true) {
					context.drawImage(img,																		// image
						(positions[j].team == 1 ? 14:15)*tileSize,												// x coordinate of image
						0,																						// y coordinate of image
						tileSize,																				// width of image
						tileSize,																				// height of image
						positions[j].x[thisI] - positions[me].x[thisI] + context.canvas.width/2 - tileSize/2,	// destination x coordinate
						positions[j].y[thisI] - positions[me].y[thisI] + context.canvas.height/2 - tileSize/2,	// destination y coordinate
						tileSize,																				// width of destination
						tileSize)																				// height of destination
					
					drawPowerups(j, positions[j].x[thisI] - positions[me].x[thisI] + context.canvas.width/2 - tileSize/2,
					             positions[j].y[thisI] - positions[me].y[thisI] + context.canvas.height/2 - tileSize/2, positions)
					drawFlag(j, positions[j].x[thisI] - positions[me].x[thisI] + context.canvas.width/2 - tileSize/2,
					    	 positions[j].y[thisI] - positions[me].y[thisI] + context.canvas.height/2 - tileSize/2, positions) 
					drawText(positions[j].name, 
							 positions[j].x[thisI] - positions[me].x[thisI] + context.canvas.width/2 - tileSize/2 + 30, 
						 	 positions[j].y[thisI] - positions[me].y[thisI] + context.canvas.height/2 - tileSize/2 - 5)
				}
			}
		}
	}
}

function animateReplay(thisI, positions, mapImg) {
	for(j in positions) {
		if(positions[j].me == 'me') {
			me = j
		}
	}
	context.clearRect(0,0,context.canvas.width, context.canvas.height)
	posx = -(positions[me].x[thisI] - context.canvas.width/2 + tileSize/2)
	posy = -(positions[me].y[thisI] - context.canvas.height/2 + tileSize/2)
	context.drawImage(mapImg, 0, 0, mapImg.width, mapImg.height, 
					  posx, 
					  posy,
					  mapImg.width, mapImg.height)
	drawFloorTiles(positions)
	drawBalls(positions)
	drawClock(positions)
	drawScore(positions)
}



////////////////////////////////////////////
//           Recording Section            //
////////////////////////////////////////////

function createZeroArray(N) {
  return(Array.apply(null, {length: N}).map(Number.call, function(){return(0)}))
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function recordReplayData() {
  var savingIndex = 0
  var fps = +readCookie('fps')
  var saveDuration = +readCookie('duration')
  
  // set up map data
  positions.map = tagpro.map
  positions.wallMap = tagpro.wallMap
  positions.floorTiles  = []
  positions.score = createZeroArray(saveDuration*fps)
  positions.gameEndsAt = tagpro.gameEndsAt
  positions.clock = createZeroArray(saveDuration*fps)
  decipheredData = decipherMapdata(positions.map, mapElements)
  positions.tiles = translateWallTiles(decipheredData, positions.wallMap, quadrantCoords)
  
  for(tilecol in positions.map) {
  	for(tilerow in positions.map[tilecol]) {
  		thisTile = positions.map[tilecol][tilerow]
  		if(thisTile >= 3 & thisTile < 7 | thisTile >= 9 & thisTile < 11 | thisTile >= 13 & thisTile < 17) {
  			positions.floorTiles.push({x:tilecol, y:tilerow, value:createZeroArray(saveDuration*fps)})
  		} 
  	}
  }

  // function to save game data
  saveGameData = function() {
    players=tagpro.players
    for(player in players) {
      if(!positions['player'+player]) {
        positions['player'+player] = {
                            x:createZeroArray(saveDuration*fps), 
                            y:createZeroArray(saveDuration*fps), 
                            name:players[player].name,
                            fps:fps,
                            team:players[player].team, // 1:red, 2:blue
                            map:$('#mapInfo').text().replace('Map: ','').replace(/ by.*/,''),
                            flag:createZeroArray(saveDuration*fps),
                            bomb:createZeroArray(saveDuration*fps),
                            grip:createZeroArray(saveDuration*fps),
                            tagpro:createZeroArray(saveDuration*fps),
                            dead:createZeroArray(saveDuration*fps),
                            draw:createZeroArray(saveDuration*fps),
                            me:(tagpro.viewPort.source.id == player ? 'me' : 'other'),
                            hasFlag:null
                          }
      }
      for(i in positions['player'+player]) {
        if($.isArray(positions['player'+player][i])) {
          positions['player'+player][i].shift()
          positions['player'+player][i].push(tagpro.players[player][i])
        }
      }
    }
    for(j in positions.floorTiles) {
    	positions.floorTiles[j].value.shift()
    	positions.floorTiles[j].value.push(tagpro.map[positions.floorTiles[j].x][positions.floorTiles[j].y])
    }  
    positions.clock.shift()
    positions.clock.push(new Date())
    positions.score.shift()
    positions.score.push(tagpro.score)
    //savingIndex++
  }
  
  thing = setInterval(saveGameData, 1000/fps)
}

//////////////////////////////////////////
/// Interpretation of wall and map data //
//////////////////////////////////////////

function decipherMapdata(mapData, mapElements) {
	result = []
	for(col in mapData) {
		result.push([])
		for(row in mapData[col]) {
			result[col].push({})
		}
	}
	
	for(col in mapData) {
		for(row in mapData[col]) {
			if(mapData[col][row] >= 1 & mapData[col][row] < 2) {
				if(mapData[col][row] > 1 & mapData[col][row] < 2) {
					result[col][row].tile = 'diagonalWall'
					result[col][row].coordinates = {0:{}, 1:{}, 2:{}, 3:{}}
					result[col][row].coordinates.x = 13
					result[col][row].coordinates.y = 4
				} else {
					result[col][row].tile = 'wall'
					result[col][row].coordinates = {0:{}, 1:{}, 2:{}, 3:{}}
				}
				result[col][row].tileSize = 20
			} else {
				result[col][row] = mapElements[mapData[col][row]]
			}
		}
	}
	return(result)
}

function translateWallTiles(decipheredData, wallData, quadrantCoords) {
	for(col in decipheredData) {
		for(row in decipheredData[col]) {
			if(decipheredData[col][row].tile == "wall" | decipheredData[col][row].tile == "diagonalWall") {
				decipheredData[col][row].coordinates[0] = quadrantCoords[wallData[col][row][0].toString().replace('1.','')]
				decipheredData[col][row].coordinates[1] = quadrantCoords[wallData[col][row][1].toString().replace('1.','')]
				decipheredData[col][row].coordinates[2] = quadrantCoords[wallData[col][row][2].toString().replace('1.','')]
				decipheredData[col][row].coordinates[3] = quadrantCoords[wallData[col][row][3].toString().replace('1.','')]
			}
		}
	}
	return(decipheredData)
}



// TL, TR, BR, BL
var quadrantCoords = {
	"0":	[15, 10],
	0:		[15, 10],
	// top left quadrants
	"100":	[6, 9],
	"100d":	[10, 10],		// diag, filled, bottom right edge
	"101":	[4, 5],
	"102":	[0, 7],
	"102d":	[0, 0],
	"103":	[9, 6],
	"103d":	[4, 1],			// diag, filled, bottom right edge, top left corner, top edge
	"104":	[1, 7],
	"104d":	[7, 5],
	"105":	[3, 10],
	"105d":	[2, 5],
	"106":	[8, 10],
	"106d":	[10, 4],
	"107":	[10, 7],
	"112":	[2, 0],
	"113":	[8, 0],
	"114":	[3, 6],			// diag, empty top right
	"115":	[3.5, 6.5], 		// diag, empty top right
	"116":	[2, 9], 			// diag, empty top right
	"131":	[6, 1],
	"132":	[10, 8],
	"141":	[3, 8],
	"142":	[10, 8], 
	"142d":	[1, 1],
	"143d":	[11, 4],
	"151":	[1, 10],			// diag, empty bottom left
	"152":	[4, 9], 
	"152d":	[3, 4],
	"161":	[4, 4],			// diag, empty bottom left
	"162":	[0, 5],
	"162d":	[0, 6],
	"163":	[10, 9],
	"163d":	[2, 1],
	"164":	[4, 10],
	"164d":	[2, 4],			// diag, filled, bottom right edge, top left corner
	"171":	[0, 2],
	"172":	[7, 8],
	"172d":	[3, 5],
	"173":	[8, 7],
	"173d":	[9, 3],			// diag, filled, bottom right edge, top left edge
	"174":	[9, 10],
	"174d":	[10, 5],		// diag, filled, bottom right edge, top left corner
	"176d":	[1, 2],
	// top right quadrants
	"200":	[5.5, 9],
	"200d":	[4.5, 4],		// diag, filled, bottom left edge
	"203":	[8.5, 6],
	"204":	[0.5, 7],
	"204d":	[4.5, 5],
	"205":	[2.5, 10],
	"205d":	[1.5, 5],
	"206":	[7.5, 10],
	"206d":	[9.5, 4],
	"207":	[9.5, 7],
	"213":	[7.5, 0], 
	"214":	[2.5, 6],
	"214d":	[7.5, 1],
	"215":	[3.5, 7],
	"215d":	[2.5, 3],
	"216":	[1.5, 9],
	"216d":	[9.5, 1],
	"220":	[1.5, 8],
	"220d":	[10.5, 1],
	"223":	[9.5, 0],
	"224":	[11.5, 7], 
	"224d":	[11.5, 0],
	"225":	[4.5, 8],
	"225d":	[8.5, 5],
	"226":	[11.5, 5],
	"226d":	[11.5, 6], 
	"227":	[7.5, 9],
	"227d":	[8.5, 4], 
	"230":	[8.5, 8],		// diag, empty bottom right
	"231":	[5.5, 1],		// diag, empty bottom right
	"232":	[5.5, 1],
	"234":	[7.5, 5],		// diag, empty bottom right
	"235":	[11.5, 2],
	"236":	[7.5, 4],		// diag, empty bottom right
	"237":	[10.5, 10],		// diag, empty bottom right
	"243":	[0.5, 8],
	"263":	[9.5, 9],
	"264":	[3.5, 10],
	"264d":	[1.5, 4],
	"273":	[7.5, 7],
	"274":	[8.5, 10],
	"274d":	[9.5, 5],
	"276":	[4.5, 9],
	// bottom right quadrants
	"300":	[5.5, 9.5],
	"300d":	[8, 7],
	"305":	[2.5, 9.5],		// diag, empty top right
	"306":	[7.5, 9.5],
	"306d":	[9.5, 3.5],
	"307d":	[2.5, 1.5],
	"315":	[2.5, 9.5], 		// diag, empty top right
	"316":	[1.5, 8.5],
	"316d":	[9.5, 0.5],
	"320":	[1.5, 7.5],
	"320d":	[10.5, 0.5],
	"325":	[4.5, 7.5], 		// diag, empty top right
	"326":	[11.5, 5.5],
	"326d":	[11.5, 4.5],
	"327":	[7.5, 8.5],
	"327d":	[8.5, 3.5],
	"330":	[8.5, 7.5], 
	"330d":	[10.5, 4.5], 
	"331":	[5.5, 6.5],
	"332d":	[9.5, 2.5],
	"335":	[11.5, 1.5],
	"336":	[7.5, 3.5],
	"336d":	[3.5, 4.5],
	"337":	[10.5, 9.5],
	"337d":	[9, 3],
	"340":	[2.5, 10.5],
	"340d":	[3.5, 2.5],
	"341":	[2.5, 7.5],
	"341d":	[7.5, 0.5],
	"342":	[9.5, 7.5],
	"342d":	[0.5, 0.5],
	"343":	[0.5, 7.5],
	"345":	[7.5, 6.5],
	"346":	[11.5, 7.5],
	"346d":	[2.5, 4.5],
	"347":	[9.5, 10.5],
	"347d":	[3.5, 1.5],
	"350":	[1.5, 10.5],
	"351":	[0.5, 9.5],		// diag, empty bottom left
	"352":	[3.5, 8.5],
	"356":	[8.5, 5.5],
	"357":	[9.5, 5.5],
	"376":	[7.5, 9.5],
	// bottom left quadrants
	"400":	[6, 9.5],
	"400d":	[2, 9.5], 		// diag, filled, top right edge
	"407":	[10, 6.5],
	"420":	[2, 7.5],
	"420d":	[11, 0.5],
	"427":	[8, 8.5],		// diag, empty bottom right
	"430":	[9, 7.5],
	"430d":	[4, 0.5],
	"431":	[6, 6.5],
	"432":	[10, 7.5],
	"437":	[11, 9.5],		// diag, empty bottom right 
	"440":	[3, 10.5],
	"440d":	[8, 2.5],
	"441":	[3, 7.5],
	"441d":	[8, 0.5],
	"442":	[10, 7.5],
	"442d":	[1, 0.5],		// diag, filled, top right edge, bottom left corner
	"443":	[1, 7.5],
	"447":	[10, 10.5],		// diag, empty bottom right 
	"450":	[2, 10.5],
	"450d":	[8, 1.5],
	"451":	[1, 9.5],
	"451d":	[5, 2.5],		// diag, filled, top right and bottom left edge
	"452":	[4, 8.5],
	"452d":	[1, 0.5],
	"457":	[10, 5.5],
	"460":	[0, 7.5],
	"460d":	[9, 4.5],
	"461":	[4, 3.5],
	"461d":	[4, 3.5],
	"462":	[0, 5.5],
	"462d":	[0, 4.5],
	"463":	[10, 8.5],
	"463d":	[2, 0.5],
	"464":	[4, 9.5],
	"464d":	[2, 3.5],
	"467":	[3, 5.5],
	"470":	[7, 0.5],
	"471":	[0, 1.5], 
	"472":	[7, 7.5],
	"473":	[5, 0.5],
	"474":	[9, 9.5],
	"476":	[5, 8.5]
  };


mapElements = {
				0 		: {tile : "blank", 				coordinates : {x:15,	y:10},	tileSize:40,	drawTileFirst:false},
				2 		: {tile : "tile",  				coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				3 		: {tile : "redflag", 			coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				3.1		: {tile : "regflagtaken", 		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				4 		: {tile : "blueflag", 			coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				4.1		: {tile : "blueflagtaken", 		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				5		: {tile : "speedpad", 			coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				5.1		: {tile : "emptyspeedpad",		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				6		: {tile : "emptypowerup", 		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				6.1		: {tile : "jukejuice", 			coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				6.2		: {tile : "rollingbomb", 		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				6.3		: {tile : "tagpro", 			coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				6.4		: {tile : "speed", 				coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				7		: {tile : "spike", 				coordinates : {x:12,	y:0},	tileSize:40,	drawTileFirst:true},
				8		: {tile : "button", 			coordinates : {x:13,	y:6},	tileSize:40,	drawTileFirst:true},
				9 		: {tile : "gate", 				coordinates : {x:12,	y:3},	tileSize:40,	drawTileFirst:false},
				9.1 	: {tile : "greengate", 			coordinates : {x:13,	y:3},	tileSize:40,	drawTileFirst:false},
				9.2 	: {tile : "redgate", 			coordinates : {x:14,	y:3},	tileSize:40,	drawTileFirst:false},
				9.3 	: {tile : "bluegate", 			coordinates : {x:15,	y:3},	tileSize:40,	drawTileFirst:false},
				10		: {tile : "bomb", 				coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				10.1	: {tile : "emptybomb", 			coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				11		: {tile : "redtile", 			coordinates : {x:14,	y:4},	tileSize:40,	drawTileFirst:false},
				12		: {tile : "bluetile", 			coordinates : {x:15,	y:4},	tileSize:40,	drawTileFirst:false},
				13		: {tile : "portal",				coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				13.1	: {tile : "emptyportal",		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				14		: {tile : "speedpadred",		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				14.1	: {tile : "emptyspeedpadred",	coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				15		: {tile : "speedpadblue",		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				15.1	: {tile : "emptyspeedpadblue",	coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				16		: {tile : "yellowflag", 		coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				16.1	: {tile : "yellowflagtaken", 	coordinates : {x:13,	y:4},	tileSize:40,	drawTileFirst:false},
				17		: {tile : "redgoal", 			coordinates : {x:14,	y:5},	tileSize:40,	drawTileFirst:false},
				18		: {tile : "bluegoal", 			coordinates : {x:15,	y:5},	tileSize:40,	drawTileFirst:false}
}




function emit(event, data){
   var e = new CustomEvent(event, {detail: data});
   window.dispatchEvent(e);
}

// send position data to content script
function saveReplayData(positions) {
  var data = JSON.stringify(positions)
  console.log('sending position data from injected script to content script.')
  emit('setPositionData', data)
}

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function(e){
      listener(e.detail);
    });
}

listen('positionDataConfirmation', function () {
	console.log('got message confirming data save')
	$(savedFeedback).fadeIn(300)
  	$(savedFeedback).fadeOut(900)
})



// function to add button to record replay data
function recordButton() {
  var recordButton = document.createElement("img")
  recordButton.id = 'recordButton'
  recordButton.src = 'http://i.imgur.com/oS1bPqR.png'
  recordButton.onclick=function(){saveReplayData(positions)}
  recordButton.style.position="absolute"
  recordButton.style.margin="auto"
  recordButton.style.right="30px"
  recordButton.style.top="65px"
  recordButton.style.cursor="pointer"
  $('body').append(recordButton)
  
  var savedFeedback = document.createElement('a')
  savedFeedback.id = 'savedFeedback'
  savedFeedback.textContent = 'Saved!'
  savedFeedback.style.right='20px'
  savedFeedback.style.top='100px'
  savedFeedback.style.position="absolute"
  savedFeedback.style.color='#00CC00'
  savedFeedback.style.fontSize='20px'
  savedFeedback.style.fontWeight='bold'
  $('body').append(savedFeedback)
  $(savedFeedback).hide()
}

if(readCookie('record') != 'false') {
	var positions = {}
	recordButton()
	setTimeout(recordReplayData, 3000)
}


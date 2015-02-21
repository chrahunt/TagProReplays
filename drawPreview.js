

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
thisI = 0;

// function to draw stuff onto the canvas
function drawReplay(thisI, positions, mapImg, thisContext) {
	tileSize = 40;
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j;
        }
    }
    context = thisContext;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    posx = -(positions[me].x[thisI] - context.canvas.width / 2 + tileSize / 2)
    posy = -(positions[me].y[thisI] - context.canvas.height / 2 + tileSize / 2)
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
function drawPreview(positions) {
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
	
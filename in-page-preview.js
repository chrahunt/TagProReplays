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


// function for assigning texture sources
//   it first checks if the cookie to use custom textures is true
//   if it is, it checks if a saved custom texture exists
//   if so, use that. if not, use default
function assignTexture(imgElement, textureName) {
	if(readCookie('useTextures') == 'true') {
		if(typeof localStorage.getItem(textureName) !== "undefined" & localStorage.getItem(textureName) !== null) {
			imgElement.src = localStorage.getItem(textureName);
		} else {
			imgElement.src = 'images/'+textureName+'.png';
		}
	} else {
		imgElement.src = 'images/'+textureName+'.png';
	}
}

// Create and display UI for in-browser preview.
function createReplay(positions) {
    // Initialize values
    thisI = 0
    // Get player that corresponds to recording user ball.
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j
        }
    }
    tileSize = 40

    // Canvas for main display
    can = document.createElement('canvas')
    can.id = 'mapCanvas'
    can.style.background = 'black'
    can.style.border = "10px solid white"
    can.width = 30 * tileSize
    can.height = 18 * tileSize
    can.style.zIndex = 1200
    can.style.position = 'absolute'
    can.style.top = (window.innerHeight - can.height - 20) / 2 + 'px'
    can.style.left = (window.innerWidth - can.width - 20) / 2 + 'px'
    can.style.display = 'block'
    can.style.transition = "opacity 0.5s linear"
    can.style.opacity = 0
    can.title = "replay: " + sessionStorage.getItem('currentReplay').replace(/DATE.*/, '')

    document.body.appendChild(can)
    can = document.getElementById('mapCanvas')
    context = can.getContext('2d')

    imgDiv = document.createElement('div')

    img = new Image()
    assignTexture(img, 'tiles');
    img.id = 'tiles'
    img.style.display = 'none'
    img = document.body.appendChild(img)
    // Get map image and draw initial replay image
    img.onload = function () {
        mapImgData = drawMap(0, 0, positions)
        mapImg = new Image()
        mapImg.src = mapImgData
        imgDiv.appendChild(mapImg)
        mapImg.onload = function () {
        	var useSpin = readCookie('useSpin') == 'true';
    		var useSplats = readCookie('useSplats') == 'true';
    		var useClockAndScore = readCookie('useClockAndScore') == 'true';
    		var useChat = readCookie('useChat') == 'true';
            animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
        }
    }

    portalImg = new Image()
    assignTexture(portalImg, 'portal');
    portalImg.id = 'portal'
    imgDiv.appendChild(portalImg)

    speedpadImg = new Image()
    assignTexture(speedpadImg, 'speedpad');
    speedpadImg.id = 'speedpad'
    speedpadImg = imgDiv.appendChild(speedpadImg)

    speedpadredImg = new Image()
    assignTexture(speedpadredImg, 'speedpadred');
    speedpadredImg.id = 'speedpadred'
    speedpadredImg = imgDiv.appendChild(speedpadredImg)

    speedpadblueImg = new Image()
    assignTexture(speedpadblueImg, 'speedpadblue');
    speedpadblueImg.id = 'speedpadblue'
    speedpadblueImg = imgDiv.appendChild(speedpadblueImg)

    splatsImg = new Image()
    assignTexture(splatsImg, 'splats');
    splatsImg.id = 'splats'
    splatsImg = imgDiv.appendChild(splatsImg)

    flairImg = new Image()
    flairImg.src = 'images/flair.png'
    flairImg.id = 'flair'
    flairImg = imgDiv.appendChild(flairImg)

    tagproImg = new Image()
    tagproImg.src = 'http://i.imgur.com/N11aYYg.png'
    tagproImg.id = 'tagpro'
    tagproImg = imgDiv.appendChild(tagproImg)

    rollingbombImg = new Image()
    rollingbombImg.src = 'http://i.imgur.com/kIkEHPK.png'
    rollingbombImg.id = 'rollingbomb'
    rollingbombImg = imgDiv.appendChild(rollingbombImg)

    ////////////////////////////////
    /////     Playback bar     /////
    ////////////////////////////////

    // create area to hold buttons and slider bar

    playbackBarDiv = document.createElement('div')
    playbackBarDiv.style.position = 'absolute'
    playbackBarDiv.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
    playbackBarDiv.style.left = can.style.left
    playbackBarDiv.style.width = can.width + 20 + 'px'
    playbackBarDiv.style.height = '90px'
    playbackBarDiv.style.transition = "opacity 0.25s linear"
    playbackBarDiv.style.zIndex = 1300
    playbackBarDiv.id = 'playbackBarDiv'
    playbackBarDiv.style.backgroundColor = 'black'
    document.body.appendChild(playbackBarDiv)

    // create white bar showing area that will be cropped
    whiteBar = document.createElement('div')
    whiteBar.style.position = 'absolute'
    whiteBar.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
    whiteBar.style.left = can.style.left
    whiteBar.style.width = can.width + 20 + 'px'
    whiteBar.style.height = '20px'
    whiteBar.style.transition = "opacity 0.25s linear"
    whiteBar.style.zIndex = 1300
    whiteBar.id = 'whiteBar'
    whiteBar.style.backgroundColor = 'white'
    document.body.appendChild(whiteBar)

    // create grey bar showing area that will be kept
    greyBar = document.createElement('div')
    greyBar.style.position = 'absolute'
    greyBar.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
    greyBar.style.left = can.style.left
    greyBar.style.width = can.width + 20 + 'px'
    greyBar.style.height = '20px'
    greyBar.style.transition = "opacity 0.25s linear"
    greyBar.style.zIndex = 1300
    greyBar.id = 'greyBar'
    greyBar.style.backgroundColor = 'grey'
    document.body.appendChild(greyBar)

    // create slider bar to hold slider
    sliderBar = document.createElement('div')
    sliderBar.style.position = 'absolute'
    sliderBar.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
    sliderBar.style.left = can.style.left
    sliderBar.style.width = can.width + 20 + 'px'
    sliderBar.style.height = '20px'
    sliderBar.style.transition = "opacity 0.25s linear"
    sliderBar.style.zIndex = 1300
    sliderBar.id = 'sliderBar'
    sliderBar.style.backgroundColor = 'transparent'
    document.body.appendChild(sliderBar)

    // create slider

    $('#sliderBar').append('<input type="range" id="slider">')
    slider = document.getElementById('slider')
    slider.style.width = $('#sliderBar')[0].style.width
    slider.style.transition = "opacity 0.25s linear"
    slider.style.zIndex = 1300
    slider.value = 0
    slider.min = 0
    slider.max = positions.clock.length - 1
    slider.onmousedown = function () {
        pauseReplay()
    }
    slider.onchange = function () {
        thisI = this.value
        var useSpin = readCookie('useSpin') == 'true';
    	var useSplats = readCookie('useSplats') == 'true';
    	var useClockAndScore = readCookie('useClockAndScore') == 'true';
    	var useChat = readCookie('useChat') == 'true';
        animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
    }

    function clearSliderArea() {
        $('#playbackBarDiv')[0].style.opacity = "0"
        $('#sliderBar')[0].style.opacity = "0"
        $('#slider')[0].style.opacity = "0"
        $('#greyBar')[0].style.opacity = "0"
        $('#whiteBar')[0].style.opacity = "0"
        setTimeout(function () {
            $('#playbackBarDiv').remove()
            $('#sliderBar').remove()
            $('#slider').remove()
            $('#greyBar').remove()
            $('#whiteBar').remove()
        }, 600)
    }


    ////////////////////////////////////
    /////     Playback buttons     /////
    ////////////////////////////////////

    // Start replay animation.
    function updateMap(mapImg) {
    	var time = Date.now();
    	var startTime = time;
    	var useSpin = readCookie('useSpin') == 'true';
    	var useSplats = readCookie('useSplats') == 'true';
    	var useClockAndScore = readCookie('useClockAndScore') == 'true';
    	var useChat = readCookie('useChat') == 'true';
    	var fps = positions[me].fps;
        thingy = setInterval(function () {
            if (thisI >= positions.clock.length - 1) {
                clearInterval(thingy);
            }
            animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
            dt = Date.now() - time;
        	time = Date.now();
        	var nFramesToAdvance = Math.round( dt / (1000 / fps) );
            thisI = +thisI + nFramesToAdvance;
            slider.value = thisI;
        }, 1000 / fps)
    }

    // functions to show, hide, and remove buttons
    function showButtons() {
        var buttons = {
            pause: pauseButton,
            play: playButton,
            stop: stopButton,
            reset: resetButton
        }
        for (button in buttons) {
            buttons[button].style.opacity = "1.0"
            buttons[button].style.cursor = "pointer"
        }
    }

    function hideButtons() {
        var buttons = {
            pause: pauseButton,
            play: playButton,
            stop: stopButton,
            reset: resetButton,
            cStart: cropStartButton,
            cEnd: cropEndButton,
            cButt: cropButton,
            pCrop: playCroppedMovieButton,
            cRButt: cropAndReplaceButton,
            dButt: deleteButton,
            rButt: renderButton,
            reButt: renameButton
        }
        for (button in buttons) {
            buttons[button].style.opacity = "0"
        }
    }

    function removeButtons() {
        var buttons = {
            pause: pauseButton,
            play: playButton,
            stop: stopButton,
            reset: resetButton,
            cStart: cropStartButton,
            cEnd: cropEndButton,
            cButt: cropButton,
            pCrop: playCroppedMovieButton,
            cRButt: cropAndReplaceButton,
            dButt: deleteButton,
            rButt: renderButton,
            reButt: renameButton
        }
        for (button in buttons) {
            buttons[button].remove()
        }
    }

    // functions to control replay playback
    function resetReplay() {
    	var useSpin = readCookie('useSpin') == 'true';
    	var useSplats = readCookie('useSplats') == 'true';
    	var useClockAndScore = readCookie('useClockAndScore') == 'true';
    	var useChat = readCookie('useChat') == 'true';
        thisI = 0
        if(typeof thingy !== 'undefined') clearInterval(thingy)
        animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
        slider.value = 0
        delete(thingy)
        isPlaying = false
        showButtons()
    }

    function stopReplay(doNotReopen) {
        thisI = 0
        if (typeof thingy !== 'undefined') {
            clearInterval(thingy)
            delete(thingy)
            isPlaying = false
        }
        clearSliderArea()
        if (!doNotReopen) {
            //openReplayMenu()
            $('#menuContainer').show();
        }
        hideButtons()
        can.style.opacity = 0
        setTimeout(function () {
            imgDiv.remove()
            removeButtons()
            can.remove()
            newcan.remove()
            img.remove()
            delete(mapImg)
        }, 600)
    }

    function playReplay() {
        if (typeof thingy === 'undefined') {
            updateMap(mapImg)
            isPlaying = true
            //hideButtons()
        }
    }

    function pauseReplay() {
        if (thingy) {
            clearInterval(thingy)
        }
        delete(thingy)
        isPlaying = false
        showButtons()
    }


    // cropping functions
    function setCropStart() {
        currentCropStart = +$('#slider')[0].value / +$('#slider')[0].max
        greyBarStart = currentCropStart * $('#whiteBar').width() + +$('#whiteBar')[0].style.left.replace('px', '')
        if (typeof currentCropEnd !== 'undefined') {
            if (currentCropStart >= currentCropEnd) {
                delete currentCropEnd
            }
        }
        $('#greyBar')[0].style.left = greyBarStart + 'px'
        if (typeof currentCropEnd !== 'undefined') {
            greyBarEnd = currentCropEnd * $('#whiteBar').width() + +$('#whiteBar')[0].style.left.replace('px', '')
            $('#greyBar').width(greyBarEnd - greyBarStart) + 'px'
        } else {
            $('#greyBar').width(($('#whiteBar').width() + +$('#whiteBar')[0].style.left.replace('px', '')) - greyBarStart) + 'px'
        }
    }

    function setCropEnd() {
        currentCropEnd = +$('#slider')[0].value / +$('#slider')[0].max
        greyBarEnd = currentCropEnd * $('#whiteBar').width()
        if (typeof currentCropStart !== 'undefined') {
            if (currentCropEnd <= currentCropStart) {
                delete currentCropStart
            }
        }
        if (typeof currentCropStart !== 'undefined') {
            greyBarStart = currentCropStart * $('#whiteBar').width() + +$('#whiteBar')[0].style.left.replace('px', '')
            $('#greyBar')[0].style.left = greyBarStart + 'px'
            $('#greyBar').width(greyBarEnd - greyBarStart + +$('#whiteBar')[0].style.left.replace('px', '')) + 'px'
        } else {
            $('#greyBar')[0].style.left = $('#whiteBar')[0].style.left
            $('#greyBar').width(greyBarEnd) + 'px'
        }
    }

    function playCroppedMovie() {
    	var useSpin = readCookie('useSpin') == 'true';
    	var useSplats = readCookie('useSplats') == 'true';
    	var useClockAndScore = readCookie('useClockAndScore') == 'true';
		var useChat = readCookie('useChat') == 'true';
        if (typeof thingy === 'undefined') {
            if (typeof currentCropStart === 'undefined') {
                if (typeof currentCropEnd === 'undefined') {
                    // just play the whole movie from the beginning
                    thisI = 0
                    if (typeof thingy === 'undefined') {
                        playReplay()
                    }
                } else {
                    // play only up until the crop end point
                    thisI = 0
                    endI = Math.floor(currentCropEnd * (positions.clock.length - 1))
                    thingy = setInterval(function () {
                        if (thisI == endI) {
                            clearInterval(thingy)
                            delete(thingy)
                        }
                        animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
                        thisI++
                        slider.value = thisI
                    }, 1000 / positions[me].fps)
                }
            } else {
                if (typeof currentCropEnd === 'undefined') {
                    // play from crop start point until the end
                    thisI = Math.floor(currentCropStart * (positions.clock.length - 1))
                    thingy = setInterval(function () {
                        if (thisI == positions.clock.length - 1) {
                            clearInterval(thingy)
                            delete(thingy)
                        }
                        animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
                        thisI++
                        slider.value = thisI
                    }, 1000 / positions[me].fps)
                } else {
                    // play in between crop start point and crop end point
                    thisI = Math.floor(currentCropStart * (positions.clock.length - 1))
                    endI = Math.floor(currentCropEnd * (positions.clock.length - 1))
                    console.log(thisI)
                    thingy = setInterval(function () {
                        if (thisI == endI) {
                            clearInterval(thingy)
                            delete(thingy)
                        }
                        animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
                        thisI++
                        slider.value = thisI
                    }, 1000 / positions[me].fps)
                }
            }
        }
    }

    // this function actually crops the position data
    function cropPositionData(positionDAT, cropStart, cropEnd) {
        popFromEnd = positionDAT.clock.length - cropEnd - 1
        shiftFromStart = cropStart
        // first crop from the front
        for (cropI = 0; cropI < shiftFromStart; cropI++) {
            for (positionStat in positionDAT) {
                if (positionStat.search('player') == 0) {
                    for (playerStat in positionDAT[positionStat]) {
                        if ($.isArray(positionDAT[positionStat][playerStat])) {
                            positionDAT[positionStat][playerStat].shift()
                        }
                    }
                }
            }
            for (cropFloorTile in positionDAT.floorTiles) {
                positionDAT.floorTiles[cropFloorTile].value.shift()
            }
            positionDAT.clock.shift()
            positionDAT.score.shift()
        }
        // now crop from the back
        for (cropI = 0; cropI < popFromEnd; cropI++) {
            for (positionStat in positionDAT) {
                if (positionStat.search('player') == 0) {
                    for (playerStat in positionDAT[positionStat]) {
                        if ($.isArray(positionDAT[positionStat][playerStat])) {
                            positionDAT[positionStat][playerStat].pop()
                        }
                    }
                }
            }
            for (cropFloorTile in positionDAT.floorTiles) {
                positionDAT.floorTiles[cropFloorTile].value.pop()
            }
            positionDAT.clock.pop()
            positionDAT.score.pop()
        }
        return (positionDAT)
    }

    // delete, render, and rename functions

    // delete this replay
    deleteThisReplay = function () {
        replayToDelete = sessionStorage.getItem('currentReplay')
        if (replayToDelete != null) {
            if (confirm('Are you sure you want to delete this replay?')) {
                stopReplay(false)
                setTimeout(function(){
                	console.log('requesting to delete ' + replayToDelete)
                	chrome.runtime.sendMessage({
                    	method: 'requestDataDelete',
                    	fileName: replayToDelete
                	});
                }, 500);
            }
        }
    }

    // render this replay
    renderThisReplay = function () {
        replayToRender = sessionStorage.getItem('currentReplay')
        if (replayToRender != null) {
            if (confirm('Are you sure you want to render this replay?')) {
                stopReplay(false)
                setTimeout(function () {
                    console.log('requesting to render ' + replayToRender)
                    chrome.runtime.sendMessage({
                        method: 'renderAllInitial',
                        data: [replayToRender],
                        useTextures: readCookie('useTextures'),
                        useSplats: readCookie('useSplats'),
                        useSpin: readCookie('useSpin'),
                        useClockAndScore: readCookie('useClockAndScore'),
                        useChat: readCookie('useChat'),
                        canvasWidth: readCookie('canvasWidth') || 1280,
                        canvasHeight: readCookie('canvasHeight') || 800
                    });
                }, 1000)
            }
        }
    }

    // rename this replay
    renameThisReplay = function () {
        replayToRename = sessionStorage.getItem('currentReplay')
        if (replayToRename != null) {
            datePortion = replayToRename.replace(/.*DATE/, '').replace('replays', '')
            newName = prompt('How would you like to rename ' + replayToRename.replace(/DATE.*/, '') + '?')
            if (newName != null) {
                stopReplay(false)
                newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '') + "DATE" + datePortion
                console.log('requesting to rename from ' + replayToRename + ' to ' + newName)
                chrome.runtime.sendMessage({
                    method: 'requestFileRename',
                    oldName: replayToRename,
                    newName: newName
                });
            }
        }
    }


    // playback control buttons
    buttonURLs = {
        'stop': 'http://i.imgur.com/G32WYvH.png',
        'play': 'http://i.imgur.com/KvSKqpI.png',
        'pause': 'http://i.imgur.com/aSpd4cK.png',
        'forward': 'http://i.imgur.com/TVtAO69.png',
        'reset': 'http://i.imgur.com/vs3jWpc.png'
    }

    // stop button
    stopButton = new Image()
    stopButton.id = 'stopButton'
    stopButton.src = buttonURLs['stop']
    stopButton.onclick = function () {
        stopReplay(false)
    }
    //stopButton.onmouseover = showButtons
    //stopButton.onmouseleave = function() {if(isPlaying) hideButtons()}
    stopButton.style.position = "absolute"
    stopButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
    stopButton.style.left = +can.style.left.replace('px', '') + 20 + 'px'
    stopButton.style.transition = "opacity 0.25s linear"
    stopButton.style.zIndex = 1300
    stopButton.style.opacity = 0
    document.body.appendChild(stopButton)

    // reset button
    var resetButton = new Image()
    resetButton.id = 'resetButton'
    resetButton.src = buttonURLs['reset']
    resetButton.onclick = resetReplay
    //resetButton.onmouseover = showButtons
    //resetButton.onmouseleave = function() {if(isPlaying) hideButtons()}
    resetButton.style.position = "absolute"
    resetButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
    resetButton.style.left = +can.style.left.replace('px', '') + 80 + 'px'
    resetButton.style.transition = "opacity 0.25s linear"
    resetButton.style.zIndex = 1300
    resetButton.style.opacity = 0
    document.body.appendChild(resetButton)

    // play button
    var playButton = new Image()
    playButton.id = 'playButton'
    playButton.src = buttonURLs['play']
    playButton.onclick = playReplay
    //playButton.onmouseover = showButtons
    //playButton.onmouseleave = function() {if(isPlaying) hideButtons()}
    playButton.style.position = "absolute"
    playButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
    playButton.style.left = +can.style.left.replace('px', '') + 140 + 'px'
    playButton.style.transition = "opacity 0.25s linear"
    playButton.style.zIndex = 1300
    playButton.style.opacity = 0
    document.body.appendChild(playButton)

    // pause button
    var pauseButton = new Image()
    pauseButton.id = 'pauseButton'
    pauseButton.src = buttonURLs['pause']
    pauseButton.onclick = pauseReplay
    //pauseButton.onmouseover = showButtons
    //pauseButton.onmouseleave = function() {if(isPlaying) hideButtons()}
    pauseButton.style.position = "absolute"
    pauseButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
    pauseButton.style.left = +can.style.left.replace('px', '') + 200 + 'px'
    pauseButton.style.transition = "opacity 0.25s linear"
    pauseButton.style.zIndex = 1300
    pauseButton.style.opacity = 0
    document.body.appendChild(pauseButton)

    // crop start button
    $('#pauseButton').after('<button id="cropStartButton">Crop Start')
    cropStartButton = document.getElementById('cropStartButton')
    cropStartButton.style.position = 'absolute'
    cropStartButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    cropStartButton.style.left = +pauseButton.style.left.replace('px', '') + 70 + 'px'
    cropStartButton.style.height = '40px'
    cropStartButton.style.fontSize = '20px'
    cropStartButton.style.fontWeight = 'bold'
    cropStartButton.style.transition = "opacity 0.25s linear"
    cropStartButton.style.zIndex = 1300
    cropStartButton.style.cursor = "pointer"
    cropStartButton.onclick = setCropStart
    cropStartButton.title = 'This sets the beginning of the cropped portion of the replay. Everything before this point will be erased when you crop the replay.'

    // crop End button
    $('#cropStartButton').after('<button id="cropEndButton">Crop End')
    cropEndButton = document.getElementById('cropEndButton')
    cropEndButton.style.position = 'absolute'
    cropEndButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    cropEndButton.style.left = +cropStartButton.style.left.replace('px', '') + $('#cropStartButton').width() + 20 + 'px'
    cropEndButton.style.height = '40px'
    cropEndButton.style.fontSize = '20px'
    cropEndButton.style.fontWeight = 'bold'
    cropEndButton.style.transition = "opacity 0.25s linear"
    cropEndButton.style.zIndex = 1300
    cropEndButton.style.cursor = "pointer"
    cropEndButton.onclick = setCropEnd
    cropEndButton.title = 'This sets the end of the cropped portion of the replay. Everything after this point will be erased when you crop the replay.'

    // play cropped movie button
    $('#cropEndButton').after('<button id="playCroppedMovieButton">Play Cropped')
    playCroppedMovieButton = document.getElementById('playCroppedMovieButton')
    playCroppedMovieButton.style.position = 'absolute'
    playCroppedMovieButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    playCroppedMovieButton.style.left = +cropEndButton.style.left.replace('px', '') + $('#cropEndButton').width() + 20 + 'px'
    playCroppedMovieButton.style.height = '40px'
    playCroppedMovieButton.style.fontSize = '20px'
    playCroppedMovieButton.style.fontWeight = 'bold'
    playCroppedMovieButton.style.transition = "opacity 0.25s linear"
    playCroppedMovieButton.style.zIndex = 1300
    playCroppedMovieButton.style.cursor = "pointer"
    playCroppedMovieButton.onclick = playCroppedMovie
    playCroppedMovieButton.title = 'This plays the section of the replay between the "crop start" and "crop end" so you know what your cropped replay will look like.'

    // crop button
    $('#playCroppedMovieButton').after('<button id="cropButton">Crop')
    cropButton = document.getElementById('cropButton')
    cropButton.style.position = 'absolute'
    cropButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    cropButton.style.left = +playCroppedMovieButton.style.left.replace('px', '') + $('#playCroppedMovieButton').width() + 20 + 'px'
    cropButton.style.height = '40px'
    cropButton.style.fontSize = '20px'
    cropButton.style.fontWeight = 'bold'
    cropButton.style.transition = "opacity 0.25s linear"
    cropButton.style.zIndex = 1300
    cropButton.style.cursor = "pointer"
    cropButton.onclick = function () {
        cropStart = typeof currentCropStart === 'undefined' ? 0 : Math.floor(currentCropStart * (positions.clock.length - 1))
        cropEnd = typeof currentCropEnd === 'undefined' ? positions.clock.length - 1 : Math.floor(currentCropEnd * (positions.clock.length - 1))
        positions2 = cropPositionData(positions, cropStart, cropEnd)
        var newName = prompt('If you would also like to name the new cropped replay, type the new name here. Leave it blank to make a generic name.');
        if(newName === null) return;
        if(newName === '') {
        	newName = 'replays' + Date.now();
        } else {
        	newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '');
        	newName += 'DATE' + Date.now();
        }
        stopReplay(false)
        chrome.runtime.sendMessage({
        	method: 'setPositionData', 
        	positionData: JSON.stringify(positions2),
        	newName: newName
        })
        delete currentCropStart
        delete currentCropEnd
    }
    cropButton.title = 'This actually crops the replay. It leaves the original replay intact, though, and saves a new cropped replay.'

    // crop and replace button
    $('#cropButton').after('<button id="cropAndReplaceButton">Crop and Replace')
    cropAndReplaceButton = document.getElementById('cropAndReplaceButton')
    cropAndReplaceButton.style.position = 'absolute'
    cropAndReplaceButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    cropAndReplaceButton.style.left = +cropButton.style.left.replace('px', '') + $('#cropButton').width() + 20 + 'px'
    cropAndReplaceButton.style.height = '40px'
    cropAndReplaceButton.style.fontSize = '20px'
    cropAndReplaceButton.style.fontWeight = 'bold'
    cropAndReplaceButton.style.transition = "opacity 0.25s linear"
    cropAndReplaceButton.style.zIndex = 1300
    cropAndReplaceButton.style.cursor = "pointer"
    cropAndReplaceButton.onclick = function () {
        cropStart = typeof currentCropStart === 'undefined' ? 0 : Math.floor(currentCropStart * (positions.clock.length - 1))
        cropEnd = typeof currentCropEnd === 'undefined' ? positions.clock.length - 1 : Math.floor(currentCropEnd * (positions.clock.length - 1))
        positions2 = cropPositionData(positions, cropStart, cropEnd)
        var newName = prompt('If you would also like to rename this replay, type the new name here. Leave it blank to keep the old name.');
        if(newName === null) return;
        if(newName === '') {
        	var oldName = localStorage.getItem('currentReplayName');
        	newName = localStorage.getItem('currentReplayName');
        	var replaceName = false;
        } else {
        	var oldName = localStorage.getItem('currentReplayName');
        	newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '')
        	newName += 'DATE' + oldName.replace(/^replays/, '').replace(/.*DATE/, '');
        	var replaceName = true;
        }
        stopReplay(false)
        chrome.runtime.sendMessage({
            method: 'setPositionData',
            positionData: JSON.stringify(positions2),
            newName: newName,
            oldName: oldName
        })
        delete currentCropStart
        delete currentCropEnd
    }
    cropAndReplaceButton.title = 'This also actually crops the replay, but it replaces the original replay with the cropped one.'

    // delete button
    $('#cropAndReplaceButton').after('<button id="deleteButton">Delete')
    deleteButton = document.getElementById('deleteButton')
    deleteButton.style.position = 'absolute'
    deleteButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    deleteButton.style.left = +cropAndReplaceButton.style.left.replace('px', '') + $('#cropAndReplaceButton').width() + 20 + 'px'
    deleteButton.style.height = '40px'
    deleteButton.style.fontSize = '20px'
    deleteButton.style.fontWeight = 'bold'
    deleteButton.style.transition = "opacity 0.25s linear"
    deleteButton.style.zIndex = 1300
    deleteButton.style.cursor = "pointer"
    deleteButton.onclick = deleteThisReplay;
    deleteButton.title = 'This deletes the current replay.'

    // render button
    $('#deleteButton').after('<button id="renderButton">Render')
    renderButton = document.getElementById('renderButton')
    renderButton.style.position = 'absolute'
    renderButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    renderButton.style.left = +deleteButton.style.left.replace('px', '') + $('#deleteButton').width() + 20 + 'px'
    renderButton.style.height = '40px'
    renderButton.style.fontSize = '20px'
    renderButton.style.fontWeight = 'bold'
    renderButton.style.transition = "opacity 0.25s linear"
    renderButton.style.zIndex = 1300
    renderButton.style.cursor = "pointer"
    renderButton.onclick = renderThisReplay
    renderButton.title = 'This renders the current replay.'

    // rename button
    $('#renderButton').after('<button id="renameButton">Rename')
    renameButton = document.getElementById('renameButton')
    renameButton.style.position = 'absolute'
    renameButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
    renameButton.style.left = +renderButton.style.left.replace('px', '') + $('#renderButton').width() + 20 + 'px'
    renameButton.style.height = '40px'
    renameButton.style.fontSize = '20px'
    renameButton.style.fontWeight = 'bold'
    renameButton.style.transition = "opacity 0.25s linear"
    renameButton.style.zIndex = 1300
    renameButton.style.cursor = "pointer"
    renameButton.onclick = renameThisReplay
    renameButton.title = 'This renames the current replay.'


    // because of the way the play button works, must ensure 'thingy' is undefined first
    delete(thingy)
    // define variable that stores play state
    isPlaying = false

    can.style.opacity = 1
    showButtons()
}

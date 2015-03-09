
(function(window) {


/**
 * This resizes the div container for the in-browswer preview viewer based on the size of teh window.
 * No return value.
 */
resizeViewerContainer = function() {
    if($(window).width() > 1280) {
        $('#viewer-container').width(1280);
        $('#viewer-container').css('left', $(window).width()/2 - $('#viewer-container').width()/2);
    } else {
        $('#viewer-container').width('100%');
        $('#viewer-container').css('left', 0);
    }
    if($(window).height() > (800/0.9)) {
        $('#viewer-container').height(800/0.9);
        $('#viewer-container').css('top', $(window).height()/2 - $('#viewer-container').height()/2);
    } else {
        $('#viewer-container').height('100%');
        $('#viewer-container').css('top', 0);
    }
    $('#viewer-canvas')[0].height = $('#viewer-container').height() * 0.90 - 20;
    $('#viewer-canvas')[0].width = $('#viewer-container').width() - 20;
    $('#viewer-canvas').height($('#viewer-canvas')[0].height);
    $('#viewer-canvas').width($('#viewer-canvas')[0].width);
};

/**
 * This resizes buttons for the in-browser preview viewer based on the size of the window.
 * No return value.
 */
resizeButtons = function() {
    var IMGWIDTH          = 57,
        BUTTONWIDTH       = 90,
        widthFactor       = $('#viewer-container').width() / 1280,
        heightFactor      = $('#viewer-container').height() / (800/0.9),
        IMGWIDTHFACTOR    = IMGWIDTH / 1280, 
        BUTTONWIDTHFACTOR = BUTTONWIDTH / 1280,
        IMGHEIGHTFACTOR   = IMGWIDTH / (800/0.9);

    if ( widthFactor >= heightFactor ) {
        $('#viewer-container img').height(IMGHEIGHTFACTOR * heightFactor * (800/0.9));
        $('#viewer-container img').width('auto');
    } else {
        $('#viewer-container img').width(IMGWIDTHFACTOR * widthFactor * 1280);
        $('#viewer-container img').height('auto');
    }
    $('#viewer-container button').width(BUTTONWIDTHFACTOR * Math.pow($('#viewer-container').width(), 0.99));
};

/**
 * Hides the viewer container div.
 * No return value.
 */
hideViewer = function() {
    $('#viewer-container').fadeOut(500);
    $('#grey-bar').width('100%');
    $('#grey-bar').css('left', 0);
    $('#slider')[0].value = 0;
    delete currentCropStart;
    delete currentCropEnd;
};

/**
 * Shows the viewer container div if it is hidden.
 * No return value.
 */
showViewer = function() {
    $('#viewer-container').fadeIn(500);
};



/**
 * Function for reading a cookie. TODO: replace cookies with chrome.storage.local
 * @param  {string} name [name of the cookie to read]
 * No return value.
 */
function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}


/*
Create container div for replay viewer, inject html. CSS is injected in 'TagProReplays.js'.
 */
$('article').append('<div id="viewerContainer">');
var url2 = chrome.extension.getURL("ui/viewer.html");

// Retrieve html of viewer.
$('#viewerContainer').load(url2, function() {
    hideViewer();
});

/**
 * Function to set up an in-browser preview based on the provided positions object.
 * @param  {object} positions - replay positions raw file object
 * No return value.
 */
window.createReplay = function(positions) {

    /*
    Resize the viewer container according to window size.
     */
    resizeViewerContainer();
    setTimeout(resizeButtons, 2000);
    window.onresize=function() {
        resizeViewerContainer();
        resizeButtons();
    };

    // Initialize values
    var thisI = 0,
        whiteBar = $('#slider-bar'),
        greyBar = $('#grey-bar');

    // Get player that corresponds to recording user ball.
    for (var j in positions) {
        if (positions[j].me == 'me') {
            var me = j;
        }
    }
    tileSize = 40;

    // Canvas for main display
    var can     = document.getElementById('viewer-canvas');
    can.title   = "replay: " + sessionStorage.getItem('currentReplay').replace(/DATE.*/, '');
    var context = can.getContext('2d');



    // Holds options and textures for this replay preview.
    var options, textures, mapImg;

    // Get options and textures.
    chrome.storage.local.get(["options", "textures", "default_textures"], function(items) {
        function render() {
            // Get map image and draw initial replay image
            var mapImgData = drawMap(positions, textures.tiles);
            mapImg = new Image();
            mapImg.onload = function () {
                animateReplay(thisI, positions, mapImg, options, textures, context);
            };
            mapImg.src = mapImgData;
        }
        options = items.options;
        if (!options.custom_textures) {
            getTextureImages(items.default_textures, function(textureImages) {
                textures = textureImages;
                render();
            });
        } else {
            getTextureImages(items.textures, function(textureImages) {
                textures = textureImages;
                render();
            });
        }
    });
    

    ////////////////////////////////////
    /////     Playback buttons     /////
    ////////////////////////////////////

    // Start replay animation.
    function updateMap(mapImg) {
        var time = Date.now();
        var startTime = time;
        var fps = positions[me].fps;
        thingy = setInterval(function () {
            if (thisI >= positions.clock.length - 1) {
                clearInterval(thingy);
            }
            animateReplay(thisI, positions, mapImg, options, textures, context);
            dt = Date.now() - time;
            time = Date.now();
            var nFramesToAdvance = Math.round( dt / (1000 / fps) );
            thisI = +thisI + nFramesToAdvance;
            slider.value = thisI;
        }, 1000 / fps);
    }

    //////////////////////////////////////////
    // functions to control replay playback //
    //////////////////////////////////////////
    
    function resetReplay() {
        thisI = 0;
        if(typeof thingy !== 'undefined') clearInterval(thingy);
        animateReplay(thisI, positions, mapImg, options, textures, context);
        slider.value = 0;
        delete(thingy);
        isPlaying = false;
    }

    function stopReplay(doNotReopen) {
        thisI = 0;
        if (typeof thingy !== 'undefined') {
            clearInterval(thingy);
            delete(thingy);
            isPlaying = false;
        }
        if (!doNotReopen) {
            $('#menuContainer').show();
        }

        hideViewer();
    }

    function playReplay() {
        if (typeof thingy === 'undefined') {
            updateMap(mapImg);
            isPlaying = true;
        }
    }

    function pauseReplay() {
        if (typeof thingy !== 'undefined') {
            clearInterval(thingy);
        }
        delete(thingy);
        isPlaying = false;
    }


    ////////////////////////
    // cropping functions //
    ////////////////////////
    
    function setCropStart() {
        currentCropStart = +slider.value / +slider.max;
        greyBarStart = currentCropStart * whiteBar.width() + (+whiteBar.css('left').replace('px', ''));
        if (typeof currentCropEnd !== 'undefined') {
            if (currentCropStart >= currentCropEnd) {
                delete currentCropEnd;
            }
        }
        greyBar.css('left', greyBarStart + 'px');
        if (typeof currentCropEnd !== 'undefined') {
            greyBarEnd = currentCropEnd * whiteBar.width() + (+whiteBar.css('left').replace('px', ''));
            greyBar.width(greyBarEnd - greyBarStart);
        } else {
            greyBar.width((whiteBar.width() + (+whiteBar.css('left').replace('px', '')) - greyBarStart));
        }
    }

    function setCropEnd() {
        currentCropEnd = +slider.value / +slider.max;
        greyBarEnd = currentCropEnd * whiteBar.width();
        if (typeof currentCropStart !== 'undefined') {
            if (currentCropEnd <= currentCropStart) {
                delete currentCropStart;
            }
        }
        if (typeof currentCropStart !== 'undefined') {
            greyBarStart = currentCropStart * whiteBar.width() + (+whiteBar.css('left').replace('px', ''));
            greyBar.css('left', greyBarStart);
            greyBar.width(greyBarEnd - greyBarStart + (+whiteBar.css('left').replace('px', '')));
        } else {
            greyBar.css('left', whiteBar.css('left'));
            greyBar.width(greyBarEnd);
        }
    }

    function playCroppedMovie() {
        if (typeof thingy === 'undefined') {
            var missingStart = (typeof currentCropStart === 'undefined');
            var missingEnd = (typeof currentCropEnd === 'undefined');
            if (missingStart && missingEnd) {
                // just play the whole movie from the beginning
                thisI = 0;
                if (typeof thingy === 'undefined') {
                    playReplay();
                }
            } else {
                // Set start.
                if (missingStart) {
                    thisI = 0;
                } else {
                    thisI = Math.floor(currentCropStart * (positions.clock.length - 1));
                }
                // Set end.
                if (missingEnd) {
                    endI = positions.clock.length - 1;
                } else {
                    endI = Math.floor(currentCropEnd * (positions.clock.length - 1));
                }
                time = Date.now();
                var fps = positions[me].fps;
                thingy = setInterval(function () {
                    if (thisI >= endI) {
                        clearInterval(thingy);
                        delete(thingy);
                    }
                    animateReplay(thisI, positions, mapImg, options, textures, context);
                    dt = Date.now() - time;
                    time = Date.now();
                    var nFramesToAdvance = Math.round( dt / (1000 / fps) );
                    thisI = +thisI + nFramesToAdvance;
                    slider.value = thisI;
                }, 1000 / fps);
            }
        }
    }

    // this function actually crops the position data
    function cropPositionData(positionDAT, cropStart, cropEnd) {
        popFromEnd = positionDAT.clock.length - cropEnd - 1;
        shiftFromStart = cropStart;
        // first crop from the front
        for (cropI = 0; cropI < shiftFromStart; cropI++) {
            for (var positionStat in positionDAT) {
                if (positionStat.search('player') === 0) {
                    for (var playerStat in positionDAT[positionStat]) {
                        if ($.isArray(positionDAT[positionStat][playerStat])) {
                            positionDAT[positionStat][playerStat].shift();
                        }
                    }
                }
            }
            for (var cropFloorTile in positionDAT.floorTiles) {
                positionDAT.floorTiles[cropFloorTile].value.shift();
            }
            positionDAT.clock.shift();
            positionDAT.score.shift();
        }
        // now crop from the back
        for (cropI = 0; cropI < popFromEnd; cropI++) {
            for (var positionStatBack in positionDAT) {
                if (positionStatBack.search('player') === 0) {
                    for (var playerStatBack in positionDAT[positionStatBack]) {
                        if ($.isArray(positionDAT[positionStatBack][playerStatBack])) {
                            positionDAT[positionStatBack][playerStatBack].pop();
                        }
                    }
                }
            }
            for (var cropFloorTileBack in positionDAT.floorTiles) {
                positionDAT.floorTiles[cropFloorTileBack].value.pop();
            }
            positionDAT.clock.pop();
            positionDAT.score.pop();
        }
        return (positionDAT);
    }

    /**
     * Actually crops the replay using cropPositionData(). Sends a message to the background script to save the new cropped movie.
     * Uses:
     *     currentCropStart - global variable representing at which frame the cropped movie should start. If this is not set
     *         then it is assumed to be 0.
     *     currentCropEnd   - global variable representing at which frame the cropped movie should end. If this is not set
     *         then it is assumed to be the end of the replay.
     * No return value.
     */
    function cropReplay() {
        cropStart = typeof currentCropStart === 'undefined' ? 0 : Math.floor(currentCropStart * (positions.clock.length - 1));
        cropEnd = typeof currentCropEnd === 'undefined' ? positions.clock.length - 1 : Math.floor(currentCropEnd * (positions.clock.length - 1));
        var positions2 = cropPositionData(positions, cropStart, cropEnd);
        var newName = prompt('If you would also like to name the new cropped replay, type the new name here. Leave it blank to make a generic name.');
        // Cancelled window.
        if(newName === null) return;
        // Generate generic name if blank.
        if(newName === '') {
            newName = 'replays' + Date.now();
        } else {
            // Append the date generated if not blank.
            newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '');
            newName += 'DATE' + Date.now();
        }
        stopReplay(false);
        chrome.runtime.sendMessage({
            method: 'saveReplay', 
            data: JSON.stringify(positions2),
            name: newName
        }, function(response) {
            // TODO: Handle successful saving.
            if (!response.failed) {
                // Indicate operation completed.
            }
        });
        delete currentCropStart;
        delete currentCropEnd;
    }

    /**
     * Actually crops the replay using cropPositionData(). Sends a message to the background script to save the new cropped movie, replacing the original.
     * Uses:
     *     currentCropStart - global variable representing at which frame the cropped movie should start. If this is not set
     *         then it is assumed to be 0.
     *     currentCropEnd   - global variable representing at which frame the cropped movie should end. If this is not set
     *         then it is assumed to be the end of the replay.
     * No return value.
     */
    function cropAndReplaceReplay() {
        cropStart = typeof currentCropStart === 'undefined' ? 0 : Math.floor(currentCropStart * (positions.clock.length - 1));
        cropEnd = typeof currentCropEnd === 'undefined' ? positions.clock.length - 1 : Math.floor(currentCropEnd * (positions.clock.length - 1));
        positions2 = cropPositionData(positions, cropStart, cropEnd);
        var newName = prompt('If you would also like to rename this replay, type the new name here. Leave it blank to keep the old name.');
        // Return if cancelled.
        if(newName === null) return;
        // Generate 
        if(newName === '') {
            var oldName = localStorage.getItem('currentReplayName');
            newName = localStorage.getItem('currentReplayName');
        } else {
            var oldName = localStorage.getItem('currentReplayName');
            newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '');
            newName += 'DATE' + oldName.replace(/^replays/, '').replace(/.*DATE/, '');
        }
        stopReplay(false);
        chrome.runtime.sendMessage({
            method: 'replaceReplay',
            positionData: JSON.stringify(positions2),
            newName: newName,
            oldName: oldName
        });
        delete currentCropStart;
        delete currentCropEnd;
    }

    //////////////////////////////////////////
    // delete, render, and rename functions //
    //////////////////////////////////////////

    // delete this replay
    deleteThisReplay = function () {
        replayToDelete = sessionStorage.getItem('currentReplay');
        if (replayToDelete !== null) {
            if (confirm('Are you sure you want to delete this replay?')) {
                stopReplay(false);
                setTimeout(function(){
                    console.log('requesting to delete ' + replayToDelete);
                    chrome.runtime.sendMessage({
                        method: 'requestDataDelete',
                        fileName: replayToDelete
                    });
                }, 500);
            }
        }
    };

    // render this replay
    renderThisReplay = function () {
        var replayToRender = sessionStorage.getItem('currentReplay');
        if (replayToRender !== null) {
            if (confirm('Are you sure you want to render this replay?')) {
                stopReplay(false);
                setTimeout(function () {
                    console.log('requesting to render ' + replayToRender);
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
                }, 1000);
            }
        }
    };

    // rename this replay
    renameThisReplay = function () {
        var replayToRename = sessionStorage.getItem('currentReplay');
        if (replayToRename !== null) {
            datePortion = replayToRename.replace(/.*DATE/, '').replace('replays', '');
            var newName = prompt('How would you like to rename ' + replayToRename.replace(/DATE.*/, '') + '?');
            if (newName !== null) {
                stopReplay(false);
                newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '') + "DATE" + datePortion;
                console.log('requesting to rename from ' + replayToRename + ' to ' + newName);
                chrome.runtime.sendMessage({
                    method: 'renameReplay',
                    id: replayToRename,
                    name: newName
                });
            }
        }
    };



    /////////////////////////////////////////////
    // set up handlers for the various buttons //
    /////////////////////////////////////////////
    
    // slider
    var slider = document.getElementById('slider');
    slider.max = positions.clock.length - 1;
    slider.onmousedown = function () {
        pauseReplay();
    };
    slider.onchange = function () {
        thisI = this.value;
        animateReplay(thisI, positions, mapImg, options, textures, context);
    };

    // stop button
    var stopButton = document.getElementById('viewerStopButton');
    stopButton.onclick = function () {
        stopReplay(false);
    };

    // reset button
    var resetButton = document.getElementById('viewerResetButton');
    resetButton.onclick = resetReplay;

    // play button
    var playButton = document.getElementById('viewerPlayButton');
    playButton.onclick = playReplay;

    // pause button
    var pauseButton = document.getElementById('viewerPauseButton');
    pauseButton.onclick = pauseReplay;

    // crop start button
    var cropStartButton = document.getElementById('viewerCropStartButton');
    cropStartButton.onclick = setCropStart;

    // crop End button
    var cropEndButton = document.getElementById('viewerCropEndButton');
    cropEndButton.onclick = setCropEnd;
    
    // play cropped movie button
    var playCroppedMovieButton = document.getElementById('viewerPlayCroppedMovieButton');
    playCroppedMovieButton.onclick = playCroppedMovie;
    
    // crop button
    var cropButton = document.getElementById('viewerCropButton');
    cropButton.onclick = cropReplay;
    
    // crop and replace button
    var cropAndReplaceButton = document.getElementById('viewerCropAndReplaceButton');
    cropAndReplaceButton.onclick = cropAndReplaceReplay;
    
    // delete button
    var deleteButton = document.getElementById('viewerDeleteButton');
    deleteButton.onclick = deleteThisReplay;

    // render button
    var renderButton = document.getElementById('viewerRenderButton');
    renderButton.onclick = renderThisReplay;

    // rename button
    var renameButton = document.getElementById('viewerRenameButton');
    renameButton.onclick = renameThisReplay;

    // because of the way the play button works, must ensure 'thingy' is undefined first
    delete thingy;
    // define variable that stores play state
    isPlaying = false;

    // display the viewer container
    showViewer();
};

})(window);
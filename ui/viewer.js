/**
 * Code to support the in-page replay viewer. This file is included as
 * a content script.
 */
(function(window) {

// Handle the interaction with the viewer for a replay.
var Viewer = function() {
    $('article').append('<div id="viewer-container">');
    var url = chrome.extension.getURL("ui/viewer.html");
    $("#viewer-container").load(url, function() {
        $("#viewer-container").hide();
        this.init();
    }.bind(this));
};

window.Viewer = Viewer;

// Initialize the viewer.
Viewer.prototype.init = function() {
    this.canvas = document.getElementById('viewer-canvas');
    this.context = this.canvas.getContext('2d');
    this.frame = 0;
    this.playing = false;
    this.playInterval = null;
    this.cropping = false;

    // Adjust viewer dimensions on window resize.
    window.onresize = this.resize;
};

// Adjust viewer dimensions based on window size.
Viewer.prototype.resize = function() {
    // Resize container.
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

    // Resize buttons.
    var IMGWIDTH          = 57,
        BUTTONWIDTH       = 90,
        widthFactor       = $('#viewer-container').width() / 1280,
        heightFactor      = $('#viewer-container').height() / (800/0.9),
        IMGWIDTHFACTOR    = IMGWIDTH / 1280, 
        BUTTONWIDTHFACTOR = BUTTONWIDTH / 1280,
        IMGHEIGHTFACTOR   = IMGWIDTH / (800/0.9);

    $('#viewer-container button').width(BUTTONWIDTHFACTOR * Math.pow($('#viewer-container').width(), 0.99));
    if ( widthFactor >= heightFactor ) {
        $('#viewer-container img').height(IMGHEIGHTFACTOR * heightFactor * (800/0.9));
        $('#viewer-container img').width('auto');
        $('#button-bar button').css('font-size', $('#button-bar button').height()/2.5);
    } else {
        $('#viewer-container img').width(IMGWIDTHFACTOR * widthFactor * 1280);
        $('#viewer-container img').height('auto');
        $('#button-bar button').css('font-size', $('#button-bar button').width()/5);
    }
};

// Initialize viewer to work with replay that has provided id.
Viewer.prototype.preview = function(id) {
    // Show viewer.
    this.show();
    // TODO: Show loading spinner.
    this.id = id;
    // Get replay data.
    console.log('Requesting data for replay ' + this.id + ".");
    chrome.runtime.sendMessage({
        method: 'getReplay',
        id: this.id
    }, function(response) {
        this.replay = response.data;
        console.log('Data received for replay ' + this.id + ".");
        this.replayInit();
    }.bind(this));
};

// Display the viewer.
Viewer.prototype.show = function() {
    $("#viewer-container").fadeIn(500);
    this.resize();
};

// Hide the viewer.
Viewer.prototype.hide = function() {
    $("#viewer-container").fadeOut(500);
    $("#menuContainer").fadeIn(500);
};

// Initialize the viewer after retrieving the replay data.
Viewer.prototype.replayInit = function() {
    var viewer = this;
    this.canvas.title = "Replay: " + this.replay.info.name;
    this.frames = this.replay.data.time.length - 1;
    // Set listeners.
    // TODO: Ensure this doesn't cause problems if the slider is updated programmatically.
    $("#time-slider").slider({
        min: 0,
        max: this.frames,
        value: 0,
        slide: function() {
            viewer.frame = $("#time-slider").slider("value");
            viewer.drawFrame();
        },
        change: function() {
            viewer.frame = $("#time-slider").slider("value");
            viewer.drawFrame();
        }
    });

    $("#crop-slider").slider({
        range: true,
        min: 0,
        max: this.frames,
        values: [0, this.frames]
    });

    $("#viewerStopButton").click(function() {
        viewer.close();
    });

    $("#viewerResetButton").click(function() {
        viewer.reset();
        viewer.drawFrame();
    });

    $("#viewerPlayButton").click(function() {
        viewer.play(viewer.frame, viewer.frames);
    });

    $("#viewerPauseButton").click(function() {
        viewer.pause();
    });

    $("#viewerCropStartButton").click(function() {
        var cropRange = $("#crop-slider").slider("values");
        var newStart = $("#time-slider").slider("value");
        var newRange = [newStart];
        if (newStart >= cropRange[1]) {
            newRange.push(viewer.frames);
        }
        $("#crop-slider").slider('values', newRange);
    });

    $("#viewerCropEndButton").click(function() {
        var cropRange = $("#crop-slider").slider("values");
        var newEnd = $("#time-slider").slider("value");
        var newRange = [newEnd];
        if (newEnd <= cropRange[0]) {
            newRange.unshift(0);
        }
        $("#crop-slider").slider('values', newRange);
    });

    $("#viewerPlayCroppedMovieButton").click(function() {
        var range = $("#crop-slider").slider("values");
        viewer.play(range[0], range[1]);
    });
    
    // Crop replay data and save as a new replay.
    $("#viewerCropButton").click(function() {
        var newName = prompt('If you would also like to name the new' +
            ' cropped replay, type the new name here. Leave it blank ' +
            'to make a generic name.');
        // Cancelled operation.
        if (newName === null) return;
        var range = $("#crop-slider").slider("values");
        var msg = {
            id: viewer.id,
            start: range[0],
            end: range[1]
        };
        if (newName !== '') {
            msg.name = newName;
        }
        // TODO: Handle error with replay cropping, or refresh
        // previewer with cropped replay.
        sendMessage("cropReplay", msg);
    });

    $("#viewerCropAndReplaceButton").click(function() {
        var newName = prompt('If you would also like to rename this ' +
            'replay, type the new name here. Leave it blank to use ' +
            'the old name.');
        // Cancelled operation.
        if (newName === null) return;
        var range = $("#crop-slider").slider("values");
        var msg = {
            id: viewer.id,
            start: range[0],
            end: range[1]
        };
        if (newName !== '') {
            msg.name = newName;
        }
        // TODO: Handle error with replay cropping, or refresh
        // previewer with cropped replay.
        sendMessage("cropAndReplaceReplay", msg);
    });

    $("#viewerDeleteButton").click(function() {
        if (confirm('Are you sure you want to delete this replay?')) {
            viewer.close();
            console.log('Requesting deletion of replay ' + viewer.id + '.');
            chrome.runtime.sendMessage({
                method: 'deleteReplay',
                id: viewer.id
            });
        }
    });

    $("#viewerRenderButton").click(function() {
        if (confirm('Are you sure you want to render this replay?')) {
            viewer.close();
            console.log('Requesting render of replay ' + viewer.id + '.');
            chrome.runtime.sendMessage({
                method: 'renderReplay',
                id: viewer.id
            });
        }
    });

    $("#viewerRenameButton").click(function() {
        // TODO: Handle blank rename value.
        var newName = prompt('How would you like to rename ' + viewer.replay.info.name + '?');
        if (newName !== null) {
            console.log('Requesting rename from ' + viewer.replay.info.name + ' to ' + newName + '.');
            chrome.runtime.sendMessage({
                method: 'renameReplay',
                id: viewer.id,
                name: newName
            });
        }
    });

    // TODO: Show previewer with loading spinner.
    // Get options and textures.
    chrome.storage.local.get(["options", "textures", "default_textures"], function(items) {
        function onTextureLoad(textureImages) {
            viewer.textures = textureImages;
            viewer.initReplay();
        }

        viewer.options = items.options;
        if (!viewer.options.custom_textures) {
            getTextureImages(items.default_textures, onTextureLoad);
        } else {
            getTextureImages(items.textures, onTextureLoad);
        }
    });
};

// Initialize replay after everything has been loaded.
Viewer.prototype.initReplay = function() {
    // TODO: Replace loading spinner.
    var mapImgData = drawMap(this.replay, this.textures.tiles);
    this.background = new Image();
    this.background.onload = function () {
        this.drawFrame();
    }.bind(this);
    this.background.src = mapImgData;
};

/**
 * Set frame to value.
 */
Viewer.prototype.setFrame = function(frame) {
    this.frame = frame;
    $("#time-slider").slider("value", frame);
};

// Draws the current frame.
Viewer.prototype.drawFrame = function() {
    animateReplay(this.frame, this.replay, this.background, this.options, this.textures, this.context);
};

/**
 * Close the previewer
 */
Viewer.prototype.close = function() {
    this.reset();
    this.hide();
};

/**
 * Stop the replay.
 * @return {[type]} [description]
 */
Viewer.prototype.pause = function() {
    if (this.playing) {
        clearInterval(this.playInterval);
        this.playInterval = null;
        this.playing = false;
    }
};

/**
 * Reset the replay to the beginning.
 */
Viewer.prototype.reset = function() {
    this.pause();
    this.setFrame(0);
};

// Play preview starting at the given frame and ending at the other
// argument.
Viewer.prototype.play = function(start, end) {
    // Reset anything currently playing.
    this.reset();
    this.playing = true;

    var time = Date.now();
    var startTime = time;
    var fps = this.replay.info.fps;
    this.setFrame(start);
    this.playInterval = setInterval(function() {
        if (this.frame >= end) {
            this.pause();
            return;
        }
        this.drawFrame();
        var dt = Date.now() - time;
        time = Date.now();
        var nFramesToAdvance = Math.round(dt / (1000 / fps));
        this.setFrame(this.frame + nFramesToAdvance);
    }.bind(this), 1000 / fps);
};

})(window);

var $ = require('jquery');
require('jquery-ui');
require('bootstrap');

var Messaging = require('./messaging');
var Textures = require('./textures');
var Render = require('./render');

/**
 * Code to support the in-page replay viewer. This file is included as
 * a content script.
 */

// Handle the interaction with the viewer for a replay.
var Viewer = function() {
    $('body').append(
        '<div id="tpr-viewer-container" class="bootstrap-container jquery-ui-container">');
    var url = chrome.extension.getURL("html/viewer.html");
    $("#tpr-viewer-container").load(url, function() {
        $("#tpr-viewer-container").hide();
        this.init();
    }.bind(this));
};

module.exports = Viewer;

// Initialize the viewer.
Viewer.prototype.init = function() {
    this.canvas = document.getElementById('viewer-canvas');
    this.context = this.canvas.getContext('2d');
    this.frame = 0;
    this.frames = 0;
    this.playing = false;
    this.playInterval = null;
    this.cropping = false;
    this.timeActive = false;

    var viewer = this;

    // Opt-in to bootstrap tooltips.
    $("#tpr-viewer-container [data-toggle='tooltip']").tooltip();

    // Set listeners.
    $("#time-slider").slider({
        min: 0,
        max: this.frames,
        value: 0,
        range: "min",
        slide: function(event, ui) {
            var value = ui.value;
            if (!viewer.playing) {
                viewer.frame = value;
                viewer.drawFrame();
            } else {
                clearInterval(viewer.playInterval);
                if (value >= viewer.lastFrame) {
                    viewer.play(value, viewer.frames);
                } else {
                    viewer.play(value, viewer.lastFrame);
                }
            }
        },
        change: function(event) {
            // Ensure this was a user-initiated event.
            if (event.originalEvent) {
                viewer.frame = $("#time-slider").slider("value");
                viewer.drawFrame();
            }
        }
    });

    $(".time-slider-container").mouseenter(function() {
        if (!viewer.timeActive) {
            viewer.timeActive = true;
            viewer.showSeek();
        }
    });

    $(".time-slider-container").mouseleave(function() {
        if (viewer.timeActive && viewer.playing) {
            viewer.timeActive = false;
            setTimeout(function() {
                // Don't hide if active again.
                if (viewer.timeActive || !viewer.playing) return;
                viewer.hideSeek();
            }, 500);
        }
    });

    // Setup crop slider.
    $("#crop-slider").slider({
        range: true,
        min: 0,
        max: this.frames,
        values: [0, this.frames]
    });

    $("#viewer-controls").on("click", ".tpr-button-stop", function() {
        viewer.close();
    });

    $("#viewer-controls").on("click", ".tpr-button-reset", function() {
        viewer.reset();
        viewer.drawFrame();
    });

    $("#viewer-controls").on("click", ".tpr-button-play", function() {
        viewer.play(viewer.frame, viewer.frames);
    });

    $("#viewer-controls").on("click", ".tpr-button-pause", function() {
        viewer.pause();
    });

    $("#viewer-controls").on("click", ".tpr-button-crop-start", function() {
        var cropRange = $("#crop-slider").slider("values");
        var newStart = $("#time-slider").slider("value");
        var newRange = [newStart];
        if (newStart >= cropRange[1]) {
            newRange.push(viewer.frames);
        } else {
            newRange.push(cropRange[1]);
        }
        $("#crop-slider").slider('values', newRange);
        if (!viewer.cropping) {
            viewer.cropping = true;
            viewer.showCrop();
        }
    });

    $("#viewer-controls").on("click", ".tpr-button-crop-end", function() {
        var cropRange = $("#crop-slider").slider("values");
        var newEnd = $("#time-slider").slider("value");
        var newRange = [newEnd];
        if (newEnd <= cropRange[0]) {
            newRange.unshift(0);
        } else {
            newRange.unshift(cropRange[0]);
        }
        $("#crop-slider").slider('values', newRange);
        if (!viewer.cropping) {
            viewer.cropping = true;
            viewer.showCrop();
        }
    });

    $("#viewer-controls").on("click", ".tpr-button-crop-play", function() {
        var range = $("#crop-slider").slider("values");
        viewer.play(range[0], range[1]);
    });

    // Crop replay data and save as a new replay.
    $("#viewer-controls").on("click", ".tpr-button-crop", function() {
        viewer.pause();
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
        Messaging.send("cropReplay", msg, function (response) {
            if (!response.failed) {
                viewer._viewReplay(response.id, response.data);
            }
        });
    });

    $("#viewer-controls").on("click", ".tpr-button-crop-replace", function() {
        viewer.pause();
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
        Messaging.send("cropAndReplaceReplay", msg, function (response) {
            if (!response.failed) {
                viewer._viewReplay(response.id, response.data);
            }
        });
    });

    $("#viewer-controls").on("click", ".tpr-button-delete", function() {
        if (confirm('Are you sure you want to delete this replay?')) {
            viewer.close();
            console.log('Requesting deletion of replay ' + viewer.id + '.');
            Messaging.send("deleteReplay", {
                id: viewer.id
            });
        }
    });

    $("#viewer-controls").on("click", ".tpr-button-render", function() {
        if (confirm('Are you sure you want to render this replay?')) {
            viewer.close();
            console.log('Requesting render of replay ' + viewer.id + '.');
            Messaging.send("renderReplay", {
                id: viewer.id
            });
        }
    });

    $("#viewer-controls").on("click", ".tpr-button-rename", function() {
        // TODO: Handle blank rename value.
        var newName = prompt('How would you like to rename ' + viewer.replay.info.name + '?');
        if (newName !== null && newName !== "") {
            console.log('Requesting rename from ' + viewer.replay.info.name + ' to ' + newName + '.');
            Messaging.send("renameReplay", {
                id: viewer.id,
                name: newName
            });
        }
    });
};

// Initialize viewer to work with replay that has provided id.
Viewer.prototype.preview = function(id) {
    // Show viewer.
    this.show();
    // TODO: Show loading spinner.
    // Get replay data.
    console.log('Requesting data for replay ' + id + ".");
    Messaging.send("getReplay", {
        id: id
    }, function(response) {
        console.log('Data received for replay ' + id + ".");
        this._viewReplay(id, response.data);
    }.bind(this));
};

/**
 * Internal method for initializing the viewer for a replay.
 * @param {integer} id - The id of the replay.
 * @param {Replay} replay - The replay data.
 */
Viewer.prototype._viewReplay = function(id, replay) {
    this.id = id;
    this.replay = replay;
    this.replayInit();
};

// Display the viewer.
Viewer.prototype.show = function() {
    $("#tpr-viewer-container").fadeIn(500);
};

// Hide the viewer.
Viewer.prototype.hide = function() {
    $("#tpr-viewer-container").fadeOut(500);
    $("#menuContainer").fadeIn(500);
};

// Initialize the viewer after retrieving the replay data.
Viewer.prototype.replayInit = function() {
    var viewer = this;
    this.canvas.title = "Replay: " + this.replay.info.name;
    this.frames = this.replay.data.time.length - 1;
    
    $("#time-slider").slider("option", "max", this.frames);
    $("#crop-slider").slider("option", "max", this.frames);
    $("#crop-slider").slider("values", [0, this.frames]);
    // Reset crop indicators.
    if (this.cropping) {
        this.cropping = false;
        this.hideCrop();
    }

    // Pause if playing.
    this.pause();

    // Reset to beginning.
    this.reset();
    // TODO: Show previewer with loading spinner?
    // Get options and textures.
    chrome.storage.local.get(["options", "textures", "default_textures"], function(items) {
        function onTextureLoad(textureImages) {
            viewer.textures = textureImages;
            viewer.initReplay();
        }

        viewer.options = items.options;
        if (!viewer.options.custom_textures) {
            Textures.getImages(items.default_textures, onTextureLoad);
        } else {
            Textures.getImages(items.textures, onTextureLoad);
        }
    });
};

/**
 * Hide cropping indicators.
 */
Viewer.prototype.showCrop = function() {
    $("#crop-slider .ui-slider-handle").show();
};

/**
 * Show cropping indicators.
 */
Viewer.prototype.hideCrop = function() {
    $("#crop-slider .ui-slider-handle").hide();
};

/**
 * Show the seek bar and handle.
 * @param {boolean} [instant=false] - Whether the bar should display
 *   instantly.
 */
Viewer.prototype.showSeek = function(instant) {
    var transform = {
        transform: 'scaleY(1)',
        transition: 'transform .1s ease-out'
    };
    $("#time-slider").css(transform);
    $("#crop-slider .ui-slider-handle").css(transform);
    $("#time-slider .ui-slider-handle").css({
        display: 'block',
        opacity: 1
    });
};

/**
 * Hide the seek bar and handle.
 * @param {boolean} [instant=false] - Whether the bar should hide
 *   instantly.
 */
Viewer.prototype.hideSeek = function(instant) {
    function remove() {
        $("#time-slider .ui-slider-handle").css({ display: 'none' });
        $("#time-slider .ui-slider-handle")[0].removeEventListener("transitionend", remove);
    }
    var transform = {
        transform: 'scaleY(0.375)',
        transition: 'transform .5s ease-in'
    };
    $("#time-slider").css(transform);
    $("#crop-slider .ui-slider-handle").css(transform);
    $("#time-slider .ui-slider-handle").css({
        opacity: 0
    });
    $("#time-slider .ui-slider-handle")[0].addEventListener("transitionend", remove);
};

// Initialize replay after everything has been loaded.
Viewer.prototype.initReplay = function() {
    // TODO: Replace loading spinner.
    var mapImgData = Render.drawMap(this.replay, this.textures.tiles);
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
    Render.drawFrame(this.frame, this.replay, this.background, this.options, this.textures, this.context);
};

/**
 * Close the previewer, resetting necessary state.
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
        this.lastFrame = null;
        this.playing = false;
        $('.tpr-button-pause').css("display", "none");
        if (this.frame >= this.frames) {
            $('.tpr-button-reset').css("display", "inline-flex");
        } else {
            $('.tpr-button-play').css("display", "inline-flex");
        }
        this.showSeek();
    }
};

/**
 * Reset the replay to the beginning.
 */
Viewer.prototype.reset = function() {
    this.setFrame(0);
    $('.tpr-button-reset').css("display", "none");
    $('.tpr-button-play').css("display", "inline-flex");
};

// Play preview starting at the given frame and ending at the other
// argument.
Viewer.prototype.play = function(start, end) {
    // Reset anything currently playing.
    this.reset();
    this.playing = true;
    this.hideSeek();
    $('.tpr-button-play').css("display", "none");
    $('.tpr-button-pause').css("display", "inline-flex");

    var time = Date.now();
    var startTime = time;
    var fps = this.replay.info.fps;
    this.setFrame(start);
    this.lastFrame = end;
    this.playInterval = setInterval(function() {
        if (this.frame >= this.lastFrame) {
            this.pause();
            return;
        }
        this.drawFrame();
        var dt = Date.now() - time;
        time = Date.now();
        var nFramesToAdvance = Math.round(dt / (1000 / fps));
        var newFrame = Math.min(this.frame + nFramesToAdvance, this.frames);
        this.setFrame(newFrame);
    }.bind(this), 1000 / fps);
};

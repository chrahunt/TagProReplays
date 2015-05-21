/**
 * Functions for rendering into video in the background page.
 */
(function() {

/**
 * Callback function that needs options and textures.
 * @callback OptionsCallback
 * @param {Options} options - Options.
 * @param {Textures} textures - Textures.
 */
/**
 * Retrieve the options and textures to render a replay.
 * @param {OptionsCallback} callback - 
 */
function getRenderSettings(callback) {
    // Retrieve options and textures and render the movie.
    chrome.storage.local.get(["options", "textures"], function(items) {
        var options = items.options;
        var textures;
        if (!options.custom_textures) {
            getDefaultTextures(function(defaultTextures) {
                getTextureImages(defaultTextures, function(textureImages) {
                    textures = textureImages;
                    callback(options, textures);
                });
            });
        } else {
            getTextureImages(items.textures, function(textureImages) {
                textures = textureImages;
                callback(options, textures);
            });
        }
    });
}

/**
 * @callback RenderCallback
 * @param {boolean} result - Whether or not the rendering completed
 *   successfully.
 */
/**
 * Renders the replay with the given name, giving progress updates to
 * the tab identified by tabId. When the rendering has finished or
 * failed, the callback is called.
 * @param  {string}   name - The name of the replay to render.
 * @param  {RenderCallback} callback - Called when the rendering is
 *  complete.
 */
window.renderReplay = function(id, callback) {
    // Retrieve replay data that corresponds to the given name.
    getReplay(id, function(err, replay) {
        if (err) {
            callback(err);
            return;
        }
        // TODO: Validate replay.
        var fps = replay.info.fps;
        var frames = replay.data.time.length;

        // Construct canvas.
        var canvas = document.createElement('canvas');

        var context = canvas.getContext('2d');

        getRenderSettings(function(options, textures) {
            // Set rendering canvas dimensions.
            canvas.width = options.canvas_width;
            canvas.height = options.canvas_height;

            var mapImgData = drawMap(replay, textures.tiles);
            var mapImg = new Image();
            mapImg.src = mapImgData;
            
            var encoder = new Whammy.Video(fps);

            sendMessage("replayRendering", {
                id: id,
                progress: 0
            });

            // Execute for each frame.
            function loop(frame) {
                if (frame / Math.round(frames / 100) % 1 === 0) {
                    var progress = frame / frames;
                    sendMessage("replayRendering", {
                        id: id,
                        progress: progress
                    });
                }
                animateReplay(frame, replay, mapImg, options, textures, context);
                encoder.add(context);
            }

            // Execute after loop is complete.
            function then() {
                var output = encoder.compile();
                saveMovie(id, output, function(err) {
                    callback(err);
                });
            }

            var opts = {
                limit: true,
                max_iterations: 3
            };
            // Execute the rendering without blocking execution.
            processNonBlocking(0, frames, loop, then, opts);
        });
    });
};

})();

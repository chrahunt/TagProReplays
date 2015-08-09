var Dexie = require('dexie');
var Whammy = require('whammy');

var Task = require('./task');
var Messaging = require('./messaging');
var Data = require('./data');
var Textures = require('./textures');
var Render = require('./render');

// Setup task database.
var db = new Dexie("TaskDatabase");
db.version(1).stores({
    renders: '++id,&replay_id'
});

db.open();

/**
 * Manages the rendering of replays on the background page.
 */
var RenderManager = function() {
    // Cache for options and textures set via chrome storage.
    this.cached = {
        options: null,
        textures: null
    };
    this.rendering = false;
    this.task = null;
    this.paused = false;

    this.start();
};

module.exports = RenderManager;

/**
 * Start the render process manager.
 */
RenderManager.prototype.start = function() {
    // Start loop and listen for errors.
    this._loop().catch(function (err) {
        console.error("Rendering error: %o.", err);
    });
};

/**
 * Cancel the rendering of the replays with the given ids.
 * @param {Array.<integer>} ids - The ids of the replays to cancel
 *   rendering for.
 * @return {Promise} - Resolves if the cancellation was successful or
 *   rejects if unsuccessful.
 */
RenderManager.prototype.cancel = function(ids) {
    // Cancel current task if current id is being cancelled.
    if (this.task && ids.indexOf(this.id) !== -1) {
        // Cancelling task doesn't end the loop, it will be handled
        // properly.
        this.task.cancel();
    }
    return db.renders.where("replay_id").anyOf(ids).delete().then(function () {
        return Data.db.info.where(":id").anyOf(ids).modify({
            rendering: false
        });
    });
};

/**
 * Pause rendering, if it is occurring.
 */
RenderManager.prototype.pause = function() {
    this.paused = true;
    if (this.task) {
        this.task.pause();
    }
};

/**
 * Restart rendering, if it is paused.
 */
RenderManager.prototype.resume = function() {
    this.paused = false;
    // Check if there is a pending task and resume if so.
    if (this.task) {
        this.task.resume();
    } else {
        this.start();
    }
};

/**
 * Add replays to be rendered.
 * @param {Array.<integer>} ids - The ids of the replays to render.
 * @param {Promise} callback - The callback which receives the success
 *   or failure of the replay render task adding.
 */
RenderManager.prototype.add = function(ids) {
    var self = this;
    // Update replayInfo.
    return Data.db.transaction("rw", Data.db.info, function() {
        var nonRenderingIds = [];
        var nonRenderingData = [];
        return Data.db.info.where(":id").anyOf(ids).each(function (info) {
            // Get replays being added that aren't already rendering.
            if (!info.rendering && !info.rendered) {
                nonRenderingIds.push(info.id);
                nonRenderingData.push({
                    id: info.id,
                    name: info.name,
                    date: info.dateRecorded
                });
            }
        }).then(function () {
            // Update rendering property to lock the replays.
            Data.db.info.where(":id").anyOf(nonRenderingIds).modify({
                rendering: true
            });
            return nonRenderingData;
        });
    }).then(function (nonRenderingData) {
        // Add tasks.
        return db.transaction("rw", db.renders, function () {
            nonRenderingData.forEach(function (data) {
                db.renders.add({
                    replay_id: data.id,
                    data: data
                });
            });
        }).then(function () {
            // Start render manager if needed.
            if (!self.rendering) {
                self.start();
            }
        });
    });
};

/**
 * Internal method, renders the replay with the given id.
 * @param {integer} id - The id of the replay to render.
 * @return {Promise} - Promise which resolves if the movie was rendered
 *   and saved, or rejects if there was an error.
 * @private
 */
RenderManager.prototype._render = function(id) {
    var self = this;
    return Data.getReplay(id).then(function (replay) {
        // TODO: Validate replay?
        return self._getRenderSettings().then(function (settings) {
            var options = settings[0],
                textures = settings[1];
            Messaging.send("replayRenderProgress", {
                id: id,
                progress: 0
            });

            var context = {
                options: options,
                textures: textures,
                replay: replay,
                id: id
            };

            self.task = new Task({
                context: context,
                init: function init(ready) {
                    // Construct canvas and set dimensions.
                    var canvas = document.createElement('canvas');
                    canvas.width = options.canvas_width;
                    canvas.height = options.canvas_height;

                    var fps = replay.info.fps;
                    this.encoder = new Whammy.Video(fps);
                    this.context = canvas.getContext('2d');

                    this.frames = replay.data.time.length;

                    var mapImgData = Render.drawMap(replay, textures.tiles);
                    this.mapImg = new Image();
                    this.mapImg.src = mapImgData;
                    this.mapImg.onload = ready;
                    return true;
                },
                loop: function loop(frame) {
                    if (frame / Math.round(this.frames / 100) % 1 === 0) {
                        var progress = frame / this.frames;
                        Messaging.send("replayRenderProgress", {
                            id: this.id,
                            progress: progress
                        });
                    }
                    Render.drawFrame(frame, this.replay, this.mapImg,
                        this.options, this.textures, this.context);
                    this.encoder.add(this.context);
                },
                options: {
                    end: replay.data.time.length,
                    target: 1000
                }
            });

            return self.task.getResult().then(function(result) {
                self.task = null;
                var output = result.encoder.compile();
                return Data.saveMovie(result.id, output);
            });
        });
    });
};

/**
 * Called to continue the render loop.
 * @return {Promise} - Rejects if there is an error.
 * @private
 */
RenderManager.prototype._loop = function() {
    if (this.paused) return Promise.resolve();
    var self = this;
    return this.getNext().then(function (id) {
        if (typeof id == "undefined") {
            self.rendering = false;
            return;
        }
        self.rendering = true;
        self.id = id;
        
        return self._render(id).then(function () {
            self.id = null;
            return Data.db.info.update(id, {
                rendering: false
            }).then(function () {
                return db.renders.where("replay_id").equals(id)
                    .delete().then(function () {
                    Messaging.send("renderUpdated");
                    return self._loop();
                });
            });
        }).catch(function (err) {
            self.id = null;
            if (err === "cancelled") {
                return self._loop();
            } else {
                console.error("Error in rendering: %o.", err);
            }
        });
    });
};

/**
 * Retrieve the render queue.
 * @param {object} data - Information governing how many items are
 *   returned.
 * @return {Promise} - Promise that resolves to an array with the
 *   number of total tasks and the replay ids for the tasks.
 */
RenderManager.prototype.getQueue = function(data) {
    var collection = db.renders.orderBy(":id");
    return collection.count().then(function (n) {
        return collection.offset(data.start).limit(data.length).toArray().then(function (results) {
            return [n, results];
        });
    });
};

/**
 * Get the next id for rendering.
 * @return {Promise} - Resolves to the id of the next replay to render,
 *   or undefined if there are no more replays.
 */
RenderManager.prototype.getNext = function() {
    return db.renders.orderBy(":id").first().then(function (value) {
        return value && value.replay_id;
    });
};
/**
 * Callback function that needs options and textures.
 * @callback OptionsCallback
 * @param {Options} options - Options.
 * @param {Textures} textures - Textures.
 */
/**
 * Retrieve the options and textures to render a replay.
 * @private
 */
RenderManager.prototype._getRenderSettings = function(callback) {
    if (!this.cached.options || !this.cached.textures) {
        return new Promise(function (resolve, reject) {
            // Retrieve options and textures and render the movie.
            chrome.storage.local.get(["options", "textures"], function(items) {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                var options = items.options;
                var textures;
                if (!options.custom_textures) {
                    Textures.getDefault(function(defaultTextures) {
                        Textures.getImages(defaultTextures, function(textureImages) {
                            textures = textureImages;
                            resolve([options, textures]);
                        });
                    });
                } else {
                    Textures.getImages(items.textures, function(textureImages) {
                        textures = textureImages;
                        resolve([options, textures]);
                    });
                }
            });
        });
    } else {
        return Promise.resolve([this.cached.options, this.cached.textures]);
    }
};

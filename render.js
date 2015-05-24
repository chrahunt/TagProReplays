/**
 * Functions for rendering into video in the background page.
 */
(function(window) {

/**
 * Manages the rendering of replays on the background page.
 */
var RenderManager = function() {
    // Cache for options and textures set via chrome storage.
    this.cached = {
        options: null,
        textures: null
    };
    this.init();
};

window.RenderManager = RenderManager;

/**
 * Initialize the render manager.
 * @private
 */
RenderManager.prototype.init = function() {
    var self = this;
    // Check for renders to resume.
    // Check for pending renders, initialize rendering if present.
    idbReady(function() {
        var db = getDb();
        var transaction = db.transaction("task", "readwrite");
        var taskStore = transaction.objectStore("task");
        var request = taskStore.get("renders");
        request.onsuccess = function(event) {
            var result = event.target.result;
            if (!result) {
                // Add renders array to object store.
                var request = taskStore.add([], "renders");
                request.onsuccess = function(event) {
                    console.log("Added render queue to database.");
                };
            } else if (result.length > 0) {
                // Initialize rendering.
                self._renderLoop(result[0]);
            } else {
                console.log("No pending renders in queue.");
            }
        };
    });
};

/**
 * Cancel the rendering of the replays with the given ids.
 * @param {Array.<integer>} ids - The ids of the replays to cancel
 *   rendering for.
 * @param {Function} callback - The callback which receives the success
 *   or failure of the cancellation operation.
 */
RenderManager.prototype.cancel = function(ids, callback) {
    // Remove ids from render queue and rendering from info objects.
    var db = getDb();
    var transaction = db.transaction(["info", "task"], "readwrite");
    var infoStore = transaction.objectStore("info");
    // Cancel current task if for id.
    // TODO: Complete.
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
 * Restart rendering, if it is pending.
 */
RenderManager.prototype.resume = function() {
    this.paused = false;
    // Check if there is a pending task and resume if so.
    if (this.task) {
        this.task.resume();
    } else {
        // Initialize loop.
        this.getQueue(function(queue) {
            if (queue.length > 0) {
                this._renderLoop(queue[0]);
            } else {
                console.log("No renders in queue after resuming.");
            }
        }.bind(this));
    }
};

/**
 * Add replays to be rendered.
 * @param {Array.<integer>} ids - The ids of the replays to render.
 * @param {Function} callback - The callback which receives the success
 *   or failure of the replay render task adding.
 */
RenderManager.prototype.add = function(ids, callback) {
    var self = this;
    ids = ids.slice().sort();
    // Add replay to render queue and set property on info.
    var db = getDb();
    var transaction = db.transaction(["task", "info"], "readwrite");
    var taskStore = transaction.objectStore("task");
    var infoStore = transaction.objectStore("info");

    var cursor = infoStore
        .openCursor(IDBKeyRange.bound(ids[0], ids[ids.length - 1]));
    ids.shift();
    var nonRenderingIds = [];
    cursor.onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
            // Only add ids for replays that aren't already rendering.
            if (!cursor.value.rendering) {
                nonRenderingIds.push(cursor.value.id);
                cursor.value.rendering = true;
                infoStore.put(cursor.value);
            }
            cursor.continue(ids.shift());
        } else {
            var request = taskStore.get("renders");
            request.onsuccess = function(event) {
                var queue = event.target.result;
                queue = queue.concat(nonRenderingIds);
                var request = taskStore.put(queue, "renders");
                request.onsuccess = function() {
                    // Check before doing render loop in case it's already going.
                    if (!self.rendering && queue.length > 0) {
                        self._renderLoop(queue[0]);
                    }
                    // TODO: Send any errors from adding replays to database back to caller.
                    callback(null);
                };
            };
        }
    };
};

/**
 * Internal method, 
 * @param {[type]} id [description]
 * @param {Function} callback [description]
 * @private
 */
RenderManager.prototype._render = function(id, callback) {
    var self = this;
    // Retrieve replay data that corresponds to the given name.
    getReplay(id, function(err, replay) {
        if (err) {
            callback(err);
            return;
        }
        // TODO: Validate replay?
        self._getRenderSettings(function(options, textures) {
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

                    var mapImgData = drawMap(replay, textures.tiles);
                    this.mapImg = new Image();
                    this.mapImg.src = mapImgData;
                    this.mapImg.onload = ready;
                    return true;
                },
                loop: function loop(frame) {
                    if (frame / Math.round(this.frames / 100) === 1) {
                        var progress = frame / this.frames;
                        sendMessage("replayRendering", {
                            id: this.id,
                            progress: progress
                        });
                    }
                    animateReplay(frame, this.replay, this.mapImg,
                        this.options, this.textures, this.context);
                    this.encoder.add(this.context);
                },
                options: {
                    end: replay.data.time.length
                }
            });

            self.task.result.then(function(result) {
                self.task = null;
                var output = result.encoder.compile();
                saveMovie(result.id, output, function(err) {
                    callback(err);
                });
            }, function(reason) {
                if (reason === "cancelled") {
                    self.task = null;
                    // Continue with next replay.
                }
            });

            sendMessage("replayRendering", {
                id: id,
                progress: 0
            });
        });
    });
};

/**
 * Called to continue the render loop, takes id of the next replay to
 * render.
 * @private
 */
RenderManager.prototype._renderLoop = function(id) {
    if (this.paused) return;
    var self = this;
    // Set background page status.
    setStatus("rendering");
    this.rendering = true;
    this.id = id;
    this._render(id, function(err) {
        self.id = null;
        if (err) {
            // TODO: Alert of rendering failure, but not if cancelled because that would
            // be handled through a different way?
        } else {
            // TODO: Alert the menu of a newly rendered replay.
            // TODO: Also remove the rendering property from the item.
            // Remove the id from the render queue.
            var db = getDb();
            var transaction = db.transaction("task", "readwrite");
            var taskStore = transaction.objectStore("task");
            var request = taskStore.get("renders");
            request.onsuccess = function(event) {
                var queue = event.target.result;
                var index = queue.indexOf(id);
                if (index !== -1) {
                    queue.splice(index, 1);
                    var request = taskStore.put(queue, "renders");
                    request.onsuccess = function() {
                        if (queue.length > 0) {
                            self._renderLoop(queue[0]);
                        } else {
                            // Done with rendering for the moment.
                            self.rendering = false;
                            setStatus("idle");
                        }
                    };
                } else {
                    // TODO: Handle job not found error?
                }
            };
        }
    });
};

/**
 * Retrieve the render queue.
 * @param {DBCallback} callback - The callback that receives the render queue.
 */
RenderManager.prototype.getQueue = function(callback) {
    // TODO: Ensure transaction is complete?
    var db = getDb();
    var transaction = db.transaction("task");
    var taskStore = transaction.objectStore("task");
    var request = taskStore.get("renders");
    request.onsuccess = function(event) {
        callback(event.target.result);
    };
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
    } else {
        callback(this.cached.options, this.cached.textures);
    }
};

})(window);

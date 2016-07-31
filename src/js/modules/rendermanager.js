var Dexie = require('dexie');
var Whammy = require('whammy');

var Data = require('./data');
var Messaging = require('./messaging');
var Renderer = require('./renderer');
var Storage = require('./storage');
var Task = require('./task');
var Textures = require('./textures');

var logger = require('./logger')('rendermanager');

// Setup task database.
var db = new Dexie("TaskDatabase");
db.version(1).stores({
  renders: '++id,&replay_id'
});

db.open();

/**
 * Manages the rendering of replays on the background page.
 */
var RenderManager = function () {
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
RenderManager.prototype.start = function () {
  // Start loop and listen for errors.
  this._loop().catch((err) => {
    logger.error("Rendering error: ", err);
  });
};

/**
 * Cancel the rendering of the replays with the given ids.
 * @param {Array.<integer>} ids - The ids of the replays to cancel
 *   rendering for.
 * @return {Promise} - Resolves if the cancellation was successful or
 *   rejects if unsuccessful.
 */
RenderManager.prototype.cancel = function (ids) {
  // Cancel current task if current id is being cancelled.
  if (this.task && ids.includes(this.id)) {
    // Cancelling task doesn't end the loop, it will be handled
    // properly.
    this.task.cancel();
  }
  return db.renders
           .where("replay_id")
           .anyOf(ids)
           .delete()
  .then(() => {
    return Data.db.info.where(":id").anyOf(ids).modify({
      rendering: false
    });
  });
};

/**
 * Pause rendering, if it is occurring.
 */
RenderManager.prototype.pause = function () {
  this.paused = true;
  if (this.task) {
    this.task.pause();
  }
};

/**
 * Restart rendering, if it is paused.
 */
RenderManager.prototype.resume = function () {
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
RenderManager.prototype.add = function (ids) {
  // Update replayInfo.
  return Data.db.transaction("rw", Data.db.info, () => {
    var nonRenderingIds = [];
    var nonRenderingData = [];
    return Data.db.info
                  .where(":id")
                  .anyOf(ids)
    .each((info) => {
      // Get replays being added that aren't already rendering.
      if (!info.rendering && !info.rendered) {
        nonRenderingIds.push(info.id);
        nonRenderingData.push({
          id: info.id,
          name: info.name,
          date: info.dateRecorded
        });
      }
    }).then(() => {
      // Update rendering property to lock the replays.
      Data.db.info
             .where(":id")
             .anyOf(nonRenderingIds)
             .modify({
               rendering: true
             });
      return nonRenderingData;
    });
  }).then((nonRenderingData) => {
    // Add tasks.
    return db.transaction("rw", db.renders, () => {
      nonRenderingData.forEach((data) => {
        db.renders.add({
          replay_id: data.id,
          data: data
        });
      });
    }).then(() => {
      // Start render manager if needed.
      if (!this.rendering) {
        this.start();
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
RenderManager.prototype._render = function (id) {
  return Data.getReplay(id).then((replay) => {
    // TODO: Validate replay?
    return this._getRenderSettings().then((settings) => {
      var options = settings[0];
      var textures = settings[1];
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

      this.task = new Task({
        context: context,
        init: function init(ready) {
          this.renderer = new Renderer(this.replay, {
            textures: this.textures,
            options: this.options
          });

          var fps = replay.info.fps;
          this.encoder = new Whammy.Video(fps);
          this.context = this.renderer.getContext();

          this.frames = replay.data.time.length;
          ready();
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
          this.renderer.drawFrame(frame);
          this.encoder.add(this.context);
        },
        options: {
          end: replay.data.time.length,
          target: 1000
        }
      });

      return this.task.getResult().then((result) => {
        this.task = null;
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
RenderManager.prototype._loop = function () {
  if (this.paused) return Promise.resolve();

  return this.getNext().then((id) => {
    if (typeof id == "undefined") {
      this.rendering = false;
      return;
    }
    this.rendering = true;
    this.id = id;

    return this._render(id).then(() => {
      this.id = null;
      return Data.db.info
                    .update(id, {
                      rendering: false
                    })
      .then(() => {
        return db.renders
                 .where("replay_id")
                 .equals(id)
                 .delete()
      }).then(() => {
        Messaging.send("renders.update");
        return this._loop();
      });
    }).catch((err) => {
      this.id = null;
      if (err === "cancelled") {
        return this._loop();
      } else {
        logger.error("Error in rendering: ", err);
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
RenderManager.prototype.getQueue = function (data) {
  var collection = db.renders.orderBy(":id");
  return collection.count().then((n) => {
    return collection.offset(data.start)
                     .limit(data.length)
                     .toArray()
    .then((results) => [n, results]);
  });
};

/**
 * Get the next id for rendering.
 * @return {Promise} - Resolves to the id of the next replay to render,
 *   or undefined if there are no more replays.
 */
RenderManager.prototype.getNext = function () {
  return db.renders
           .orderBy(":id")
           .first()
  .then((value) => value && value.replay_id);
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
RenderManager.prototype._getRenderSettings = function () {
  // TODO: re-check options, or listen for changes to options and update.
  if (!this.cached.options || !this.cached.textures) {
    return Storage.get(["options", "textures"]).then((items) => {
      // Retrieve options and textures and render the movie.
      var options = items.options;
      if (!options.custom_textures) {
        return Textures.getDefault().then(Textures.getImages).then(
          (images) => [options, images]);
      } else {
        return Textures.getImages(items.textures).then(
          (images) => [options, images]);
      }
    });
  } else {
    return Promise.resolve([this.cached.options, this.cached.textures]);
  }
};

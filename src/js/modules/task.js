/**
 * @typedef {object} TaskOptions
 * @property {integer} [target=200] - The target time, in ms, of each loop
 *   iteration.
 * @property {integer} [start=0] - The iteration at which to start the
 *   loop.
 * @property {integer} end - The iteration at which to end the loop.
 * @property {integer} [polling_length=50] - If the task is paused, how
 *   often should it check whether the task has been unpaused or cancelled.
 * @property {integer} [wait=5] - How long to wait between cycles, in ms.
 * @property {number} [learning_rate=0.7] - How quickly the task will
 *   adjust its rate to match the target.
 */
/**
 * @typedef TaskTemplate
 * @property {object} [context] - 'this' for the loop function.
 * @property {Function} loop - The function to be looped.
 * @property {Function} [init] - Optional function to initialize the
 *   context. If it returns wait then the task will wait until the
 *   optional ready function is called.
 * @property {TaskOptions} options - Options governing the task.
 */
/**
 * A Task represents a deferred computation that completes without
 * blocking. The task executes computations in a loop, and works best
 * with computations that take around the same amount of time in each
 * loop iteration.
 *
 * After initializing a task, set a callback on its `result` property,
 * which is a Promise that will resolve with the provided context after
 * completion. If the task is cancelled, then the promise will be
 * rejected with the reason "cancelled".
 * @param {TaskTemplate} template - The template to use for this task.
 */
var Task = function(template) {
  if (!template.hasOwnProperty("context")) {
    template.context = {};
  }
  if (template.hasOwnProperty("init")) {
    var wait = template.init.call(template.context, function() {
      this.waiting = false;
    }.bind(this));
  }
  var opts = template.options;
  this.polling_length = opts.polling_length || 50;
  this.start = opts.start || 0;
  this.target = opts.target || 200;
  this.iteration = this.start; // loop number
  this.wait = opts.wait || 5;
  this.learning_rate = opts.learning_rate || 0.7;
  this.end = opts.end;
  this.rate = 1; // Initial rate in loops/cycle.

  this.tmpl = template;
  this.cancelled = false;
  this.paused = false;
  this.result = new Promise(this._run.bind(this));
};
module.exports = Task;

/**
 * Cancel the task.
 */
Task.prototype.cancel = function() {
  this.cancelled = true;
};

/**
 * Pause the task.
 */
Task.prototype.pause = function() {
  this.paused = true;
};

/**
 * Unpause the task.
 */
Task.prototype.resume = function() {
  this.paused = false;
};

Task.prototype._run = function(resolve, reject) {
  if (this.cancelled) {
    reject("cancelled");
  } else if (this.paused || this.waiting) {
    setTimeout(function() {
      //resolve(new Promise(this._run.bind(this)));
      this._run(resolve, reject);
    }.bind(this), this.polling_length);
  } else {
    var stop = Math.min(this.end, this.iteration + Math.floor(this.rate));

    for (; this.iteration < stop; this.iteration++) {
      var start = performance.now();
      this.tmpl.loop.call(this.tmpl.context, this.iteration);
      var time = performance.now() - start;
      this.rate += this.learning_rate * (this.target / time - this.rate);
      // Make sure there's still at least 1 loop per cycle.
      this.rate = Math.max(this.rate, 1);
    }
    if (this.iteration === this.end) {
      resolve(this.tmpl.context);
    } else {
      var now = performance.now();
      setTimeout(function() {
        console.log("Time between cycles: " + (performance.now() - now) + "ms.");
        //resolve(new Promise(this._run.bind(this)));
        this._run(resolve, reject);
      }.bind(this), this.wait);
    }
  }
};

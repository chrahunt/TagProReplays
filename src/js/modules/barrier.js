/**
 * A Barrier provides a method for synchronization of multiple asynch-
 * ronous calls, ensuring all are complete prior to proceeding with
 * execution of a set function.
 */
var Barrier = function() {
    this.processing = {};
    this.current = 0;
};

module.exports = Barrier;

/**
 * Set function to be 
 * @param {Function} fn [description]
 * @return {[type]} [description]
 */
Barrier.prototype.onComplete = function(fn) {
    this.callback = fn;
};

/**
 * Indicate that an asynchronous process is starting. Returns an id
 * used to identify the process so it can be stopped later.
 * @return {string} - The id for the asynchronous process.
 */
Barrier.prototype.start = function() {
    var id = this.current;
    this.current++;
    this.processing[id] = true;
    return id;
};

/**
 * Called by asynchronous process when completed. If all processes are
 * complete then the onComplete callback is called.
 * @param {string} id - The identifier for the particular asynchronous
 *   process
 */
Barrier.prototype.stop = function(id) {
    delete this.processing[id];
    if (this._finished()) {
        this.callback();
    }
};

/**
 * Checks whether all asynchronous tasks are complete.
 * @return {boolean} - Whether all tasks are complete.
 */
Barrier.prototype._finished = function() {
    for (var id in this.processing) {
        if (this.processing[id]) {
            return false;
        }
    }
    return true;
};

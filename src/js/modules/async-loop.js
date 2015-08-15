/**
 * Loop over the given array executing the function passed to `do` and
 * then executing the function provided to 
 * @param {[type]} arr [description]
 */
function AsyncLoop(arr) {
  if (!AsyncLoop.prototype.isPrototypeOf(this)) {
    return new AsyncLoop(arr);
  } else {
    this.list = arr;
    this.cancelled = false;
  }
}

module.exports = AsyncLoop;

// Start if we have all components.
AsyncLoop.prototype._start = function() {
  var self = this;
  function cancelled() {
    return self.cancelled;
  }
  if (self._do && self._then) {
    var results = self.list.map(function (elt) {
      return new Promise(function (resolve, reject) {
        return self._do(elt, resolve, reject, cancelled);
      });
    });
    Promise.all(results).then(function (results) {
      self._then(results);
    });
  }
};

/**
 * [do description]
 * @param {Function} fn - Function that takes arguments item, resolve,
 *   reject, executing on each item.
 * @return {this} - Returns the AsyncLoop, for chaining.
 */
AsyncLoop.prototype.do = function(fn) {
  this._do = fn;
  this._start();
  return this;
};

/**
 * Function to run 
 * @param {Function} fn [description]
 * @return {[type]} [description]
 */
AsyncLoop.prototype.then = function(fn) {
  this._then = fn;
  this._start();
  return this;
};

// Cancel loop.
AsyncLoop.prototype.reject = function() {
  this.cancelled = true;
};

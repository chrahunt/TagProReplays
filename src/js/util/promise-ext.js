/**
 * Promise extensions.
 */
/**
 * @typedef {Object} StreamOptions
 * @property {number} concurrency the maximum number of concurrent
 *   operations
 */
/**
 * @callback StreamCallback
 * @param {T} result the resolved value
 */
/**
 * Takes source of promises (prefer generator) and outputs the results
 * in order to `output`.
 * @param {Iterable<Promise<T>>} iterator
 * @param {StreamCallback} output
 * @param {StreamOptions} options
 * @returns {Promise<>} resolves when all promises are resolved or
 *   rejects on first failure
 */
exports.toStream = function(iterator, output, options) {
  options = Object.assign({ concurrency: Infinity }, options);
  let limit = options.concurrency;
  let pending = 0;
  let index = 0;
  let buffer = new Map();
  let last_pushed = -1;

  let fulfilled = false;
  return new Promise((resolve, reject) => {
    function fulfill(fn, value) {
      fulfilled = true;
      fn(value);
    }

    function error(err) {
      // Don't hang on to references in case we have some hanging
      // promises
      buffer = null;
      fulfill(reject, err);
    }

    function update() {
      while (pending < limit) {
        let {value, done} = iterator.next();
        if (done) break;
        pending++;
        let i = index++;
        Promise.resolve(value)
        .then(result => finished(result, i))
        .catch(error);
      }
    }

    function finished(result, i) {
      if (fulfilled) return;
      buffer.set(i, result);
      pending--;
      // Start waiting on async operations ASAP, the the act of pulling
      // them from the iterator should start them
      update();
      // last_push is the index of the most recent item pushed to the
      // output, or -1.
      for (var index = i;
           index == last_pushed + 1 && buffer.has(index);
           last_pushed = index++) {
        output(buffer.get(index));
        buffer.delete(index);
      }
      if (!pending) fulfill(resolve);
    }

    // Initialize.
    update();
    // Handle empty case.
    if (!pending) fulfill(resolve);
  });
};

/**
 * Provide a progress callback to some bit of work wrapped
 * in a Promise.
 * 
 * Use with regular promises like:
 *   
 *   let total = n;
 *   var p = new Progress((resolve, reject, progress) => {
 *     let i = 0;
 *     loop((item) => {
 *       progress(++i / n);
 *     });
 *   });
 * 
 *   // elsewhere...
 * 
 *   promise_returning_fn().then(p.progress((progress) => {
 *     update_something(progress);
 *   })).then((result) => {
 *     all_done();
 *   });
 * 
 * The value passed to progress can be anything you like, it is
 * passed on as-is.
 */
class Progress extends Promise {
  constructor(executor) {
    super((resolve, reject) => {
      return executor(resolve, reject, (progress) => {
        this.__callback(progress);
      });
    });
    // no-op
    this.__callback = () => {};
  }

  progress(callback) {
    this.__callback = callback;
    return this;
  }
}
exports.Progress = Progress;

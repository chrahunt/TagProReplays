const logger = require('util/logger')('promise-ext');

/**
 * Promise extensions.
 */
/**
 * Rewrite of bluebird Promise.map except:
 * - doesn't take input promises
 * - in-order execution of input is guaranteed
 * - input iterator is not flushed initially.
 */
exports.map = (iterator, mapper, options = {}) => {
  options = Object.assign({ concurrency: Infinity }, options);
  let limit = options.concurrency;
  let pending = 0;
  let index = 0;
  let results = [];
  let fulfilled = false;

  return new Promise((resolve, reject) => {
    function fulfill(fn, value) {
      fulfilled = true;
      fn(value);
    }

    function update() {
      while (pending < limit) {
        let {value, done} = iterator.next();
        if (done) break;
        pending++;
        Promise.resolve(mapper(value, index++))
        .then(finished)
        .catch(error);
      }
    }

    function error(err) {
      pending--;
      fulfill(reject, err);
    }

    function finished(result) {
      results.push(result);
      pending--;
      update();
      // It's not possible to have pending items
      if (!pending) fulfill(resolve, results);
    }
    // Initialize.
    update();
    // Handle empty/synchronous case.
    if (!pending) fulfill(resolve, results);
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

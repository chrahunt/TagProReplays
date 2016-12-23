const logger = require('util/logger')('promise-ext');

/**
 * Promise extensions.
 */
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
class Progress {
  constructor(wrapped) {
    this.__callback = () => {};
    this.__promise = new Promise((resolve, reject) => {
      return wrapped(resolve, reject, (progress) => {
        this.__callback(progress);
      });
    });
  }

  progress(callback) {
    this.__callback = callback;
    return this.__promise;
  }
}
exports.Progress = Progress;

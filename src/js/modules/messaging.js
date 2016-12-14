const logger = require('./logger')('messaging');;

/**
 * Request-response communication from a Sandbox client to a sandboxed
 * web page.
 * 
 * Client side initializes a Sandbox with the source of the page.
 * The sandbox page should call registerSandbox with a callback
 * to receive messages.
 * 
 * Internal protocol:
 * client -> sandbox
 * {
 *   {*} data - data passed to the sandbox
 *   {number} callback_ref - reference to be passed in response
 * }
 * 
 * sandbox -> client
 * {
 *   {*} data - data passed back in response, if an error then this is
 *     the message text
 *   {bool} failed - whether this is an error
 *   {number} callback_ref - reference passed in initial request
 * }
 */
/**
 * Injects a new iframe into the current page 
 */
class Sandbox {
  constructor(src) {
    this.callbacks = new Map();
    this.callback_ids = 0;
    this.frame = document.createElement('iframe');
    this.frame.src = src;
    this.frame.addEventListener('load', () => {
      this.channel = new MessageChannel();
      this.frame.contentWindow.postMessage(null, '*', [this.channel.port2]);
      this.port = this.channel.port1;
      this.port.onmessage = (e) => this.handle_message(e);
    }, false);
    document.body.appendChild(this.frame);
  }

  /**
   * Send a message to the sandbox and receive a response.
   * @param {*} data  the data to send to the sandbox.
   * @returns {Promise}  promise that resolves to the returned
   *   value or rejects on error.
   */
  postMessage(data) {
    return new Promise((resolve, reject) => {
      let callback_ref = this.callback_ids++;
      this.callbacks.set(callback_ref, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
      logger.debug(`Sending message for ${callback_ref}`);
      this.port.postMessage(JSON.stringify({
        data: data,
        callback_ref: callback_ref
      }));
    });
  }

  /**
   * @private
   */
  handle_message(e) {
    let {data, callback_ref, failed} = e.data;
    logger.debug(`Received response for ${callback_ref}. Failed: ${failed}`);
    let callback = this.callbacks.get(callback_ref);
    if (callback) {
      this.callbacks.delete(callback_ref);
      if (failed) {
        callback(new Error(data));
      } else {
        callback(null, data);
      }
    } else {
      logger.warn(`No callback found.`);
    }
  }
}
exports.Sandbox = Sandbox;

// Return a function that can only be called once.
function once(fn) {
  return (...args) => {
    if (fn) {
      let result = fn(...args);
      fn = null;
      return result;
    }
  };
}

let setPortListener = once(() => {
  return new Promise((resolve, reject) => {
    onmessage = (e) => {
      logger.debug('Received window message.');
      let port = e.ports[0];
      resolve(port);
    };
  });
});

/**
 * Called from the sandboxed page to register a listener.
 * Argument sent to the Sandbox is passed through. The callback
 * can return a value or a Promise. If an error is thrown or the
 * Promise rejected then that rejection will propagate back to the
 * client.
 */
exports.registerSandbox = (callback) => {
  setPortListener().then((port) => {
    logger.info('Received port');
    port.onmessage = (e) => {
      let {data, callback_ref} = JSON.parse(e.data);
      let result;
      try {
        result = callback(data);
      } catch (e) {
        port.postMessage({
          callback_ref: callback_ref,
          failed: true,
          data: e.message
        });
        logger.error('Error calling callback: ', e);
        return;
      }
      if (result && result.then) {
        result.then((value) => {
          port.postMessage({
            callback_ref: callback_ref,
            failed: false,
            data: value
          });
        }).catch((err) => {
          port.postMessage({
            callback_ref: callback_ref,
            failed: true,
            data: e.message
          });
        });
      } else {
        port.postMessage({
          callback_ref: callback_ref,
          failed: false,
          data: result
        });
      }
    };
  });
};

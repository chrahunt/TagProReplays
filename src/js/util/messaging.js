const logger = require('util/logger')('messaging');

/**
 * Messaging utilities.
 */
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
class Sandbox {
  /**
   * Injects a new iframe into the current page 
   */
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

let setPortListener = () => {
  return new Promise((resolve, reject) => {
    onmessage = (e) => {
      logger.debug('Received window message.');
      let port = e.ports[0];
      resolve(port);
    };
  });
};

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
      Promise.resolve(data)
      .then(callback)
      .then((value) => {
        port.postMessage({
          callback_ref: callback_ref,
          failed: false,
          data: value
        });
      })
      .catch((err) => {
        console.debug(`Propagating error from sandbox: ${err}`);
        port.postMessage({
          callback_ref: callback_ref,
          failed: true,
          data: err.message
        });
      });
    };
  });
};

/**
 * Promise interface around content script to background page
 * request/response communication.
 * 
 * Usage:
 * 
 *   # content_script.js
 *   const Client = require('messaging').Client();
 *   Client.send('person.add', {
 *     first_name: 'john',
 *     last_name: 'doe'
 *   }).then((id) => {
 *     console.log('Added successfully!');
 *   }).catch((err) => {
 *     console.warn('Error adding record: ', err);
 *   });
 * 
 *   # background.js
 *   const Server = require('messaging').Server();
 *   Server.on('person.add', (data, sender) => {
 *     return db.table('people').add(data).then(() => {
 *       console.log('Added to db.');
 *     });
 *   });
 */
/**
 * Promise interface for content scripts to communicate with
 * extension background page.
 */
class Client {
  /**
   * Send a named message to the background page.
   * @param {string} name
   * @param {*} message
   * @returns {Promise}
   */
  send(name, message) {
    return new Promise((resolve, reject) => {
      logger.debug(`Sending ${name}`);
      chrome.runtime.sendMessage({
        method: name,
        data: message
      }, (result) => {
        logger.debug(`Received response for ${name}`);
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.error) {
          reject(result.data.message);
        } else {
          resolve(deserialize_error(result.data));
        }
      });
    });
  }
}
exports.Client = getInstance(Client);

function deserialize_error(struct) {
  let err = new Error(struct.message);
  err.name = struct.name;
  err.stack = struct.stack
  return err;
}

/**
 * Background-page side of the interface.
 * 
 * Only a single callback can be set per message type.
 */
class Server {
  constructor(options) {
    this.callbacks = new Map();
    options.addListener(this.handle_message.bind(this));
  }

  /**
   * Listen for a message from a content script.
   * 
   * Only a single callback can be set per message type.
   * @param {string} name
   * @param {Function} callback - takes data and sender.
   */
  on(name, callback) {
    if (this.callbacks.has(name))
      throw new Error(`Callback already set for ${name}`);
    this.callbacks.set(name, callback);
  }

  /**
   * Remove the given callback from listening.
   */
  removeListener(name, callback) {
    let existing_callback = this.callbacks.get(name);
    if (!existing_callback || callback !== existing_callback)
      throw new Error(`Callback not set for ${name}`);
    this.callbacks.remove(name);
  }

  /**
   * @private
   */
  handle_message(message, sender, sendResponse) {
    let {method, data} = message;
    this.listener_delegate(method, data, sender).then((result) => {
      sendResponse({
        data: result
      });
    }).catch((err) => {
      sendResponse({
        error: serialize_error(err)
      });
    });
    return true;
  }

  /**
   * @private
   */
  listener_delegate(method, message, sender) {
    return new Promise((resolve, reject) => {
      if (!method) {
        logger.warn(`Invalid message: ${message}`);
        reject(new Error('Empty method received.'));
      } else {
        let callback = this.callbacks.get(method);
        if (!callback) {
          logger.warn(`Callback not found for ${method}`);
          reject(new Error('No callback'));
        } else {
          resolve(callback(message, sender));
        }
      }
    });
  }
}

/**
 * Overridden in tests. Sets Server callback expecting
 * message, sender, sendResponse.
 * @private
 */
exports._serverListener = (handler) => {
  chrome.runtime.onMessage.addListener(handler);
};

exports.Server = getInstance(Server, {
  get addListener() {
    return exports._serverListener;
  }
});

function serialize_error(err) {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack
  };
}

function getInstance(klass, ...args) {
  let instance;
  return () => {
    if (!instance) instance = new klass(...args);
    return instance;
  };
}

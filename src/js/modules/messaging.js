var EventEmitter = require('events').EventEmitter;

var Chrome = require('./chrome');

var logger = require('./logger')('messaging');

logger.info('Starting Messaging');

/**
 * Messenger interface for Content Script<->Background page
 * communication.
 *
 * Functions:
 * * listen
 *   @param {(string|Array.<string>} names - name or names of messages
 *     to listen for.
 *   @param {ListenCallback} callback - the function to call if a
 *     message is received
 * * send (content script) - send a message to the background page
 *   @param {string} name - the name of the message
 *   @param {*} [message] - message to send; if provided, must be
 *     possible to create a structured clone.
 *   @param {Function} [callback] - the callback function that will be
 *     called if the listener calls `sendResponse`.
 * * send (background page) - broadcast message to all connected tabs
 *   @param {string} name - the name of the message
 *   @param {*} [message] - the message to send
 * * removeListener
 *
 * When loaded in a content script, attempts to open a
 * port to the background page. When used in the background page,
 * tracks all ports that have connected and allows sending a message
 * to all of them at once. Also offers callback capability (the same as
 * sendResponse in chrome.runtime.postMessage) for messages sent from
 * content scripts to the background page.
 */
/**
 * Has similar interface as `chrome.runtime.onMessage.addListener`
 * callback.
 * @typedef {Function} ListenCallback
 * @param {*} message - the passed message, if any.
 * @param {Sender} sender - same as callback
 * @param {Function} sendResponse - callback function; if going to call,
 *   then the ListenCallback must return true.
 */
/**
 * Holds arrays of listener functions with keys corresponding to the
 * message name.
 * @type {Object}
 */
var listeners = {};

// Promise response management for content scripts.
var promises = new Map();
var promise_i = 0;

function setPromise(id, resolve, reject) {
  promises.set(id, {
    resolve: resolve,
    reject: reject
  });
  return id;
}

function resolvePromise(id, ...args) {
  var promise = promises.get(id);
  promises.delete(id);
  return promise.resolve(...args);
}

function rejectPromise(id, ...args) {
  var promise = promises.get(id);
  promises.delete(id);
  return promise.reject(...args);
}

/**
 * @typedef {object} Message
 * @property {string} type - "system" or "main"
 * @property {string} name - The name of the message.
 * @property {*} data - The data to be sent. An empty object by
 *   default.
 * @property {number} callback - The id of the callback function
 *   to invoke.
 */
/**
 * Send function used for normal messages in both content scripts and
 * the background page.
 * @param {string} name - The name of the message to send.
 * @param {*} [message] - The message to send.
 * @param {Function} callback - The callback
 * @return {[type]} [description]
 */

// Wrap outgoing foreground messages.
function foregroundWrapper(name, message) {
  var data = {
    type: 'main',
    name: name,
    data: message
  };
  data.promise_id = ++promise_i;

  return {
    wrapped: data,
    promise: new Promise((resolve, reject) => {
      setPromise(data.promise_id, resolve, reject);
    })
  };
}

// Wrap outgoing background messages.
function backgroundWrapper(name, message) {
  return {
    type: 'main',
    name: name,
    data: message
  };
}

/**
 * Set listener for the background page.
 *
 * All messages are main, no callbacks.
 */
function backgroundListen(port) {
  function serialize(data) {
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack
      };
    } else {
      return data;
    }
  }

  port.onMessage.addListener((message, sender) => {
    logger.debug(`port#onMessage: [type:${message.type}], [name:${message.name}]`);
    var method = message.name;
    var data = message.data || {};
    if (listeners.hasOwnProperty(method)) {
      listeners[method].forEach((listener) => {
        // There should always be a callback id.
        var promise_id = message.promise_id;
        var result = listener(data, sender);
        if (result && result.then) {
          result.then((result) => {
            port.postMessage({
              type: 'system',
              name: 'promise',
              id: promise_id,
              status: 'fulfilled',
              data: result
            })
          }).catch((err) => {
            port.postMessage({
              type: 'system',
              name: 'promise',
              id: promise_id,
              status: 'rejected',
              data: serialize(err)
            });
          });
        } else {
          port.postMessage({
            type: 'system',
            name: 'promise',
            id: promise_id,
            status: 'fulfilled',
            data: null
          });
        }
      });
    }
  });
}

function foregroundListen(port) {
  // Listen for messages over port.
  port.onMessage.addListener((message, sender) => {
    logger.debug(`port#onMessage: [type:${message.type}], [name:${message.name}]`);
    if (message.type == "main") {
      var method = message.name;
      var data = message.data || {};
      if (listeners.hasOwnProperty(method)) {
        listeners[method].forEach((listener) => {
          listener.call(null, data, sender);
        });
      }
    } else if (message.type == 'system') {
      if (message.name == 'promise') {
        var promise_id = message.id;
        if (message.status == 'fulfilled') {
          resolvePromise(promise_id, message.data);
        } else if (message.status == 'rejected') {
          rejectPromise(promise_id, message.data);
        }
      }
    }
  });
}

class Messenger extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    // For foreground page management.
    this.port = null;
    // For background page management.
    this.ports = {};
    // Be the foreground page unless we find out otherwise.
    this._send = (name, message) => {
      let {wrapped, promise} = foregroundWrapper(name, message);
      this.queue.push(wrapped);
      return promise;
    };
    this._init();
  }

  // Sets _send function.
  _init() {
    Chrome.isBackground().then((isbackground) => {
      if (isbackground) {
        // Background page port management.
        // Listen for incoming page ports.
        chrome.runtime.onConnect.addListener((port) => {
          this.emit("connect", port.sender);
          var id = getId(port.id, port.sender);
          this.ports[id] = port;
          backgroundListen(port);
          // Action on port disconnection.
          port.onDisconnect.addListener(() => {
            this.emit("disconnect", port.sender);
            delete this.ports[id];
          });
        });

        // No callback on background page.
        this._send = (name, message) => {
          message = backgroundWrapper(name, message);
          for (let id in this.ports) {
            this.ports[id].postMessage(message);
          }
        };
        // Discard queued.
        this.queue = null;
      } else {
        // Non-background page, single port.
        this.port = chrome.runtime.connect({
          name: performance.now().toString()
        });
        foregroundListen(this.port);
        this._send = (name, message) => {
          let {wrapped, promise} = foregroundWrapper(name, message);
          this.port.postMessage(wrapped);
          return promise;
        };

        // Replay queued messages.
        this.queue.forEach((wrapped) => {
          this.port.postMessage(wrapped);
        });
        // don't keep it around.
        this.queue = null;
      }
    });
  }
}

var unmarked = 0;

function getId(id, sender) {
  if (sender && sender.tab && sender.tab.id) {
    return `${id}-${sender.tab.id}`;
  } else {
    return `${id}--${++unmarked}`;
  }
}

/**
 * Callback that is called with the message sent from either the
 * @callback BackgroundMessageCallback
 */
/**
 * Callback called when a message is sent from the background page to
 * a content script.
 * @callback ContentScriptCallback
 * @param {*} [message] - Object passed from background page in call
 *   to send.
 */
/**
 * [listen description]
 * @param {(string|Array<string>)} names - The name of the messages to
 *   listen for.
 * @param {MessageCallback} callback - The callback function called
 *   with the message.
 * @return {[type]} [description]
 */
Messenger.prototype.listen = function (names, callback) {
  if (typeof names == 'string') names = [names];
  names.forEach((name) => {
    if (!listeners.hasOwnProperty(name)) {
      listeners[name] = [];
    }
    listeners[name].push(callback);
  });
};

// Remove a listener.
Messenger.prototype.removeListener = function (name, callback) {
  if (listeners.hasOwnProperty(name)) {
    var i = listeners[name].indexOf(callback);
    if (i !== -1) {
      listeners[name].splice(i, 1);
    }
  }
};

Messenger.prototype.send = function (name, message, callback) {
  return this._send(name, message, callback);
};

module.exports = new Messenger();

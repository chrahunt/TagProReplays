var util = require('util');
var EventEmitter = require('events').EventEmitter;

var logger = require('./logger')('messaging');

/**
 * Messenger interface for Content Script<->Background page
 * communication.
 * 
 * Functions:
 * * listen
 *   @param {(string|Array.<string>} names - name or names of messages
 *     to listen for.
 *   @param {ListenCallback} callback - the function to call if a message is
 *   received
 * * send (content script) - send a message to the background page
 *   @param {string} name - the name of the message
 *   @param {*} [message] - message to send; if provided, must be possible
 *     to create a structured clone.
 *   @param {Function} [callback] - the callback function that will be called
 *     if the listener calls `sendResponse`.
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
 * Has similar interface as `chrome.runtime.onMessage.addListener` callback.
 * @typedef {Function} ListenCallback
 * @param {*} message - the passed message, if any.
 * @param {Sender} sender - same as callback
 * @param {Function} sendResponse - callback function; if going to call, then
 *   the ListenCallback must return true.
 */
/**
 * Holds arrays of listener functions with keys corresponding to the message
 * name.
 * @type {Object}
 */
var listeners = {};

// Callback management for content scripts.
var callbacks = new Map();
var callback_i = 1;

function setCallback(callback) {
    var id = callback_i++;
    callbacks.set(id, callback);
    return id;
}

function getCallback(id) {
    var callback = callbacks.get(id);
    if (callback) {
        removeCallback(id);
        return callback;
    } else {
        return false;
    }
}

function removeCallback(id) {
    delete callbacks.delete(id);
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
function commonSend(name, message, callback) {
    if (typeof message == "function") {
        callback = message;
        message = {};
    }

    var data = {
        type: "main",
        name: name,
        data: message
    };

    if (callback) {
        data.callback_id = setCallback(callback);
    }
    return data;
}

var background = false;

// Set listener for both sides of port.
function listenPort(port) {
    // Send callback message.
    function sendCallback(data) {
        port.postMessage({
            type: "system",
            name: "callback",
            data: data
        });
    }

    // Listen for messages over port.
    port.onMessage.addListener(function (message, sender) {
        logger.debug(`port#onMessage: [type:${message.type}], [name:${message.name}]`);
        if (message.type == "main") {
            var method = message.name;
            var data = message.data || {};
            if (listeners.hasOwnProperty(method)) {
                listeners[method].forEach(function (listener) {
                    if (background) {
                        var callback_id = message.callback_id;
                        if (callback_id) {
                            var sync = true;
                            // Whether function was called.
                            var called = false;
                            var arg;
                            // Listener function returns true if callback may
                            // be called, false otherwise.
                            var mayCall = listener.call(null, data, sender, function (response) {
                                if (sync) {
                                    // Callback was called synchronously.
                                    called = true;
                                    arg = response;
                                } else {
                                    // Callback was called asynchronously.
                                    if (mayCall) {
                                        sendCallback({
                                            id: callback_id,
                                            called: true,
                                            response: response
                                        });
                                    } else {
                                        // Error, calling callback without returning true.
                                        logger.error("Calling callback without " +
                                            `returning 'true': ${method}`);
                                    }
                                }
                            });
                            if (mayCall && called) {
                                sendCallback({
                                    id: callback_id,
                                    called: true,
                                    response: arg
                                });
                            } else if (!mayCall) {
                                sendCallback({
                                    id: callback_id,
                                    called: false
                                });
                            }
                            sync = false;
                        } else {
                            listener.call(null, data, sender, function () {
                                logger.error("Listener called callback, " +
                                    `but none was defined with message: ${method}`);
                            });
                        }
                    } else {
                        listener.call(null, data, sender);
                    }
                });
            }
        } else if (message.type == "system") {
            if (message.name == "callback") {
                var callback_data = message.data;
                if (callback_data.called) {
                    var callback = getCallback(callback_data.id);
                    if (callback) {
                        //console.log("Calling callback: %d.", callback_data.id);
                        callback.call(null, callback_data.response);
                    } else {
                        logger.error(`Callback called, but doesn't exist. id: ${callback_data.id}`);
                    }
                } else {
                    // Callback not called, remove.
                    removeCallback(callback_data.id);
                }
            }
        }
    });
}

function Messenger() {
    EventEmitter.call(this);
    this.queue = [];
    this._send = (name, message, callback) => {
        this.queue.push([name, message, callback]);
    };
    this._init();
}
util.inherits(Messenger, EventEmitter);

var unmarked = 0;

function getId(id, sender) {
    if (sender && sender.tab && sender.tab.id) {
        return `${id}-${sender.tab.id}`;
    } else {
        return `${id}--${++unmarked}`;
    }
}

Messenger.prototype._init = function() {
    // Sets `send` function.
    onBackgroundPage().then((isbackground) => {
        if (isbackground) {
            background = true;
            // Background page port management.
            var ports = {};
            // Listen for incoming page ports.
            chrome.runtime.onConnect.addListener((port) => {
                this.emit("connect", port.sender);
                var id = getId(port.id, port.sender);
                ports[id] = port;
                listenPort(port);
                // Action on port disconnection.
                port.onDisconnect.addListener(() => {
                    this.emit("disconnect", port.sender);
                    delete ports[id];
                });
            });

            // No callback on background page.
            this._send = function (name, message) {
                message = commonSend(name, message);
                for (var id in ports) {
                    var port = ports[id];
                    port.postMessage(message);
                }
            };
        } else {
            // Non-background page, single port.
            var port = chrome.runtime.connect({
                name: performance.now().toString()
            });
            listenPort(port);
            this._send = function (name, message, callback) {
                return new Promise((resolve, reject) => {
                    message = commonSend(name, message, function() {
                        callback && callback(...arguments);
                        resolve(...arguments);
                    });
                    port.postMessage(message);
                });
            };
        }

        // Replay queued messages.
        this.queue.forEach((args) => {
            this._send.apply(null, args);
        });
        // don't keep it around.
        this.queue = null;
    });
};

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
    names.forEach(function(name) {
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

Messenger.prototype.send = function(name, message, callback) {
    return this._send(name, message, callback);
};

module.exports = new Messenger();

/**
 * Determine whether the script is running in a background page
 * context.
 * @return {Promise<boolean>} - Whether the script is running on the
 *   background page.
 */
function onBackgroundPage() {
    if (location.protocol != "chrome-extension:") {
        return Promise.resolve(false);
    } else {
        return new Promise((resolve, reject) => {
            chrome.runtime.getBackgroundPage((that) => {
                resolve(that === global);
            });
        });
    }
}

/**
 * Messenger interface for Content Script<->Background page
 * communication. When loaded in a content script, attempts to open a
 * port to the background page. When used in the background page,
 * tracks all ports that have connected and allows sending a message
 * to all of them at once. Also offers callback capability (the same as
 * sendResponse in chrome.runtime.postMessage) for messages sent from
 * content scripts to the background page.
 */

/**
 * Holds listener functions with keys corresponding to the message
 * id.
 * @type {Object}
 */
var listeners = {};

function getId(id, sender) {
    if (sender && sender.tab && sender.tab.id) {
        return id + "-" + sender.tab.id;
    } else {
        return id + "-" + performance.now();
    }
}

// Callback management for content scripts.
var callbacks = {};
var callback_i = 1;

function setCallback(callback) {
    var id = callback_i++;
    callbacks[id] = callback;
    return id;
}

function getCallback(id) {
    var callback = callbacks[id];
    if (callback) {
        removeCallback(id);
        return callback;
    } else {
        return false;
    }
}

function removeCallback(id) {
    delete callbacks[id];
}

/**
 * @typedef {object} Message
 * @property {string} name - The name of the message.
 * @property {*} data - The data to be sent. An empty object by
 *   default.
 * @property {number} callback - The id of the callback function
 *   to invoke.
 */
/**
 * @typedef {object} SystemMessage
 * @property {string} _name
 * @property {[type]} [propName] [description]
 */
/**
 * Send function used on both content scripts and background page.
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
        name: name,
        data: message
    };

    if (callback) {
        data.callback = setCallback(callback);
    }
    return data;
}

// Set listener on port.
function listenPort(port) {
    // Listen for messages over port.
    port.onMessage.addListener(function (message, sender) {
        var method = message.name;
        if (method) {
            if (listeners[method]) {
                var listener = listeners[method];
                var data = message.data || {};
                //data.method = method;
                var callback_id = message.callback;
                if (callback_id) {
                    // Handle case where callback was called asynchronously by the .
                    var sync = true;
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
                            var message = {
                                _name: "callback",
                                _data: {
                                    id: callback_id
                                }
                            };
                            if (mayCall) {
                                message._data.called = true;
                                message._data.response = response;
                            } else {
                                message._data.called = false;
                            }
                            port.postMessage(message);
                        }
                    });
                    if (mayCall && called) {
                        port.postMessage({
                            _name: "callback",
                            _data: {
                                id: callback_id,
                                called: true,
                                response: arg
                            }
                        });
                    } else if (!mayCall) {
                        port.postMessage({
                            _name: "callback",
                            _data: {
                                id: callback_id,
                                called: false
                            }
                        });
                    }
                    sync = false;
                } else {
                    listener.call(null, data, sender);
                }
            }
        } else if (message._name) {
            // System messages.
            if (message._name === "callback") {
                var callback_data = message._data;
                if (callback_data.called) {
                    var callback = getCallback(callback_data.id);
                    if (callback) {
                        //console.log("Calling callback: %d.", callback_data.id);
                        callback.call(null, callback_data.response);
                    } else {
                        console.error("Callback called, but doesn't exist. id: %d", callback_data.id);
                    }
                } else {
                    // Callback not called, remove.
                    removeCallback(callback_data.id);
                }
            }
        }
    });
}

exports.listen = function (names, callback) {
    if (typeof names == 'string') names = [names];
    names.forEach(function(name) {
        listeners[name] = callback;
    });
};

exports.removeListener = function (names) {
    if (typeof names == 'string') names = [names];
    names.forEach(function (name) {
        delete listeners[name];
    });
};

if (onBackgroundPage()) {
    // Background page port management.
    var ports = {};
    // Listen for incoming page ports.
    chrome.runtime.onConnect.addListener(function (port) {
        var id = getId(port.id, port.sender);
        ports[id] = port;
        listenPort(port);
        // Action on port disconnection.
        port.onDisconnect.addListener(function () {
            delete ports[id];
        });
    });

    // Omitting callback for the moment.
    exports.send = function (name, message) {
        message = commonSend(name, message);
        for (var id in ports) {
            var port = ports[id];
            port.postMessage(message);
        }
    };
} else {
    var port = chrome.runtime.connect({
        name: performance.now().toString()
    });
    listenPort(port);
    exports.send = function (name, message, callback) {
        message = commonSend(name, message, callback);
        port.postMessage(message);
    };
}

/**
 * Determine whether the script is running in a background page
 * context.
 * @return {boolean} - Whether the script is running on the
 *   background page.
 */
function onBackgroundPage() {
    return location.protocol == "chrome-extension:";
}

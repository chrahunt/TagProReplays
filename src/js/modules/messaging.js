/**
 * Methods for setting chrome message listeners. Objects being passed
 * by methods in this library have the corresponding message name
 * stored in the `method` property of the message object.
 */

/**
 * Holds listener functions with keys corresponding to the message
 * id.
 * @type {Object}
 */
var listeners = {};

/**
 * Listener for `chrome.runtime.onMessage`.
 */
function listener(message, sender, sendResponse) {
    if (message.method && listeners[message.method]) {
        return listeners[message.method].call(this, message, sender, sendResponse);
    }
}

function getId(id, sender) {
    if (sender && sender.tab && sender.tab.id) {
        return id + "-" + sender.tab.id;
    } else {
        return id + "-" + performance.now();
    }
}

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

// Message may be anything.
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
                data.method = method;
                var callback_id = message.callback;
                if (callback_id) {
                    // Whether sendResponse was called synchronously.
                    var sync = true;
                    var called = false;
                    var arg;
                    var result = listener.call(null, data, sender, function (response) {
                        if (sync) {
                            called = true;
                            arg = response;
                        } else {
                            var message = {
                                _name: "callback",
                                _data: {
                                    id: callback_id
                                }
                            };
                            if (result) {
                                message._data.called = true;
                                message._data.response = response;
                            } else {
                                message._data.called = false;
                            }
                            port.postMessage(message);
                        }
                    });
                    if (result && called) {
                        port.postMessage({
                            _name: "callback",
                            _data: {
                                id: callback_id,
                                called: true,
                                response: arg
                            }
                        });
                    } else if (!result) {
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

if (onBackgroundPage()) {
    var ports = {};
    var callbacks = {};
    var callback_i = 0;
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

    module.exports = {
        // Omitting callback for the moment.
        send: function (name, message) {
            message = commonSend(name, message);
            for (var id in ports) {
                var port = ports[id];
                port.postMessage(message);
            }
        },
        listen: function (names, callback) {
            if (typeof names == 'string') names = [names];
            names.forEach(function(name) {
                listeners[name] = callback;
            });
        }
    };
} else {
    var port = chrome.runtime.connect({
        name: performance.now().toString()
    });
    listenPort(port);
    module.exports = {
        send: function (name, message, callback) {
            message = commonSend(name, message, callback);
            port.postMessage(message);
        },
        listen: function (names, callback) {
            if (typeof names == 'string') names = [names];
            names.forEach(function(name) {
                listeners[name] = callback;
            });
        }
    };
}
//chrome.runtime.onMessage.addListener(listener);

/**
 * Callback function to send message to multiple tabs.
 * @callback TabCallback
 * @param {integer} id - The id of the matched tab.
 */
/**
 * Call the callback function for each tab that may have a UI.
 * @param {TabCallback} callback - The function to be called with the
 *   tab information.
 */
function getTabs(callback) {
    // Send new replay notification to any tabs that may have menu.
    chrome.tabs.query({
        url: [
            "http://*.koalabeast.com/*",
            "http://*.newcompte.fr/*",
            "http://tangent.jukejuice.com/*"
        ]
    }, function(tabs) {
        var ids = tabs.map(function (tab) {
            return tab.id || null;
        }).filter(function (id) {
            return id !== null;
        });
        callback(ids);
    });
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

var Messaging = function() {};

/**
 * Register a function as a listener for the specific message. If
 * a callback listening for the specified message is already
 * present then it will be overwritten.
 * @param  {(string|Array.<string>} name - The message type(s) to
 *   listen for. If an array of strings is passed then the callback
 *   will be set for each of the names given in the array.
 * @param  {Function} callback - Function which will be forwarded the
 *   parameters passed from `onMessage`.
 */
Messaging.prototype.listen = function(names, callback) {
    if (typeof names == 'string') names = [names];
    names.forEach(function(name) {
        listeners[name] = callback;
    });
};

/**
 * Sends a message to the background page or content script when
 * called from a content script or the background page,
 * respectively. Can be called with either one or both of message
 * or callback omitted.
 * @param {string} name - The name of the message to send.
 * @param {object} [message] - The information to send along with
 *   the message.
 * @param {Function} [callback] - The callback function to be
 *   associated with the message.
 * @return {Promise?} - If called on the background page, returns
 *   a promise that resolves after the message has been sent.
 */
Messaging.prototype.send = function(name, message, callback) {
    if (typeof message == "function") {
        callback = message;
        message = {};
    }
    message.method = name;

    if (onBackgroundPage()) {
        return new Promise(function (resolve, reject) {
            getTabs(function(ids) {
                ids.forEach(function (id) {
                    chrome.tabs.sendMessage(id, message);
                });
                resolve();
            });
        });
    } else {
        if (callback) {
            chrome.runtime.sendMessage(message, callback);
        } else {
            chrome.runtime.sendMessage(message);
        }
    }
};

//module.exports = new Messaging();

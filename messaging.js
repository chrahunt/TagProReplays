/**
 * Methods for setting chrome message listeners. Objects being passed
 * by methods in this library have the corresponding message name
 * stored in the `method` property of the message object.
 */
(function(window) {
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

    chrome.runtime.onMessage.addListener(listener);

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
    window.messageListener = function(names, callback) {
        if (typeof names == 'string') names = [names];
        names.forEach(function(name) {
            listeners[name] = callback;
        });
    };

    /**
     * Sends a message to the background page or content script when
     * called from a content script or the background page,
     * respectively. Just a wrapper around chrome.runtime.sendMessage.
     * Can be called with either one or both of message or callback
     * omitted.
     * @param {string} name - The name of the message to send.
     * @param {object} [message] - The information to send along with
     *   the message.
     * @param {Function} [callback] - The callback function to be
     *   associated with the message.
     */
    window.sendMessage = function(name, message, callback) {
        if (typeof message == "function") {
            callback = message;
            message = {};
        }
        message.method = name;
        if (callback) {
            chrome.runtime.sendMessage(message, callback);
        } else {
            chrome.runtime.sendMessage(message);
        }
    };
})(window);

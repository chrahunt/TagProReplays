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
     * Callback function to send message to multiple tabs.
     * @callback TabCallback
     * @param {integer} id - The id of the matched tab.
     */
    /**
     * Call the callback function for each tab that may have a UI.
     * @param {TabCallback} callback - The function to be called with the
     *   tab information.
     */
    function sendToTabs(callback) {
        // Send new replay notification to any tabs that may have menu.
        chrome.tabs.query({
            url: [
                "http://*.koalabeast.com/*",
                "http://*.newcompte.fr/*",
                "http://tangent.jukejuice.com/*"
            ]
        }, function(tabs) {
            tabs.forEach(function(tab) {
                if (tab.id) {
                    callback(tab.id);
                }
            });
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
     * @param {integer} [id] - The (optional) id of the tab to send the
     *   message to, when sending from the background page. If not
     *   provided, message is sent to all possibly-relevant tabs.
     * @param {string} name - The name of the message to send.
     * @param {object} [message] - The information to send along with
     *   the message.
     * @param {Function} [callback] - The callback function to be
     *   associated with the message.
     */
    window.sendMessage = function(id, name, message, callback) {
        if (typeof id == "string") {
            callback = message;
            message = name;
            name = id;
            id = null;
        }
        if (typeof message == "function") {
            callback = message;
            message = {};
        }
        message.method = name;

        if (onBackgroundPage()) {
            sendToTabs(function(id) {
                chrome.tabs.sendMessage(id, message);
            });
        } else {
            if (callback) {
                chrome.runtime.sendMessage(message, callback);
            } else {
                chrome.runtime.sendMessage(message);
            }
        }
    };
})(window);

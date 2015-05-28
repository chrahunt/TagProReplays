/**
 * Messaging via the DOM for injected<->content script communication.
 */
exports.send = function(name, data) {
    var e = new CustomEvent(event, { detail: data });
    window.dispatchEvent(e);
};

// this function sets up a listener wrapper
exports.listen = function(event, callback) {
    window.addEventListener(event, function (e) {
        callback(e.detail);
    });
};

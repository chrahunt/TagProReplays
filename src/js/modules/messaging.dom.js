/**
 * Messaging via the DOM for injected<->content script communication.
 */

var listeners = {};

window.addEventListener("message", (evt) => {
  if (evt.source != window) return;

  var name = evt.data.name;
  if (name && listeners.hasOwnProperty(name)) {
    listeners[name].forEach((listener) => {
      listener.call(null, evt.data.message);
    });
  }
});

// this function sets up a listener wrapper
exports.listen = function (name, callback) {
  if (!listeners.hasOwnProperty(name)) {
    listeners[name] = [];
  }
  listeners[name].push(callback);
};


exports.send = function (name, message) {
  window.postMessage({
    name: name,
    message: message
  }, "*");
};

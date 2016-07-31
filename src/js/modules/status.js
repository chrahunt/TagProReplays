var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Messaging = require('./messaging');

var logger = require('./logger')('status');

/**
 * Client-side FSM updates.
 */
function Status() {
  EventEmitter.call(this);
}
util.inherits(Status, EventEmitter);

/**
 * Retrieve the extension background page status.
 * @return {Promise} - Resolves to status.
 */
Status.prototype.get = function () {
  return new Promise((resolve, reject) => {
    Messaging.send("_get_state", (result) => {
      resolve(result.state);
    });
  });
};

Status.prototype.force = function () {
  logger.info("Status#force");
  var self = this;
  this.get().then((status) => {
    logger.info(`Retrieved state: ${status}`);
    self.emit(status);
  }).catch((err) => {
    logger.warn("Error retrieving status: ", err);
  });
};

var status = new Status();
module.exports = status;

Messaging.listen("_state_transition", (message) => {
  var name = message.to;
  var old = message.from;
  var transition = old + "->" + name;
  [transition, name].forEach((name) => {
    status.emit(name);
  });
});

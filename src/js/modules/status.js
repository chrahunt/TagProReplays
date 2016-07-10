var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Messaging = require('./messaging');

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
Status.prototype.get = function() {
    return new Promise(function (resolve, reject) {
        Messaging.send("_get_state", function (result) {
            resolve(result.state);
        });
    });
};

Status.prototype.force = function() {
    console.log("Status#force");
    var self = this;
    this.get().then(function (status) {
        console.log(`Retrieved state: ${status}`);
        self.emit(status);
    }).catch(function (err) {
        console.warn("Error retrieving status: %o.", err);
    });
};

var status = new Status();
module.exports = status;

Messaging.listen("_state_transition",
function (message, sender) {
    var name = message.to;
    var old = message.from;
    var transition = old + "->" + name;
    [transition, name].forEach(function (name) {
        status.emit(name);
    });
});

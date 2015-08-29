var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Storage = require('./storage');
var DEFAULT = "idle";

function Status() {
    EventEmitter.call(this);
}
util.inherits(Status, EventEmitter);

/**
 * Set the status for the background page.
 * @param {string} status - The status to set for the background page.
 * @return {Promise} - resolves if ok, rejects if err.
 */
Status.prototype.set = function(status) {
    return Storage.set({
        status: status
    });
};

/**
 * Retrieve the extension background page status.
 * @return {Promise} - Resolves to status.
 */
Status.prototype.get = function() {
    return Storage.get("status").then(function (items) {
        if (!items.hasOwnProperty("status"))
            throw new Error("No status found!");
        else
            return items.status;
    });
};

/**
 * Reset the background page status to default.
 * see `set` for return.
 */
Status.prototype.reset = function() {
    return this.set(DEFAULT);
};

Status.prototype.force = function() {
    var self = this;
    this.get().then(function (status) {
        self.emit(status);
    }).catch(function (err) {
        console.warn("Error retrieving status: %o.", err);
    });
};

var status = new Status();
module.exports = status;

chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === "local") {
        if (changes.hasOwnProperty("status")) {
            var name = changes.status.newValue;
            var old = changes.status.oldValue;
            var transition = old + "->" + name;
            [transition, name].forEach(function (name) {
                status.emit(name);
            });
        }
    }
});

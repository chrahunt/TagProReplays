var Storage = require('./storage');
var DEFAULT = "idle";

var Status = {
    /**
     * Set the status for the background page.
     * @param {string} status - The status to set for the background page.
     * @return {Promise} - resolves if ok, rejects if err.
     */
    set: function(status) {
        return Storage.set({
            status: status
        });
    },
    /**
     * Retrieve the extension background page status.
     * @return {Promise} - Resolves to status.
     */
    get: function() {
        return Storage.get("status").then(function (items) {
            if (!items.hasOwnProperty("status"))
                throw new Error("No status found!");
            else
                return items.status;
        });
    },
    /**
     * Reset the background page status to default.
     * see `set` for return.
     */
    reset: function() {
        return this.set(DEFAULT);
    },
    changeListeners: {},
    /**
     * Listen for a change to the extension status.
     * @param {Function} callback - Callback which takes the old and new status names.
     */
    on: function(name, callback) {
        if (!this.changeListeners.hasOwnProperty(name)) {
            this.changeListeners[name] = [];
        }
        this.changeListeners[name].push(callback);
    },
    emit: function(status) {
        if (this.changeListeners.hasOwnProperty(status)) {
            this.changeListeners[status].forEach(function (callback) {
                callback();
            });
        }
    },
    force: function() {
        var self = this;
        this.get().then(function (status) {
            self.emit(status);
        }).catch(function (err) {
            console.warn("Error retrieving status: %o.", err);
        });
    }
};

module.exports = Status;

chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === "local") {
        if (changes.hasOwnProperty("status")) {
            var name = changes.status.newValue;
            var old = changes.status.oldValue;
            var transition = old + "->" + name;
            [transition, name].forEach(function (name) {
                Status.emit(name);
            });
        }
    }
});

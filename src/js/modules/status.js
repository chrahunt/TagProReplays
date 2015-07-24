var Status = {
    /**
     * Add a status for the background page.
     * @param {string} status - The status to add to the list of
     *   conditions impacting the background page.
     * @param {Function} callback - Callback to receive the status of the
     *   request. Typical err param.
     */
    add: function(status, callback) {
        this.get(function (err, statuses) {
            if (err) {
                callback(err);
            } else if (statuses.indexOf(status) === -1) {
                // Only add if not already present.
                statuses.push(status);
                this._set(statuses);
            }
        }.bind(this));
    },
    /**
     * Set statuses in chrome storage.
     * @private
     */
    _set: function(statuses, callback) {
        chrome.storage.local.set({
            status: statuses
        }, function () {
            if (chrome.runtime.lastError) {
                console.error("Error saving status: " + chrome.runtime.lastError);
                if (callback)
                    callback(chrome.runtime.lastError);
            } else {
                if (callback)
                    callback(null);
            }
        });
    },
    remove: function(status, callback) {
        this.get(function (err, statuses) {
            if (err) {
                callback(err);
            } else {
                var index = statuses.indexOf(status);
                if (index !== -1) {
                    statuses.splice(index, 1);
                    this._set(statuses);
                }
            }
        }.bind(this));
    },
    /**
     * Retrieve the extension background page status.
     * @return {string} - The current status of the background page.
     */
    get: function(callback) {
        chrome.storage.local.get("status", function(items) {
            if (chrome.runtime.lastError) {
                callback(new Error("Error retrieving status: " +
                    chrome.runtime.lastError + ". Let the developers know!"));
            } else {
                var status = items.status;
                if (!status) {
                    callback(new Error("No status found, let the developers know!"));
                } else {
                    callback(null, status);
                }
            }
        });
    },
    changeListeners: [],
    /**
     * Listen for a change to the extension status.
     * @param {Function} callback - Callback which takes the old and new status names.
     */
    onChanged: function(callback) {
        this.changeListeners.push(callback);
    }
};

module.exports = Status;

chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === "local") {
        if (changes.hasOwnProperty("status")) {
            Status.changeListeners.forEach(function(callback) {
                callback.call(null, changes.status.newValue, changes.status.oldValue);
            });
        }
    }
});

// Set initial status.
chrome.storage.local.set({
    status: []
});

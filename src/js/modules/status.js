var DEFAULT = "idle";

var Status = {
    /**
     * Set the status for the background page.
     * @param {string} status - The status to set for the background page.
     * @param {Function} callback - Callback to receive the status of the
     *   request. Typical err param.
     */
    set: function(status, callback) {
        chrome.storage.local.set({
            status: status
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
    /**
     * Reset the background page status to default.
     * See `set` description of callback.
     */
    reset: function(callback) {
        this.set(DEFAULT, callback);
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

/**
 * Determine whether the script is running in a background page
 * context.
 * @return {boolean} - Whether the script is running on the
 *   background page.
 */
function onBackgroundPage() {
    return location.protocol == "chrome-extension:";
}

if (onBackgroundPage()) {
    // Set initial status.
    chrome.storage.local.set({
        status: DEFAULT
    });
}

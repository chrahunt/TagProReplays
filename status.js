/**
 * Set and listen for extension status.
 */
(function(window) {

/**
 * Set extension background page status.
 * @param {string} status - The status to set the background page to,
 *   one of 'loading', 'loaded', 'upgrading', 'rendering'.
 * @param {Function} callback - Callback to receive the status of the
 *   request. Typical err param.
 */
window.setStatus = function(status, callback) {
    chrome.storage.local.set({
        status: status
    }, function() {
        if (chrome.runtime.lastError) {
            console.error("Error saving status: " + chrome.runtime.lastError);
            if (callback)
                callback(chrome.runtime.lastError);
        } else {
            if (callback)
                callback(null);
        }
    });
};

/**
 * Retrieve the extension background page status.
 * @return {string} - The current status of the background page.
 */
window.getStatus = function(callback) {
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
};

var changeListeners = [];
/**
 * Listen for a change to the extension status.
 * @param {Function} callback - Callback which takes the old and new status names.
 */
window.onStatusChange = function(callback) {
    changeListeners.push(callback);
};

chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === "local") {
        if (changes.hasOwnProperty("status")) {
            changeListeners.forEach(function(callback) {
                callback.call(null, changes.status.newValue);
            });
        }
    }
});

})(window);

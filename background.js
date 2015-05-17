/**
 * Acts as the intermediary for content script and background page
 * storage holding replay data and rendered webm movies. Also listens
 * for requests to initiate rendering.
 * 
 * This script is included as a background script.
 */
(function(window) {

/**
 * Set extension background page status.
 * @param {string} status - The status to set the background page to,
 *   one of 'loading', 'loaded', 'upgrading', 'rendering'.
 */
window.setStatus = function(status) {
    sessionStorage.setItem("status", status);
};

/**
 * Retrieve the extension background page status.
 * @return {string} - The current status of the background page.
 */
function getStatus() {
    return sessionStorage.getItem("status");
}

/**
 * Clones an object.
 * @param {object} obj - The object to clone.
 * @return {object} - The cloned object.
 */
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Return the first value in the array that satisfies the given function. Same
 * functionality as `find`.
 */
function first(array, fn) {
  for (var i = 0; i < array.length; i++) {
    if (fn(array[i])) {
      return array[i];
    }
  }
}

/**
 * Generates the information stored separately for the replay.
 * @param {Replay} replay - The replay to generate information for.
 * @return {ReplayInfo} - The information for the replay.
 */
function generateReplayInfo(replay) {
    // Copy replay information.
    // Add player information.
    // Add duration.
    var info = clone(replay.info);
    info.duration = Math.round((1e3 / info.fps) * replay.data.time.length);
    info.players = {};
    // Get player information.
    Object.keys(replay.data.players).forEach(function(id) {
        var player = replay.data.players[id];
        info.players[id] = {
            name: first(player.name, function(v) { return v !== null; }),
            team: first(player.team, function(v) { return v !== null; }),
            id: player.id
        };
    });
    info.rendered = false;
    info.renderId = null;
    return info;
}

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

// Set initial extension status.
setStatus("loading");

/**
 * Functions wrapped in calls to messageListener are invoked by calling
 * sendMessage in content scripts with the string name of the function
 * and an optional message and callback.
 *
 * Where replay id, id of replay, and similar is used in
 * messageListener functions, assume that this refers to the id of the
 * internal replay info, which is what the UI uses.
 */
/**
 * Crops a replay and replaces it in the database.
 * @param {object} message - Has properties `id`, `start`, and `end`
 *   with the id of the replay, and the start and end frames to use.
 * @param {Function} callback - ??
 */
messageListener("cropAndReplaceReplay",
function(message, sender, sendResponse) {
    // Get original replay.
    // Crop.
    // Remove old replay and save new in the same transaction.
});

/**
 * Crop a replay and save it
 * @param {object} message - Has properties `id`, `start`, `end`, and
 *   (optionally) `name` for the id of the replay to crop, the start
 *   and end frames, and the new name to use. If the new name is not
 *   provided then the old name will be used (with ' (cropped)'
 *   appended).
 * @param {Function} callback - Takes the new replay data.
 */
messageListener("cropReplay",
function(message, sender, sendResponse) {
    // Retrieve the replay.
    // Crop the replay.
    // Save the new replay.
    // Return the new replay data.
});

/**
 * Takes replay data from recording script, crops it down to size,
 * and saves it to the database.
 * @param {object} message - Object with `data` property for the new
 *   replay.
 * @param {Function} callback - Callback takes boolean indicating
 *   error.
 */
messageListener("saveReplay",
function(message, sender, sendResponse) {
    // TODO: Validate replay.
    var replay = JSON.parse(message.data);
    // Generate DB Info from Replay.
    var info = generateReplayInfo(replay);
    saveReplay(info, replay, function(err) {
        sendResponse({
            failed: false
        });
        // Send new replay notification to any tabs that may have menu open.
        sendToTabs(function(id) {
            chrome.tabs.sendMessage(id, {
                method: "replayAdded",
                name: name,
                metadata: JSON.stringify(metadata)
            });
        });
    });
    return true;
});

/**
 * Handle imported replay. Replay importing is done 
 * @param {object} message - Object with properties `data` and
 *   `filename` corresponding to the file data and contents.
 * @param {Function} callback - ??
 */
messageListener("importReplay",
function(message, sender, sendResponse) {
    // TODO: Handle validating/converting imported replay.
    // Get replay version.
    // Validate replay against schema.
    // Convert replay to current format if needed.
    // Save replay to database.
    
    var replay = JSON.parse(message.data);
    // Generate DB Info from Replay.
    var info = generateReplayInfo(replay);
    saveReplay(info, replay, function(err) {
        sendResponse({
            failed: false
        });
        // Send new replay notification to any tabs that may have menu open.
        sendToTabs(function(id) {
            chrome.tabs.sendMessage(id, {
                method: "replayAdded",
                data: info
            });
        });
    });
    return true;
});

/**
 * Request for replay data. response should be a function that will
 * take an object with a `data` property which is the replay information.
 * @param {object} message - Should have a property `id` property corresponding
 *   to the replay data is being requested for.
 * @param {Function} callback - Function that takes the retrieved replay data.
 */
messageListener("getReplay",
function(message, sender, sendResponse) {
    // Get replay.
    getReplay(message.id, function(err, data) {
        if (err) {
            // TODO: Handle error.
        } else {
            sendResponse({ data: data });
        }
    });
    return true;
});

/**
 * Gets the list of replays for UI display.
 * @param {Function} callback - Function that handles the list of replays.
 */
messageListener("getReplayList",
function(message, sender, sendResponse) {
    // Iterate over info data in database, accumulating into an array.
    // Send data back.
    getReplayInfo(function(err, list) {
        if (err) {
            // handle error.
        } else {
            sendResponse({ data: list });
        }
    });
    return true;
});

/**
 * Initiates download of replay data.
 * @param {object} message - Object with `id` property of replay to
 *   download.
 */
messageListener("downloadReplay",
function(message, sender, sendResponse) {
    // Get replay data.
    // Remove db-specific properties.
    // Initiate download of replay.
});

/**
 * Initiates download of multiple replays as a zip file.
 * @param {object} message - Object with `ids` property which is an
 *   array of ids of replays to download.
 */
messageListener("downloadReplays",
function(message, sender, sendResponse) {
    // Validate the number of replays.
    // Iterate over values and retrieve replay data, accumulating into zip file/blob.
    // Double-check file size to ensure we aren't going over the maximum.
    // Initiate download of zip file.
});

/**
 * Delete a replay and all associated data.
 * @param {object} message - Object with property `id` or `ids` for
 *   single or multiple deletion, containing the id or array of ids of
 *   replays to be deleted.
 */
messageListener(["deleteReplay", "deleteReplays"],
function(message, sender, sendResponse) {
    // Check if single or multiple replays and normalize.
    // Retrieve the info for the replays.
    // Delete the rendered video, if needed.
    // Delete the info and replay information.
    // Send confirmation to page.
});

/**
 * Renames a replay.
 * @param {object} message - Object with properties `id` and `name`
 *   giving the id of the replay to rename and the new name for it.
 * @param {Function} callback - ??
 */
messageListener("renameReplay",
function(message, sender, sendResponse) {
    renameReplay(message.id, message.name, function(err) {
        if (err) {

        } else {
            sendToTabs(function(id) {
                chrome.tabs.sendMessage(id, {
                    method: "replayRenamed",
                    id: message.id,
                    name: message.name
                });
            });
        }
    });
    // Retrieve the replay info.
    // Retrieve the replay.
    // Set the name and save each.
    // Send confirmation back to page.
});

/**
 * Initiate download of a movie.
 * @param {object} message - Message with property `id` for the movie
 *   to download.
 */
messageListener("downloadMovie",
function(message, sender, sendResponse) {
    // Get the replay info.
    // Check that the movie is rendered.
    // Get the movie file.
    // Initiate download.
});

/**
 * Initial request to render replay(s) into movie(s).
 * @param {object} message - object with a property `id` which is an
 *   array of strings.
 */
messageListener("renderReplay",
function(message, sender, sendResponse) {
    // Get replay data.
});

/**
 * Get the status of the background page.
 * @param {Function} callback - Callback which receives the status of
 *   the background page.
 */
messageListener("getStatus",
function(message, sender, sendResponse) {
    var status = getStatus();
    sendResponse(status);
    return true;
});

})(window);

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
 * Return the index of the first value in the array that satisfies the given
 * function. Same as `findIndex`.
 */
function findIndex(array, fn) {
    for (var i = 0; i < array.length; i++) {
        if (fn(array[i])) {
            return i;
        }
    }
    return -1;
}
/**
 * Return the first value in the array that satisfies the given function. Same
 * functionality as `find`.
 */
function find(array, fn) {
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
            name: find(player.name, function(v) { return v !== null; }),
            team: find(player.team, function(v) { return v !== null; }),
            id: player.id
        };
    });
    info.rendered = false;
    info.renderId = null;
    return info;
}

// Ensure textures are set.
chrome.storage.local.get(["default_textures", "textures"], function(items) {
    if (!items.textures || !items.default_textures) {
        getDefaultTextures(function(textures) {
            var default_textures = {};
            for (var t in textures) {
                default_textures[t] = textures[t];
            }
            chrome.storage.local.set({
                textures: textures,
                default_textures: default_textures
            }, function() {
                if (chrome.runtime.lastError) {
                    console.log("Error initializing textures " +
                        chrome.runtime.lastError);
                }
            });
        });
    }
});

/**
 * Crops a replay to the given start and end frames.
 * @param {Replay} replay - The replay to crop
 * @param {integer} startFrame - The frame to use for the start of the
 *   new replay.
 * @param {integer} endFrame - The frame to use for the end of the new
 *   replay.
 * @return {Replay} - The cropped replay.
 */
function cropReplay(replay, startFrame, endFrame) {
    // Don't do anything if this replay is already the correct size.
    if (startFrame === 0 && endFrame === replay.data.time.length)
        return replay;

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    var startTime = replay.data.time[startFrame],
        endTime = replay.data.time[endFrame];

    // Crop an array that only contains information for each frame
    // and impacts no later.
    function cropFrameArray(ary) {
        return ary.slice(startFrame, endFrame + 1);
    }

    // Remove events from provided array that occur after the end
    // of the cropped replay, or far enough in advance of the start
    // that they are not relevant.
    function cropEventArray(ary, cutoff) {
        if (typeof cutoff == "undefined") cutoff = null;
        return ary.filter(function(event) {
            return event.time < endTime && (cutoff === null || startTime - event.time < cutoff);
        });
    }

    // Crop the arrays for a player, returning the player or null
    // if this results in the player no longer being relevant.
    function cropPlayer(player) {
        var name = cropFrameArray(player.name);
        var valid = name.some(function(val) {
            return val !== null;
        });
        if (!valid) return null;
        var newPlayer = {
            auth: cropFrameArray(player.auth),
            bomb: cropFrameArray(player.bomb),
            dead: cropFrameArray(player.dead),
            degree: cropFrameArray(player.degree),
            draw: cropFrameArray(player.draw),
            flag: cropFrameArray(player.flag),
            flair: cropFrameArray(player.flair).map(clone), // Necessary to clone?
            grip: cropFrameArray(player.grip),
            id: player.id,
            name: name,
            tagpro: cropFrameArray(player.tagpro),
            team: cropFrameArray(player.team),
            x: cropFrameArray(player.x),
            y: cropFrameArray(player.y)
        };
        if (player.hasOwnProperty("angle")) {
            newPlayer.angle = cropFrameArray(player.angle);
        }
        return newPlayer;
    }

    // Return a dynamic tile with its value array cropped.
    function cropDynamicTile(tile) {
        return {
            x: tile.x,
            y: tile.y,
            value: cropFrameArray(tile.value)
        };
    }

    // Crop array of spawns, taking into account the waiting period
    // for the cutoff.
    function cropSpawns(spawns) {
        return spawns.filter(function(spawn) {
            return spawn.time <= endTime && startTime - spawn.time <= spawn.wait;
        }).map(clone);
    }

    // New, cropped replay.
    var newReplay = {
        info: clone(replay.info),
        data: {
            bombs: cropEventArray(replay.data.bombs, 200),
            chat: cropEventArray(replay.data.chat, 3e4),
            dynamicTiles: replay.data.dynamicTiles.map(cropDynamicTile),
            endTimes: replay.data.endTimes.filter(function(time) {
                return time >= startTime;
            }),
            map: clone(replay.data.map),
            players: {},
            score: cropFrameArray(replay.data.score).map(clone), // necessary to clone?
            spawns: cropSpawns(replay.data.spawns),
            splats: cropEventArray(replay.data.splats),
            time: cropFrameArray(replay.data.time),
            wallMap: clone(replay.data.wallMap)
        },
        version: 2
    };

    var gameEnd = replay.data.gameEnd;
    if (gameEnd && gameEnd.time <= endTime) {
        newReplay.gameEnd = clone(gameEnd);
    }


    // Crop player properties.
    $.each(replay.data.players, function(id, player) {
        var newPlayer = cropPlayer(player);
        if (newPlayer !== null) {
            newReplay.data.players[id] = player;
        }
    });

    return newReplay;
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
 *   Optional `name` property which would be used in place of the
 *   original.
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
    // Get specified name or replay name + (cropped).
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
    var replay = message.data;
    // TODO: Validate replay.
    // TODO: Crop replay.
    var startFrame = findIndex(replay.data.time, function(t) {
        return t !== null;
    });
    if (startFrame == -1) {
        // No data captured.
        sendResponse({
            failed: true,
            reason: "No replay data captured."
        });
        return true;
    }
    replay = cropReplay(replay, startFrame, replay.data.time.length);
    // Generate DB Info from Replay.
    var info = generateReplayInfo(replay);
    saveReplay(info, replay, function(err) {
        // TODO: Handle error.
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
            // TODO: Handle error.
        } else {
            sendResponse({ data: list });
        }
    });
    return true;
});

/**
 * Initiates download of multiple replays as a zip file, or a single
 * replay as a json file.
 * @param {object} message - Object with `ids` property which is an
 *   array of ids of replays to download.
 */
messageListener(["downloadReplay", "downloadReplays"],
function(message, sender, sendResponse) {
    // Validate the number of replays.
    var ids = message.ids;
    if (ids.length === 1) {
        // Single JSON file.
        var id = ids[0];
        getReplay(id, function(err, data) {
            if (!err) {
                var blob = new Blob([JSON.stringify(data)],
                    { type: 'application/json' });
                var filename = sanitizeFilename(data.info.name);
                if (filename === "") {
                    filename = "replay";
                }
                saveAs(blob, filename + '.json');
            } else {
                // TODO: Handle error.
            }
        });
    } else  if (ids.length !== 0) {
        // Multiple replay files.
        var zip = new JSZip();
        var dup = 0;
        forEachReplay(ids, function(data) {
            var name = data.info.name;
            var filename = sanitizeFilename(name);
            if (filename === "") {
                filename = "replay";
                if (dup++ !== 0) {
                    filename += " (" + dup + ")";
                }
            }
            zip.file(filename + ".json", JSON.stringify(data));
        }, function() {
            var content = zip.generate({
                type: "blob",
                compression: "DEFLATE"
            });
            saveAs(content, "replays.zip");
        });
        // Iterate over values and retrieve replay data, accumulating into zip file/blob.
        // Double-check file size to ensure we aren't going over the maximum.
        // Initiate download of zip file.
    } else {
        // TODO: Alert that replays should be selected.
    }
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
    var ids = message.id ? [message.id] : message.ids;

    deleteReplays(ids, function(err) {
        if (err) {
            // TODO: Handle error.
        } else {
            sendToTabs(function(id) {
                chrome.tabs.sendMessage(id, {
                    method: 'replaysDeleted',
                    ids: ids
                });
            });
        }
    });
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

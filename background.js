/**
 * Responsible for maintaining and providing the interface to
 * persistent resources, like the IndexedDB database and FileSystem.
 * Also manages replay rendering, import, and download.
 * 
 * This script is included as a background script.
 */
(function(window) {

/**
 * Test the integrity of position data. Should be used before
 * attempting to render a replay. This function does not currently do
 * a very thorough check, only ensuring that the necessary properties
 * are present.
 * @param {Position} positions - The position data to check.
 * @return {boolean} - Whether or not the position data is valid.
 */
function checkData(positions) {
    var obs = ["chat", "splats", "bombs", "spawns", "map", "wallMap", "floorTiles", "score", "gameEndsAt", "clock", "tiles"];
    obs.forEach(function(ob){
        if(!positions[ob]) {
            return false;
        }
    });
    if(positions.map.length == 0 || positions.wallMap.length == 0 || positions.clock.length == 0) {
        return false;
    }
    var val = false;
    Object.keys(positions).forEach(function(key){
        if(key.search('player')==0){
            val = true;
        }
    });
    
    return val;
}

// TODO: Simplify and separate.
/**
 * Get all the keys in the object store, list of rendered movies,
 * and metadata for replays, and sends the data to the requesting
 * tab via the response callback function.
 * @param  {ResponseCallback} callback - The callback function to pass
 *   the response.
 */
function listItems(callback) {
    var allKeys = [];
    var allMetaData = [];
    iterateData(function(result) {
        var metadata = localStorage.getItem(result.key);
        if(!metadata || !JSON.parse(metadata) || typeof JSON.parse(metadata).map === 'undefined') {
            if(result.value === undefined || result.value === "undefined") {
                var metadata = extractMetaData(null);
            } else {
                try {
                    var data = JSON.parse(result.value);
                    var metadata = extractMetaData(data);
                } catch (err) {
                    var metadata = extractMetaData(null);
                }
            }
            localStorage.setItem(result.key, JSON.stringify(metadata));
        }
        allMetaData.push(metadata);
        allKeys.push(result.key);
    }, function() {
        getRenderedMovieNames(function(names) {
            callback({
                positionKeys: allKeys,
                movieNames: names,
                metadata: JSON.stringify(allMetaData)
            });
            console.log('Sent reply: ' + allKeys);
        });
    });
}

// this function gets all positions keys in object store
//   it then cleans out filesystem of any rendered replay that isn't in indexedDB object store
function getCurrentReplaysForCleaning() {
    var keys = [];
    iterateData(function(result) {
        keys.push(result.key);
    }, function() {
        // All keys retrieved.
        var filenames = keys.map(function(key) {
            return key.replace(/.*DATE/, '').replace('replays', '');
        });
        deleteMovieFiles(filenames);
    });
}

// gets position data from object store for multiple files and zips it into blob
// saves as zip file
function getRawDataAndZip(files) {
    var zip = new JSZip();
    iterateData(function(result) {
        if (files.indexOf(result.key) !== -1) {
            zip.file(result.key + '.txt', result.value);
        }
    }, function() {
        var content = zip.generate({
            type:"blob",
            compression:"DEFLATE"
        });
        saveAs(content, 'raw_data.zip');
    });
}

// this deletes data from the object store
// if the `dataFileName` argument is an object (not a string or array), then
// this was called during a crop and replace process. we need to send the new
// name for this replay back to the content script
// TODO: Use a different function for the crop and replace process.
// 
function deleteData(filenames, tabNum) {
    if (typeof filenames == "string") filenames = [filenames];
    idbDelete(filenames, function() {
        filenames.forEach(function(filename) {
            localStorage.removeItem(filename);
        });
        sendToTabs(function(id) {
            chrome.tabs.sendMessage(id, {
                method: 'dataDeleted',
                deletedFiles: filenames
            });
        });
        console.log('sent reply')
    });
}

// this deletes data from the object store
// the `info` argument is an object this was called during a crop and replace process.
// we need to send the new name for this replay back to the content script
function specialDeleteData(info, tabNum) {
    var newName = info.newName;
    var metadata = info.metadata;
    var dataFileName = info.fileName;
    if(dataFileName === newName) {
        sendToTabs(function(id) {
            chrome.tabs.sendMessage(id, {
                method: 'dataDeleted',
                deletedFiles: dataFileName,
                newName: newName,
                metadata: metadata
            });
        });
        localStorage.removeItem(dataFileName);
        console.log('sent crop and replace reply');
    } else {
        idbDelete(dataFileName, function() {
            localStorage.removeItem(filename);

            if(typeof newName !== 'undefined') {
                sendToTabs(function(id) {
                    chrome.tabs.sendMessage(id, {
                        method: 'dataDeleted',
                        deletedFiles: dataFileName,
                        newName: newName,
                        metadata: metadata
                    });
                    console.log('sent crop and replace reply');
                });
            } else {
                sendToTabs(function(id) {
                    chrome.tabs.sendMessage(id, {
                        method: 'dataDeleted',
                        deletedFiles: dataFileName
                    });
                    console.log('sent single delete reply')
                });
            }
        });
    }
}

/**
 * Callback function that needs options and textures.
 * @callback OptionsCallback
 * @param {Options} options - Options.
 * @param {Textures} textures - Textures.
 */
/**
 * Retrieve the options and textures to render a replay.
 * @param {OptionsCallback} callback - 
 */
function getRenderSettings(callback) {
    // Retrieve options and textures and render the movie.
    chrome.storage.local.get(["options", "textures"], function(items) {
        var options = items.options;
        var textures;
        if (!options.custom_textures) {
            getDefaultTextures(function(defaultTextures) {
                getTextureImages(defaultTextures, function(textureImages) {
                    textures = textureImages;
                    callback(options, textures);
                });
            });
        } else {
            getTextureImages(items.textures, function(textureImages) {
                textures = textureImages;
                callback(options, textures);
            });
        }
    });
}

/**
 * @callback LoopCallback
 * @param {integer} i - The iteration number.
 */
/**
 * Holds options, limits to impose on the execution of the
 * `processNonBlocking` function.
 * @typedef ProcessOptions
 * @type {object}
 * @property {boolean} limit - Whether or not to limit the processing.
 * @property {integer} [max_iterations] - If `limit` is set, then this
 *   field dictates a maximum number of consecutive loops to be
 *   executed.
 */
/**
 * Execute looping process without 
 * @param {integer} start - The iteration at which to start the loop.
 * @param {integer} end - The iteration at which to stop the loop.
 * @param {LoopCallback} loop - The function to execute once for each
 *   value between start and end.
 * @param {Function} then - The function called when execution is
 *   complete.
 * @param {ProcessOptions} options - Options here dictate parameters
 *   such as the maximum number of consecutive loops that will be
 *   executed before relinquishing thread control.
 */
function processNonBlocking(start, end, loop, then, options) {
    if (typeof options == 'undefined') options = {};
    // Limit indicated.
    if (options.limit) {
        // Max number of iterations in a single stretch of
        // execution.
        if (options.max_iterations) {
            var iterations = end - start;
            if (iterations > options.max_iterations) {
                var oldEnd = end;
                end = start + options.max_iterations;
                var nextStart = end;
                var oldThen = then;
                then = function() {
                    setTimeout(function() {
                        processNonBlocking(
                            nextStart,
                            oldEnd,
                            loop,
                            oldThen,
                            options);
                    });
                };
            }
        }
    }
    for (var i = start; i < end; i++) {
        loop(i);
    }
    then();
}

/**
 * @callback RenderCallback
 * @param {boolean} result - Whether or not the rendering completed
 *   successfully.
 */
/**
 * Renders the replay with the given name, giving progress updates to
 * the tab identified by tabId. When the rendering has finished or
 * failed, the callback is called.
 * @param  {string}   name - The name of the replay to render.
 * @param  {RenderCallback} callback - Called when the rendering is
 *  complete.
 */
function renderMovie(name, tabNum, callback) {
    // Given replay data, retrieve the FPS the replay was recorded at.
    function getFPS(data) {
        for (var j in data) {
            if (data[j].me == 'me') {
                return data[j].fps;
            }
        }
    }

    // Given replay data, retrieve the number of frames in the replay.
    function getFrames(data) {
        return data.clock.length;
    }

    // Retrieve replay data that corresponds to the given name.
    getData(name, function(result) {
        var positions = JSON.parse(result);
        
        // Check position data and abort rendering if not good
        if(!checkData(positions)) {
            chrome.tabs.sendMessage(tabNum, {
                method: "replayRendered",
                name: name,
                failure: true
            });
            callback();
            return;
        }

        var fps = getFPS(positions);
        var frames = getFrames(positions);

        // Construct canvas.
        var canvas = document.createElement('canvas');

        var context = canvas.getContext('2d');

        getRenderSettings(function(options, textures) {
            // Set rendering canvas dimensions.
            canvas.width = options.canvas_width;
            canvas.height = options.canvas_height;

            var mapImgData = drawMap(positions, textures.tiles);
            var mapImg = new Image();
            mapImg.src = mapImgData;
            
            var encoder = new Whammy.Video(fps);

            sendToTabs(function(id) {
                chrome.tabs.sendMessage(id, {
                    method: "replayRendering",
                    name: name,
                    progress: 0
                });
            });

            // Execute for each frame.
            function loop(frame) {
                if (frame / Math.round(frames / 100) % 1 == 0) {
                    var progress = frame / frames;
                    sendToTabs(function(id) {
                        chrome.tabs.sendMessage(id, {
                            method: "replayRendering",
                            progress: progress,
                            name: name
                        });
                    });
                }
                animateReplay(frame, positions, mapImg, options, textures, context);
                encoder.add(context);
            }

            // Execute after loop is complete.
            function then() {
                var output = encoder.compile();
                var filename = name.replace(/.*DATE/, '').replace('replays', '');
                saveMovieFile(filename, output);
                // Send replay render confirmation.
                sendToTabs(function(id) {
                    chrome.tabs.sendMessage(id, {
                        method: "replayRendered",
                        name: name,
                        failure: false
                    });
                });
                callback();
            }

            var opts = {
                limit: true,
                max_iterations: 3
            };
            // Execute the rendering without blocking execution.
            processNonBlocking(0, frames, loop, then, opts);
        });
    });
}

// converts dataURL to blob
function dataURItoBlob(dataURI) {
    var byteString = atob(dataURI.split(',')[1]);
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], {type: 'video/webm'});
}

// this downloads a rendered movie (found in the FileSystem) to disk
function downloadMovie(name) {
    function errorHandler(err) {
        chrome.tabs.sendMessage(tabNum, {
            method: "movieDownloadFailure"
        });
        console.log('sent movie download failure notice');
    }
    var filename = name.replace(/.*DATE/, '').replace('replays', '');
    getMovieFile(filename, function(dataUri) {
        var movie = dataURItoBlob(dataUri);
        movie.type = 'video/webm';
        if (typeof movie !== "undefined") {
            saveAs(movie, filename + '.webm');
        } else {
            errorHandler();
        }
    }, errorHandler);
}

// this function "cleans" position data when user clicked record too soon after start of game
function cleanPositionData(positionDAT) {
    for (var cleanI = 0; cleanI < positionDAT.clock.length; cleanI++) {
        if (positionDAT.clock[cleanI] == 0) {
            for (var positionStat in positionDAT) {
                if (positionStat.search('player') == 0) {
                    for (var playerStat in positionDAT[positionStat]) {
                        if ($.isArray(positionDAT[positionStat][playerStat])) {
                            positionDAT[positionStat][playerStat].shift()
                        }
                    }
                }
            }
            for (var cleanFloorTile in positionDAT.floorTiles) {
                positionDAT.floorTiles[cleanFloorTile].value.shift();
            }
            positionDAT.clock.shift();
            positionDAT.score.shift();
            cleanI--;
        }
    }
    return positionDAT;
}

// this takes a positions file and returns the duration in seconds of that replay
function getDuration(positions) {
    for(var iii in positions) {
        if(iii.search("player")===0) {
            var player = positions[iii];
            break;
        }
    }
    if(typeof player === 'undefined') return(0)
    var duration = Math.round(player.x.length/player.fps);
    return(duration);
}

/**
 * @typedef ReplayMetadata
 * @type {object}
 * @property {string} map - The name of the map the replay took place
 *   on.
 * @property {number} fps - The FPS the replay was recorded at.
 * @property {number} duration - The duration (in seconds) of the replay.
 * @property {Array.<string>} redTeam - An array of names of players on
 *   the red team.
 * @property {Array.<string>} blueTeam - An array of names of players on
 *   the blue team.
 */
/**
 * Take recorded replay data and extract metadata from the information.
 * @param {Positions} positions - The positions to get data from.
 * @return {ReplayMetadata}
 */
function extractMetaData(positions) {
    var metadata = {};
    metadata.redTeam = [];
    metadata.blueTeam = [];
    var blankResponse = {redTeam: [''], blueTeam: [''], map: 'ERROR', fps: 0, duration: 0};
    if (!$.isPlainObject(positions)) return blankResponse;
    for(var x in positions) {
        if(x.search('player')==0) {
            // Get array of names.
            var name = $.map(positions[x].name, function(obj, index){if(obj !== 'null') return(obj)});
            if(name[0] == undefined) continue;
            // Get team they are in initially.
            var team = positions[x].team[0];
            // Set indicator next to name of recording player.
            name = (positions[x].me == 'me' ? '* ' : '  ') + name[0];
            if(positions[x].me=='me') {
                var me = x;
                var duration = Math.round(positions[x].x.length/positions[x].fps);
            }
            if(team == 1) {
                metadata.redTeam.push(name);
            } else {
                metadata.blueTeam.push(name);
            }
        }
    }
    if (typeof me === 'undefined') return blankResponse;
    metadata.map = positions[me].map;
    metadata.fps = positions[me].fps;
    metadata.duration = duration;
    return metadata;
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

// TODO: Simplify and separate this into different functions.
// Request to replace an existing replay from the in-page editor.
messageListener("replaceReplay",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    // Save the information.
    var name = message.newName
    var replacedName = message.oldName;
    positions = cleanPositionData(JSON.parse(message.positionData))
    var metadata = extractMetaData(positions);
    localStorage.setItem(name, JSON.stringify(metadata));

    idbPut(name, JSON.stringify(positions), function() {
        console.log('new replay saved, deleting old replay...');
        // Delete the old information if not being overwritten.
        if (name !== replacedName) {
            deleteData(replacedName, tabNum);
        }
    });
    return true;
});

/**
 * Listen for new replay data.
 * @param {object} message - Object with 'data' and 'name' properties
 *   for the new replay.
 * @param {} sender
 * @param {Function} sendResponse - Callback function for result.
 */
messageListener("saveReplay",
function(message, sender, sendResponse) {
    var name = message.name;
    var positions = cleanPositionData(JSON.parse(message.data));
    var metadata = extractMetaData(positions);
    // Save metadata to local storage.
    localStorage.setItem(name, JSON.stringify(metadata));
    // Save replay data to IndexedDB.
    idbPut(name, JSON.stringify(positions), function() {
        // Send confirmation to 
        // TODO: Handle possible failures.
        sendResponse({
            failed: false
        });
        // Send new replay notification to any tabs that may have menu.
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
 * Handle imported replay.
 * message should be an object with the filename and data.
 */
messageListener("importReplay",
function(message, sender, sendResponse) {
    /**
     * Given the name of an uploaded file, get the name of the replay
     * the raw data should be saved under.
     * @param {string} filename - The name of the raw data file
     *   uploaded.
     * @return {string} - The name to use for the replay.
     */
    function getReplayName(filename) {
        var reDate = /^.+DATE\d+$/;
        var reReplay = /^replays\d+$/;
        var name = filename.replace(/\.txt$/, '');
        if (!reDate.test(name) && !reReplay.test(name)) {
            name += 'DATE' + Date.now();
        }
        return name;
    }

    /**
     * Check whether a given data file meets some basic requirements.
     * @param {object} parsedData
     * @return {boolean} - Whether the object from the data file
     *   contains the required properties.
     */
    function checkParsed(parsedData) {
        var props = ["tiles", "clock", "floorTiles", "map", "wallMap"];
        return props.every(function(prop) {
            return parsedData.hasOwnProperty(prop);
        });
    }

    var name = getReplayName(message.filename);
    var data = message.data;

    try {
        var parsed = JSON.parse(data);
    } catch (err) {
        //alert('The file you uploaded was not a valid TagPro Replays raw file.');
        // TODO: Handle badly parsed replay.
        return;
    }

    // TODO: Check integrity of replay file?
    var positions = cleanPositionData(parsed);
    var metadata = extractMetaData(positions);
    // Save metadata to local storage.
    localStorage.setItem(name, JSON.stringify(metadata));
    // Save replay data to IndexedDB.
    idbPut(name, JSON.stringify(positions), function() {
        // Send confirmation to 
        // TODO: Handle possible failures.
        sendResponse({
            failed: false
        });
        // Send new replay notification to any tabs that may have menu.
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
 * Request for replay data. response should be a function that will
 * take an object with a 'data' property which is the JSON stringified
 * replay information.
 * @param {object} message - Should have an `id` property corresponding
 *   to the replay data is being requested for.
 */
messageListener("requestData",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    var id = message.id;
    console.log('got data request for ' + id);
    getData(id, function(data) {
        sendResponse({
            data: data
        });
    });
    return true;
});

/**
 * Sent by modal when opened. Nothing included in message, but a
 * response is expected via the sendResponse callback.
 */
messageListener("requestList",
function(message, sender, sendResponse) {
    console.log('Got request for list.');
    listItems(sendResponse);
    return true;
});

messageListener("requestDataForDownload",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    if(message.fileName || message.files.length == 1) { // old, single button
        var name = message.fileName || message.files[0];
        console.log('got data request for download - ' + name);
        getData(name, function(data) {
            var blob = new Blob([data], {type: 'application/json'});
            saveAs(blob, name + '.txt');
        });
    } else if (message.files) {
        console.log('got request to download raw data for: ' + message.files)
        getRawDataAndZip(message.files);
    }
    return true;
});

/**
 * Request for data to be deleted.
 * Message has a fileName property which can be a string or an array of
 * strings corresponding to the ids of the replays to be deleted.
 */
messageListener("requestDataDelete",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got delete request for ' + message.fileName);
    deleteData(message.fileName, tabNum);
});

/**
 * Rename file. message has id and name properties.
 * @param {[type]} message [description]
 * @param {[type]} sender [description]
 * @param {[type]} sendResponse) {    tabNum [description]
 * @return {[type]} [description]
 */
messageListener("renameReplay",
function(message, sender, sendResponse) {
    console.log('Got rename request for ' + message.id + ' to ' + message.name);
    renameData(message.id, message.name, function() {
        localStorage.removeItem(message.id);
        chrome.storage.local.remove(message.id);
        sendToTabs(function(id) {
            chrome.tabs.sendMessage(id, {
                method: "replayRenamed",
                id: message.id,
                name: message.name
            });           
        });
        console.log('Sent rename reply.');
    });
});

messageListener("downloadMovie",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to download Movie for ' + message.name);
    downloadMovie(message.name);
});

messageListener("cleanRenderedReplays",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to clean rendered replays');
    getCurrentReplaysForCleaning();
});

/**
 * Initial request to render movie(s).
 * @param  {object} message - object with a property `data` which is an
 *   array of strings
 * @param  {[type]} sender        [description]
 * @return {[type]}               [description]
 */
messageListener("render",
function(message, sender, sendResponse) {
    console.log('Received request to render these replays: ' + message.data);
    var tabNum = sender.tab.id;

    var replayName = message.data.pop();
    renderMovie(replayName, tabNum, function() {
        // Only send message back to original requesting tab to prevent
        // issues that could occur if multiple menu pages are open at
        // the same time.
        chrome.tabs.sendMessage(tabNum, {
            method: "renderConfirmation",
            replaysLeft: message.data
        });
    });
});

})(window);

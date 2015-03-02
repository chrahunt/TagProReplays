/**
 * Acts as the intermediary for content script and background page
 * storage holding replay data and rendered webm movies. Also listens
 * for requests to initiate rendering.
 * 
 * This script is included as a background script.
 */
(function(window) {

var TILE_SIZE = 40

defaultTextures = {
    tiles: 'img/tiles.png',
    portal: 'img/portal.png',
    speedpad: 'img/speedpad.png',
    speedpadred: 'img/speedpadred.png',
    speedpadblue: 'img/speedpadblue.png',
    splats: 'img/splats.png',
    flair: 'img/flair.png'
};

img = new Image()
img.src = defaultTextures.tiles
img.id = 'tiles'
img = document.body.appendChild(img)

portalImg = new Image()
portalImg.src = defaultTextures.portal
portalImg.id = 'portal'
portalImg = document.body.appendChild(portalImg)

speedpadImg = new Image()
speedpadImg.src = defaultTextures.speedpad
speedpadImg.id = 'speedpad'
speedpadImg = document.body.appendChild(speedpadImg)

speedpadredImg = new Image()
speedpadredImg.src = defaultTextures.speedpadred
speedpadredImg.id = 'speedpadred'
speedpadredImg = document.body.appendChild(speedpadredImg)

speedpadblueImg = new Image()
speedpadblueImg.src = defaultTextures.speedpadblue
speedpadblueImg.id = 'speedpadblue'
speedpadblueImg = document.body.appendChild(speedpadblueImg)

tagproImg = new Image()
tagproImg.src = 'img/tagpro.png'
tagproImg.id = 'tagpro'
tagproImg = document.body.appendChild(tagproImg)

rollingbombImg = new Image()
rollingbombImg.src = 'img/rollingbomb.png'
rollingbombImg.id = 'rollingbomb'
rollingbombImg = document.body.appendChild(rollingbombImg)

splatsImg = new Image()
splatsImg.src = defaultTextures.splats
splatsImg.id = 'splats'
splatsImg = document.body.appendChild(splatsImg)

flairImg = new Image()
flairImg.src = defaultTextures.flair
flairImg.id = 'flair'
flairImg = document.body.appendChild(flairImg)

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
// this is a function to get all the keys in the object store
//   It also gets the list of names of rendered movies
//   It sends a message to the content script once it gets the keys and movie names
//   It also sends custom texture files as well.
function listItems() {
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
            chrome.tabs.sendMessage(tabNum, {
                method: "itemsList", 
                positionKeys: allKeys, 
                movieNames: names, 
                metadata: JSON.stringify(allMetaData)
            });
            console.log('sent reply: ' + allKeys);
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
function deleteData(dataFileName, tabNum) {
    if($.isPlainObject(dataFileName)) {
        var newName = dataFileName.newName;
        var metadata = dataFileName.metadata;
        dataFileName = dataFileName.fileName;
        if(dataFileName === newName) {
            chrome.tabs.sendMessage(tabNum, {
                method: 'dataDeleted',
                deletedFiles: dataFileName,
                newName: newName,
                metadata: metadata
            });
            localStorage.removeItem(dataFileName);
            console.log('sent crop and replace reply');
            return;
        }
    };
    if ($.isArray(dataFileName)) {
        idbDelete(dataFileName, function() {
            dataFileName.forEach(function(filename) {
                localStorage.removeItem(filename);
            });
            chrome.tabs.sendMessage(tabNum, {
                method: 'dataDeleted',
                deletedFiles: dataFileName
            });
            console.log('sent reply')
        });
    } else {
        idbDelete(dataFileName, function() {
            localStorage.removeItem(filename);

            if(typeof newName !== 'undefined') {
                chrome.tabs.sendMessage(tabNum, {
                    method: 'dataDeleted',
                    deletedFiles: dataFileName,
                    newName: newName,
                    metadata: metadata
                });
                console.log('sent crop and replace reply');
            } else {
                chrome.tabs.sendMessage(tabNum, {
                    method: 'dataDeleted',
                    deletedFiles: dataFileName
                });
                console.log('sent single delete reply')
            }
        });
    }
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
 * @param  {integer}   tabId - The id of the tab to update while
 *   rendering.
 * @param  {RenderCallback} callback - Called when the rendering is
 *  complete.
 */
function renderMovie(name, tabId, callback) {
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
            callback(false);
            return;
        }

        var fps = getFPS(positions);
        var frames = getFrames(positions);

        // Construct canvas.
        var canvas = document.createElement('canvas');

        context = canvas.getContext('2d');

        // Retrieve options and textures and render the movie.
        chrome.storage.local.get(["options", "textures"], function(items) {
            var options = items.options;
            var textures;

            function render() {
                // Set rendering canvas dimensions.
                canvas.width = options.canvas_width;
                canvas.height = options.canvas_height;

                var mapImgData = drawMap(positions, textures.tiles);
                mapImg = new Image()
                mapImg.src = mapImgData
                
                var encoder = new Whammy.Video(fps);

                chrome.tabs.sendMessage(tabId, {
                    method: "progressBarCreate",
                    name: name
                });

                for (var thisI = 0; thisI < frames; thisI++) {
                    if (thisI / Math.round(frames / 100) % 1 == 0) {
                        chrome.tabs.sendMessage(tabNum, {
                            method: "progressBarUpdate",
                            progress: thisI / positions.clock.length,
                            name: name
                        });
                    }
                    animateReplay(thisI, positions, mapImg, options, textures);
                    encoder.add(context)
                }

                var output = encoder.compile();
                var filename = name.replace(/.*DATE/, '').replace('replays', '');
                saveMovieFile(filename, output);
                callback(true);
            }

            if (!options.custom_textures) {
                getDefaultTextures(function(defaultTextures) {
                    getTextureImages(defaultTextures, function(textureImages) {
                        textures = textureImages;
                        render();
                    });
                });
            } else {
                getTextureImages(items.textures, function(textureImages) {
                    textures = textureImages;
                    render();
                });
            }
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
    };
    var filename = name.replace(/.*DATE/, '').replace('replays', '');
    getMovieFile(filename, function(dataUri) {
        var movie = dataURItoBlob(dataUri);
        movie.type = 'video/webm'
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
            var name = $.map(positions[x].name, function(obj, index){if(obj !== 'null') return(obj)});
            if(name[0] == undefined) continue;
            var team = positions[x].team[0];
            var name = (positions[x].me == 'me' ? '* ' : '  ') + name[0];
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

// Initialize IndexedDB.
idbOpen();

// TODO: Simplify and separate this into different functions.
messageListener(["setPositionData", "setPositionDataFromImport"],
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    if (typeof message.newName !== 'undefined') {
        var name = message.newName
    } else {
        var name = 'replays' + new Date().getTime()
    }
    var deleteTheseData;
    if (message.oldName !== null && typeof message.oldName !== 'undefined') {
        deleteTheseData = true;
    } else {
        deleteTheseData = false;
    }
    console.log('got data from content script.')
    positions = cleanPositionData(JSON.parse(message.positionData))
    var metadata = extractMetaData(positions);
    localStorage.setItem(name, JSON.stringify(metadata));

    idbPut(name, JSON.stringify(positions), function() {
        if(deleteTheseData) {
            console.log('new replay saved, deleting old replay...');
            deleteData({
                fileName: message.oldName,
                newName: message.newName,
                metadata: metadata
            }, tabNum);
        } else {
            if(message.method === 'setPositionDataFromImport') {
                sendResponse({
                    replayName: name,
                    metadata: JSON.stringify(metadata)
                });
            } else {
                chrome.tabs.sendMessage(tabNum, {
                    method: "dataSetConfirmationFromBG",
                    replayName: name,
                    metadata: JSON.stringify(metadata)
                });
                console.log('sent confirmation');
            }
        }
    });
    return true;
});

messageListener("requestData",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    var name = message.fileName;
    console.log('got data request for ' + name);
    getData(name, function(data) {
        chrome.tabs.sendMessage(tabNum, {
            method: "positionData",
            title: data,
            movieName: name
        });
    });
});

messageListener("requestList",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got list request');
    listItems();
})

messageListener("requestDataForDownload",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    if(message.fileName || message.files.length == 1) { // old, single button
        var name = message.fileName || message.files[0];
        console.log('got data request for download - ' + name);
        getData(name, function(data) {
            saveAs(data, name + '.txt');
        });
    } else if (message.files) {
        console.log('got request to download raw data for: ' + message.files)
        getRawDataAndZip(message.files);
    }
    return true;
});

messageListener("requestDataDelete",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got delete request for ' + message.fileName);
    deleteData(message.fileName, tabNum);
});

messageListener("requestFileRename",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got rename request for ' + message.oldName + ' to ' + message.newName)
    renameData(message.oldName, message.newName, function() {
        localStorage.removeItem(oldName);
        chrome.storage.local.remove(oldName);
        chrome.tabs.sendMessage(tabNum, {
            method: "fileRenameSuccess",
            oldName: oldName,
            newName: newName
        });
        console.log('sent rename reply');
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
    console.log('got request to clean rendered replays')
    getCurrentReplaysForCleaning()
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
    // Whether this is the last replay to be rendered.
    var last = message.last;
    var replayName = message.data[message.index];
    renderMovie(replayName, tabNum, function(success) {
        chrome.tabs.sendMessage(tabNum, {
            method: "renderConfirmation",
            replaysToRender: message.data,
            index: message.index,
            last: last,
            failure: !success,
            name: replayName
        });
    });
});

})(window);

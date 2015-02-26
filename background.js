/**
 * Acts as the intermediary for content script and background page
 * storage holding replay data and rendered webm movies. Also listens
 * for requests to initiate rendering.
 * 
 * This script is included as a background script.
 */
var TILE_SIZE = 40

can = document.createElement('canvas')
can.id = 'mapCanvas'
document.body.appendChild(can)

can = document.getElementById('mapCanvas')
can.width = localStorage.getItem('canvasWidth') || 32 * TILE_SIZE;
can.height = localStorage.getItem('canvasHeight') || 20 * TILE_SIZE;
can.style.zIndex = 200
can.style.position = 'absolute'
can.style.top = 0
can.style.left = 0


context = can.getContext('2d')

defaultTextures = {
    tiles: 'img/tiles.png',
    portal: 'img/portal.png',
    speedpad: 'img/speedpad.png',
    speedpadred: 'img/speedpadred.png',
    speedpadblue: 'img/speedpadblue.png',
    splats: 'img/splats.png',
    flair: 'img/flair.png'
}

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
            return(false);
        }
    })
    if(positions.map.length == 0 || positions.wallMap.length == 0 || positions.clock.length == 0) {
        return(false);
    }
    var val = false;
    Object.keys(positions).forEach(function(key){
        if(key.search('player')==0){
            val = true;
        }
    })
    
    return(val)
}


// Actually does the rendering of the movie 
function renderVideo(positions, name, useSplats, useSpin, useClockAndScore, useChat, lastOne, replaysToRender, replayI, tabNum) {
    localStorage.setItem('useSplats', useSplats);
    localStorage.setItem('useSpin', useSpin);
    localStorage.setItem('useClockAndScore', useClockAndScore);
    localStorage.setItem('useChat', useChat);
    positions = JSON.parse(positions);
    
    // check position data and abort rendering if not good
    if(!checkData(positions)) {
        if (lastOne) {
            chrome.tabs.sendMessage(tabNum, {
                method: "movieRenderConfirmation"
            });
        } else {
            chrome.tabs.sendMessage(tabNum, {
                method: "movieRenderConfirmationNotLastOne",
                replaysToRender: replaysToRender,
                replayI: replayI,
                failure: true,
                name:name
            });
        }
        console.log(name+' was a bad positions file. Very bad boy.');
        return
    }
    
    mapImgData = drawMap(0, 0, positions)
    mapImg = new Image()
    mapImg.src = mapImgData
    for (j in positions) {
        if (positions[j].me == 'me') {
            me = j
        }
    }
    var encoder = new Whammy.Video(positions[me].fps);

    chrome.tabs.sendMessage(tabNum, {method: "progressBarCreate", name: name})
    for (thisI = 0; thisI < positions.clock.length; thisI++) {
        if (thisI / Math.round(positions.clock.length / 100) % 1 == 0) {
            chrome.tabs.sendMessage(tabNum, {
                method: "progressBarUpdate",
                progress: thisI / positions.clock.length,
                name: name
            })
        }
        animateReplay(thisI, positions, mapImg, useSpin, useSplats, useClockAndScore, useChat)
        encoder.add(context)
    }
    delete output;
    output = encoder.compile();
    var filename = name.replace(/.*DATE/, '').replace('replays', '');
    saveMovieFile(filename, output);

    if (lastOne) {
        chrome.tabs.sendMessage(tabNum, {
            method: "movieRenderConfirmation"
        });
    } else {
        chrome.tabs.sendMessage(tabNum, {
            method: "movieRenderConfirmationNotLastOne",
            replaysToRender: replaysToRender,
            replayI: replayI
        });
    }
}

// TODO: Simplify and separate.
// this is a function to get all the keys in the object store
//   It also gets the list of names of rendered movies
//   It sends a message to the content script once it gets the keys and movie names
//   It also sends custom texture files as well.
function listItems() {
    var textures = retrieveTextures();
    var allKeys = [];
    var allMetaData = [];
    var allPreviews = [];
    chrome.storage.local.get(function(previewStorage) {
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
            var thisPreview = previewStorage[result.key]; 
            if(thisPreview === undefined) {
                if(result.value === undefined || result.value === "undefined") {
                    var thisPreview = null;
                } else {
                    try {
                        if(!data) var data = JSON.parse(result.value);
                        var thisPreview = drawPreview(data);
                    } catch (err) {
                        console.log(err);
                        var thisPreview = null;
                    }
                }
                var obj = {};
                obj[result.key] = thisPreview;
                chrome.storage.local.set(obj);
            }
            allPreviews.push(thisPreview);
            allMetaData.push(metadata);
            allKeys.push(result.key);
        }, function() {
            getRenderedMovieNames(function(names) {
                chrome.tabs.sendMessage(tabNum, {
                    method: "itemsList", 
                    positionKeys: allKeys, 
                    movieNames: names, 
                    textures: textures,
                    metadata: JSON.stringify(allMetaData),
                    previews: allPreviews
                });
                console.log('sent reply: ' + allKeys);
            });
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
        var preview = dataFileName.preview;
        dataFileName = dataFileName.fileName;
        if(dataFileName === newName) {
            chrome.tabs.sendMessage(tabNum, {
                method: 'dataDeleted',
                deletedFiles: dataFileName,
                newName: newName,
                metadata: metadata,
                preview: preview
            });
            localStorage.removeItem(dataFileName);
            chrome.storage.local.remove(dataFileName);
            console.log('sent crop and replace reply');
            return;
        }
    };
    if ($.isArray(dataFileName)) {
        idbDelete(dataFileName, function() {
            dataFileName.forEach(function(filename) {
                localStorage.removeItem(filename);
                chrome.storage.local.remove(filename);
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
            chrome.storage.local.remove(filename);

            if(typeof newName !== 'undefined') {
                chrome.tabs.sendMessage(tabNum, {
                    method: 'dataDeleted',
                    deletedFiles: dataFileName,
                    newName: newName,
                    metadata: metadata,
                    preview: preview
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

// this renders a movie and stores it in the savedMovies FileSystem
function renderMovie(name, useTextures, useSplats, useSpin, useClockAndScore, useChat, lastOne, replaysToRender, replayI, tabNum) {
    if (useTextures) {
        if (typeof localStorage.getItem('tiles') !== "undefined" & localStorage.getItem('tiles') !== null) {
            img.src = localStorage.getItem('tiles')
        } else {
            img.src = defaultTextures.tiles
        }
        if (typeof localStorage.getItem('portal') !== "undefined" & localStorage.getItem('portal') !== null) {
            portalImg.src = localStorage.getItem('portal')
        } else {
            portalImg.src = defaultTextures.portal
        }
        if (typeof localStorage.getItem('speedpad') !== "undefined" & localStorage.getItem('speedpad') !== null) {
            speedpadImg.src = localStorage.getItem('speedpad')
        } else {
            speedpadImg.src = defaultTextures.speedpad
        }
        if (typeof localStorage.getItem('speedpadred') !== "undefined" & localStorage.getItem('speedpadred') !== null) {
            speedpadredImg.src = localStorage.getItem('speedpadred')
        } else {
            speedpadredImg.src = defaultTextures.speedpadred
        }
        if (typeof localStorage.getItem('speedpadblue') !== "undefined" & localStorage.getItem('speedpadblue') !== null) {
            speedpadblueImg.src = localStorage.getItem('speedpadblue')
        } else {
            speedpadblueImg.src = defaultTextures.speedpadblue
        }
        if (typeof localStorage.getItem('splats') !== "undefined" & localStorage.getItem('splats') !== null) {
            splatsImg.src = localStorage.getItem('splats')
        } else {
            splatsImg.src = defaultTextures.splats
        }
    } else {
        img.src = defaultTextures.tiles
        portalImg.src = defaultTextures.portal
        speedpadImg.src = defaultTextures.speedpad
        speedpadredImg.src = defaultTextures.speedpadred
        speedpadblueImg.src = defaultTextures.speedpadblue
        splatsImg.src = defaultTextures.splats
    }

    // Timeout to allow for image loading.
    setTimeout(function () {
        idbGet(function(result) {
            if (typeof JSON.parse(result).clock !== "undefined") {
                if (typeof replaysToRender !== 'undefined') {
                    renderVideo(result, name, useSplats, useSpin, useClockAndScore, useChat, lastOne, replaysToRender, replayI, tabNum);
                } else {
                    renderVideo(result, name, useSplats, useSpin, useClockAndScore, useChat, lastOne);
                }
            } else {
                chrome.tabs.sendMessage(tabNum, {
                    method: "movieRenderFailure"
                });
                console.log('sent movie render failure notice')
            }
        });
    }, 2000);
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

// this saves custom texture files to localStorage
function saveTextures(textureData) {
    if (typeof textureData.tiles !== 'undefined') {
        localStorage.setItem('tiles', textureData.tiles)
    } else {
        localStorage.removeItem('tiles')
    }
    if (typeof textureData.portal !== 'undefined') {
        localStorage.setItem('portal', textureData.portal)
    } else {
        localStorage.removeItem('portal')
    }
    if (typeof textureData.speedpad !== 'undefined') {
        localStorage.setItem('speedpad', textureData.speedpad)
    } else {
        localStorage.removeItem('speedpad')
    }
    if (typeof textureData.speedpadred !== 'undefined') {
        localStorage.setItem('speedpadred', textureData.speedpadred)
    } else {
        localStorage.removeItem('speedpadred')
    }
    if (typeof textureData.speedpadblue !== 'undefined') {
        localStorage.setItem('speedpadblue', textureData.speedpadblue)
    } else {
        localStorage.removeItem('speedpadblue')
    }
    if (typeof textureData.splats !== 'undefined') {
        localStorage.setItem('splats', textureData.splats)
    } else {
        localStorage.removeItem('splats')
    }
}

// this retrieves custom textures from localStorage and returns them as an object
function retrieveTextures() {
    var textures = {};
    textures.tiles        = localStorage.getItem('tiles');
    textures.portal       = localStorage.getItem('portal');
    textures.speedpad     = localStorage.getItem('speedpad');
    textures.speedpadred  = localStorage.getItem('speedpadred');
    textures.speedpadblue = localStorage.getItem('speedpadblue');
    textures.splats       = localStorage.getItem('splats');
    return(textures)
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

// Initialize IndexedDB.
idbOpen();

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
    var thisPreview = drawPreview(positions);
    localStorage.setItem(name, JSON.stringify(metadata));
    var obj = {};
    obj[name] = thisPreview;
    chrome.storage.local.set(obj);

    idbPut(name, JSON.stringify(positions), function() {
        if(deleteTheseData) {
            console.log('new replay saved, deleting old replay...');
            deleteData({
                fileName: message.oldName,
                newName: message.newName,
                metadata: metadata,
                preview: thisPreview
            }, tabNum);
        } else {
            if(message.method === 'setPositionDataFromImport') {
                sendResponse({
                    replayName: name,
                    metadata: JSON.stringify(metadata),
                    preview: thisPreview
                });
            } else {
                chrome.tabs.sendMessage(tabNum, {
                    method: "dataSetConfirmationFromBG",
                    replayName: name,
                    metadata: JSON.stringify(metadata),
                    preview: thisPreview
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


messageListener("renderMovie",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to render Movie for ' + message.name);
    localStorage.setItem('canvasWidth', message.canvasWidth);
    localStorage.setItem('canvasHeight', message.canvasHeight);
    can.width = message.canvasWidth;
    can.height = message.canvasHeight;
    renderMovie(message.name, message.useTextures, message.useSplats, message.useSpin, message.useClockAndScore, message.useChat, true);
});

messageListener("downloadMovie",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to download Movie for ' + message.name);
    downloadMovie(message.name);
});

messageListener("setTextureData",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to save texture image files')
    saveTextures(JSON.parse(message.textureData));
});

messageListener("cleanRenderedReplays",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to clean rendered replays')
    getCurrentReplaysForCleaning()
});

messageListener("renderAllInitial",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to render these replays: ' + message.data)
    console.log('rendering the first one: ' + message.data[0])
    if (message.data.length == 1) {
        lastOne = true
    } else {
        lastOne = false
    }
    localStorage.setItem('canvasWidth', message.canvasWidth);
    localStorage.setItem('canvasHeight', message.canvasHeight);
    can.width = message.canvasWidth;
    can.height = message.canvasHeight;
    renderMovie(message.data[0], message.useTextures, message.useSplats, message.useSpin, message.useClockAndScore, message.useChat, lastOne, message.data, 0, tabNum);
});

messageListener("renderAllSubsequent",
function(message, sender, sendResponse) {
    tabNum = sender.tab.id;
    console.log('got request to render subsequent replay: ' + message.data[message.replayI])
    renderMovie(message.data[message.replayI], message.useTextures, message.useSplats, message.useSpin, message.useClockAndScore, message.useChat, message.lastOne, message.data, message.replayI, tabNum)
});

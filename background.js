function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

tileSize = 40

can = document.createElement('canvas')
can.id = 'mapCanvas'
document.body.appendChild(can)

can = document.getElementById('mapCanvas')
can.width = localStorage.getItem('canvasWidth') || 32 * tileSize;
can.height = localStorage.getItem('canvasHeight') || 20 * tileSize;
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


// This function opens a download dialog
function saveVideoData(name, data) {
    var file = data
    var a = document.createElement('a');
    a.download = name;
    a.href = (window.URL || window.webkitURL).createObjectURL(file);
    var event = document.createEvent('MouseEvents');
    event.initEvent('click', true, false);
    a.dispatchEvent(event);
    (window.URL || window.webkitURL).revokeObjectURL(a.href);
}


// Function to test integrity of position data before attempting to render
// Returns false if a vital piece is missing, true if no problems were found
// CUrrently does not do a very thorough test
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
        	chrome.tabs.sendMessage(tabNum, {method: "movieRenderConfirmation"})
    	} else {
        	chrome.tabs.sendMessage(tabNum, {
            	method: "movieRenderConfirmationNotLastOne",
            	replaysToRender: replaysToRender,
            	replayI: replayI,
            	failure: true,
            	name:name
	        })
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
    output = encoder.compile()
    createFileSystem('savedMovies', saveMovieFile, [name, output])
    if (lastOne) {
        chrome.tabs.sendMessage(tabNum, {method: "movieRenderConfirmation"})
    } else {
        chrome.tabs.sendMessage(tabNum, {
            method: "movieRenderConfirmationNotLastOne",
            replaysToRender: replaysToRender,
            replayI: replayI
        })
    }
}

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
    	var transaction = db.transaction(["positions"], "readonly");
    	var store = transaction.objectStore("positions");
    	var request = store.openCursor(null);
		request.onsuccess = function () {
			if (request.result) {
				var metadata = localStorage.getItem(request.result.key);
				if(!metadata || !JSON.parse(metadata) || typeof JSON.parse(metadata).map === 'undefined') {
					if(request.result.value === undefined || request.result.value === "undefined") {
						var metadata = extractMetaData(null);
					} else {
						try {
							var data = JSON.parse(request.result.value);
							var metadata = extractMetaData(data);
						} catch (err) {
							var metadata = extractMetaData(null);
						}
					}
					localStorage.setItem(request.result.key, JSON.stringify(metadata));
				}
				var thisPreview = previewStorage[request.result.key]; 
				if(thisPreview === undefined) {
					if(request.result.value === undefined || request.result.value === "undefined") {
						var thisPreview = null;
					} else {
						try {
							if(!data) var data = JSON.parse(request.result.value);
							var thisPreview = drawPreview(data);
						} catch (err) {
							var thisPreview = null;
						}
					}
					var obj = {};
					obj[request.result.key] = thisPreview;
					chrome.storage.local.set(obj);
				}
				allPreviews.push(thisPreview);
				allMetaData.push(metadata);
				allKeys.push(request.result.key);
				request.result.continue();
			} else {
				createFileSystem('savedMovies', getRenderedMovieNames, [allKeys, textures, allMetaData, allPreviews]);
			}
		}
	});
}

// this function gets all positions keys in object store
//   it then cleans out filesystem of any rendered replay that isn't in indexedDB object store
function getCurrentReplaysForCleaning() {
    var allKeys = []
    var transaction = db.transaction(["positions"], "readonly");
    var store = transaction.objectStore("positions");
    var request = store.openCursor(null);
    request.onsuccess = function () {
        if (request.result) {
            allKeys.push(request.result.key);
            request.result.continue()
        } else {
            createFileSystem('savedMovies', cleanMovieFiles, [allKeys])
        }
    }
}

// this is a function to get position data from the object store
//   It sends a message to the content script once it gets the data 
function getPosData(dataFileName, tabNum) {
    positionData = []
    var transaction = db.transaction(["positions"], "readonly");
    var store = transaction.objectStore("positions");
    var request = store.get(dataFileName);
    request.onsuccess = function () {
        thisObj = request.result.value
        chrome.tabs.sendMessage(tabNum, {method: "positionData", title: request.result, movieName: dataFileName})
        console.log('sent reply')
    }
}

// this gets position data from object store so that it can be downloaded by user.
function getPosDataForDownload(dataFileName, tabNum) {
    positionData = []
    var transaction = db.transaction(["positions"], "readonly");
    var store = transaction.objectStore("positions");
    var request = store.get(dataFileName);
    request.onsuccess = function () {
        chrome.tabs.sendMessage(tabNum, {
            method: "positionDataForDownload",
            fileName: dataFileName,
            title: request.result
        })
        console.log('sent reply - ' + dataFileName)
    }
}

// gets position data from object store for multiple files and zips it into blob
// saves as zip file
function getRawDataAndZip(files) {
	var zip = new JSZip();
	var transaction = db.transaction(["positions"], "readonly");
    var store = transaction.objectStore("positions");
    var request = store.openCursor(null);
    request.onsuccess = function () {
        if (request.result) {
        	if($.inArray(request.result.key, files) >= 0) {
				//console.log(request.result.value)
				zip.file(request.result.key+'.txt', request.result.value);
			}
            request.result.continue()
        } else {
            var content = zip.generate({type:"blob", compression:"DEFLATE"});  
            saveAs(content, 'raw_data.zip');
        }
    }
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
    		chrome.tabs.sendMessage(tabNum, {method: 'dataDeleted', deletedFiles: dataFileName, newName: newName, metadata: metadata, preview: preview});
    		localStorage.removeItem(dataFileName);
    		chrome.storage.local.remove(dataFileName);
        	console.log('sent crop and replace reply');
        	return;
    	}
    };
    if ($.isArray(dataFileName)) {
        deleted = []
        for (fTD in dataFileName) {
        	localStorage.removeItem(dataFileName[fTD]);
    		chrome.storage.local.remove(dataFileName[fTD]);
    		var transaction = db.transaction(["positions"], "readwrite");
    		var store = transaction.objectStore("positions");
            request = store.delete(dataFileName[fTD]);
            request.onsuccess = function () {
                deleted.push(fTD);
                if (deleted.length == dataFileName.length) {
                    chrome.tabs.sendMessage(tabNum, {method: 'dataDeleted', deletedFiles: dataFileName})
                    console.log('sent reply')
                }
            }
        }
    } else {
    	var transaction = db.transaction(["positions"], "readwrite");
    	var store = transaction.objectStore("positions");
        request = store.delete(dataFileName);
        request.onsuccess = function () {
        	if(typeof newName !== 'undefined') {
        		localStorage.removeItem(dataFileName);
        		chrome.storage.local.remove(dataFileName);
        		chrome.tabs.sendMessage(tabNum, {method: 'dataDeleted', deletedFiles: dataFileName, newName: newName, metadata: metadata, preview: preview});
        		console.log('sent crop and replace reply');
        	} else {
        		localStorage.removeItem(dataFileName);
        		chrome.storage.local.remove(dataFileName);
            	chrome.tabs.sendMessage(tabNum, {method: 'dataDeleted', deletedFiles: dataFileName})
            	console.log('sent single delete reply')
            }
        }
    }
}

// this renames data in the object store
function renameData(oldName, newName, tabNum) {
    var transaction = db.transaction(["positions"], "readonly");
    var store = transaction.objectStore("positions");
    var request = store.get(oldName);
    request.onsuccess = function () {
        thisObj = request.result
        var transaction2 = db.transaction(["positions"], "readwrite");
        var store = transaction2.objectStore("positions");
        request = store.delete(oldName)
        request.onsuccess = function () {
            transaction3 = db.transaction(["positions"], "readwrite")
            objectStore = transaction3.objectStore('positions')
            request = objectStore.add(thisObj, newName)
            request.onsuccess = function () {
            	localStorage.removeItem(oldName);
            	chrome.storage.local.remove(oldName);
                chrome.tabs.sendMessage(tabNum, {method: "fileRenameSuccess", 
                								 oldName: oldName, 
                								 newName: newName
                });
                console.log('sent rename reply');
            }
        }
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

    setTimeout(function () {
        var transaction = db.transaction(["positions"], "readonly");
        var store = transaction.objectStore("positions");
        var request = store.get(name);
        request.onsuccess = function () {
            if (typeof JSON.parse(request.result).clock !== "undefined") {
                if (typeof replaysToRender !== 'undefined') {
                    renderVideo(request.result, name, useSplats, useSpin, useClockAndScore, useChat, lastOne, replaysToRender, replayI, tabNum)
                } else {
                    renderVideo(request.result, name, useSplats, useSpin, useClockAndScore, useChat, lastOne)
                }
            } else {
                chrome.tabs.sendMessage(tabNum, {method: "movieRenderFailure"})
                console.log('sent movie render failure notice')
            }
        }
    },2000)
}


// this downloads a rendered movie (found in the FileSystem) to disk
function downloadMovie(name) {
    //var nameDate = name.replace(/.*DATE/,'').replace('replays','')
    createFileSystem('savedMovies', getMovieFile, [name])
}

// this function "cleans" position data when user clicked record too soon after start of game
function cleanPositionData(positionDAT) {
    for (cleanI = 0; cleanI < positionDAT.clock.length; cleanI++) {
        if (positionDAT.clock[cleanI] == 0) {
            for (positionStat in positionDAT) {
                if (positionStat.search('player') == 0) {
                    for (playerStat in positionDAT[positionStat]) {
                        if ($.isArray(positionDAT[positionStat][playerStat])) {
                            positionDAT[positionStat][playerStat].shift()
                        }
                    }
                }
            }
            for (cleanFloorTile in positionDAT.floorTiles) {
                positionDAT.floorTiles[cleanFloorTile].value.shift()
            }
            positionDAT.clock.shift()
            positionDAT.score.shift()
            cleanI--
        }
    }
    return (positionDAT)
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

// this takes a positions file and returns the metadata of that file, including:
//     players, their teams at the start of the replay, the map name, the fps of the 
//     recording, and the duration of the recording
function extractMetaData(positions) {
    var metadata = {};
    metadata.redTeam = [];
    metadata.blueTeam = [];
    var blankResponse = {redTeam: [''], blueTeam: [''], map: 'ERROR', fps: 0, duration: 0};
    if(!$.isPlainObject(positions)) return(blankResponse);
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
    if(typeof me === 'undefined') return(blankResponse)
    metadata.map = positions[me].map;
    metadata.fps = positions[me].fps;
    metadata.duration = duration;
    return metadata;
}

// Set up indexedDB
var openRequest = indexedDB.open("ReplayDatabase");
openRequest.onupgradeneeded = function (e) {
    console.log("running onupgradeneeded");
    var thisDb = e.target.result;
    //Create Object Store
    if (!thisDb.objectStoreNames.contains("positions")) {
        console.log("I need to make the positions objectstore");
        var objectStore = thisDb.createObjectStore("positions", {autoIncrement: true});
    }
    if (!thisDb.objectStoreNames.contains("savedMovies")) {
        console.log("I need to make the savedMovies objectstore");
        var objectStore = thisDb.createObjectStore("savedMovies", {autoIncrement: true});
    }
}

openRequest.onsuccess = function (e) {
    db = e.target.result;
    db.onerror = function (e) {
        alert("Sorry, an unforseen error was thrown.");
        console.log("***ERROR***");
        console.dir(e.target);
    }

    if (!db.objectStoreNames.contains("positions")) {
        version = db.version
        db.close()
        secondRequest = indexedDB.open("ReplayDatabase", version + 1)
        secondRequest.onupgradeneeded = function (e) {
            console.log("running onupgradeneeded");
            var thisDb = e.target.result;
            //Create Object Store
            if (!thisDb.objectStoreNames.contains("positions")) {
                console.log("I need to make the positions objectstore");
                var objectStore = thisDb.createObjectStore("positions", {autoIncrement: true});
            }
            if (!thisDb.objectStoreNames.contains("savedMovies")) {
                console.log("I need to make the savedMovies objectstore");
                var objectStore = thisDb.createObjectStore("savedMovies", {autoIncrement: true});
            }
        }
        secondRequest.onsuccess = function (e) {
            db = e.target.result
        }
    }
    if (!db.objectStoreNames.contains("savedMovies")) {
        version = db.version
        db.close()
        secondRequest = indexedDB.open("ReplayDatabase", version + 1)
        secondRequest.onupgradeneeded = function (e) {
            console.log("running onupgradeneeded");
            var thisDb = e.target.result;
            //Create Object Store
            if (!thisDb.objectStoreNames.contains("positions")) {
                console.log("I need to make the positions objectstore");
                var objectStore = thisDb.createObjectStore("positions", {autoIncrement: true});
            }
            if (!thisDb.objectStoreNames.contains("savedMovies")) {
                console.log("I need to make the savedMovies objectstore");
                var objectStore = thisDb.createObjectStore("savedMovies", {autoIncrement: true});
            }
        }
        secondRequest.onsuccess = function (e) {
            db = e.target.result
        }
    }
}

var title;
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.method == 'setPositionData' || message.method == 'setPositionDataFromImport') {
    	tabNum = sender.tab.id;
        if (typeof message.newName !== 'undefined') {
            var name = message.newName
        } else {
            var name = 'replays' + new Date().getTime()
        }
        var deleteTheseData = (message.oldName !== null && typeof message.oldName !== 'undefined') ? true : false;
        transaction = db.transaction(["positions"], "readwrite")
        objectStore = transaction.objectStore('positions')
        console.log('got data from content script.')
        positions = cleanPositionData(JSON.parse(message.positionData))
        var metadata = extractMetaData(positions);
        var thisPreview = drawPreview(positions);
        localStorage.setItem(name, JSON.stringify(metadata));
        var obj = {};
        obj[name] = thisPreview;
        chrome.storage.local.set(obj);
        
        request = objectStore.put(JSON.stringify(positions), name)
        request.onsuccess = function () {
        	if(deleteTheseData) {
        		console.log('new replay saved, deleting old replay...');
        		deleteData({fileName: message.oldName, newName: message.newName, metadata: metadata, preview: thisPreview}, tabNum);
        	} else {
        		if(message.method === 'setPositionDataFromImport') {
        			sendResponse({replayName: name, 
        			              metadata: JSON.stringify(metadata), 
        			              preview: thisPreview});
        		} else {
                	chrome.tabs.sendMessage(tabNum, {method: "dataSetConfirmationFromBG", 
                	                                 replayName: name, 
                	                                 metadata: JSON.stringify(metadata), 
                	                                 preview: thisPreview});
                	console.log('sent confirmation');
                }
            }
        }
        return true;
    } else if (message.method == 'requestData') {
    	tabNum = sender.tab.id;
        console.log('got data request for ' + message.fileName);
        getPosData(message.fileName, tabNum);
    } else if (message.method == 'requestList') {
    	tabNum = sender.tab.id;
        console.log('got list request');
        listItems();
    } else if (message.method == 'requestDataForDownload') {
    	tabNum = sender.tab.id;
    	if(message.fileName || message.files.length == 1) { // old, single button
        	console.log('got data request for download - ' + message.fileName || message.files[0]);
        	getPosDataForDownload(message.fileName || message.files[0], tabNum);
        	return;
        }
        if(message.files) {
        	console.log('got request to download raw data for: ' + message.files)
        	getRawDataAndZip(message.files);
        }
        return true;
    } else if (message.method == 'requestDataDelete') {
    	tabNum = sender.tab.id;
        console.log('got delete request for ' + message.fileName);
        deleteData(message.fileName, tabNum);
    } else if (message.method == 'requestFileRename') {
    	tabNum = sender.tab.id;
        console.log('got rename request for ' + message.oldName + ' to ' + message.newName)
        renameData(message.oldName, message.newName, tabNum);
    } else if (message.method == 'renderMovie') {
    	tabNum = sender.tab.id;
        console.log('got request to render Movie for ' + message.name);
        localStorage.setItem('canvasWidth', message.canvasWidth);
        localStorage.setItem('canvasHeight', message.canvasHeight);
        can.width = message.canvasWidth;
		can.height = message.canvasHeight;
        renderMovie(message.name, message.useTextures, message.useSplats, message.useSpin, message.useClockAndScore, message.useChat, true);
    } else if (message.method == 'downloadMovie') {
    	tabNum = sender.tab.id;
        console.log('got request to download Movie for ' + message.name);
        downloadMovie(message.name);
    } else if (message.method == 'setTextureData') {
    	tabNum = sender.tab.id;
        console.log('got request to save texture image files')
        saveTextures(JSON.parse(message.textureData));
    } else if (message.method == 'cleanRenderedReplays') {
    	tabNum = sender.tab.id;
        console.log('got request to clean rendered replays')
        getCurrentReplaysForCleaning()
    } else if (message.method == 'renderAllInitial') {
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
    } else if (message.method == 'renderAllSubsequent') {
    	tabNum = sender.tab.id;
        console.log('got request to render subsequent replay: ' + message.data[message.replayI])
        renderMovie(message.data[message.replayI], message.useTextures, message.useSplats, message.useSpin, message.useClockAndScore, message.useChat, message.lastOne, message.data, message.replayI, tabNum)
    }
});


/*
(initialStart = function() {
	if(typeof db !== 'undefined') {
		console.log('starting up');
		tabNum = 0;
		listItems();
	} else {
		setTimeout(initialStart, 100);
	}
})()
*/


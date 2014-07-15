// this is a function to get all the keys in the object store
//   It sends a message to the content script once it gets the keys 
function listItems() {
	allKeys = []
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.openCursor(null);
	request.onsuccess=function(){
		if(request.result){
			allKeys.push(request.result.key);
			request.result.continue()
		} else {
			chrome.tabs.sendMessage(tabNum, {method:"itemsList",title:allKeys}) 
    		console.log('sent reply')
    	}
	}
}

// this is a function to get position data from the object store
//   It sends a message to the content script once it gets the data 
function getPosData(dataFileName) {
	positionData = []
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.get(dataFileName);
	request.onsuccess=function(){
		thisObj = request.result.value
		chrome.tabs.sendMessage(tabNum, {method:"positionData",title:request.result}) 
    	console.log('sent reply')
	}
}

// this gets position data from object store so that it can be downloaded by user.
function getPosDataForDownload(dataFileName) {
	positionData = []
	var transaction = db.transaction(["positions"], "readonly");
	var store = transaction.objectStore("positions");
	var request = store.get(dataFileName);
	request.onsuccess=function(){
		thisObj = request.result.value
		chrome.tabs.sendMessage(tabNum, {method:"positionDataForDownload",
										 fileName:dataFileName,
										 title:request.result}) 
    	console.log('sent reply')
	}
}


// Set up indexedDB
var openRequest = indexedDB.open("ReplayDatabase",1);
openRequest.onupgradeneeded = function(e) {
	console.log("running onupgradeneeded");
	var thisDb = e.target.result;
	//Create Object Store
	if(!thisDb.objectStoreNames.contains("positions")) {
		console.log("I need to make the positions objectstore");
		var objectStore = thisDb.createObjectStore("positions", { autoIncrement:true }); 
	}
}
 
openRequest.onsuccess = function(e) {
	db = e.target.result;
 
	db.onerror = function(e) {
		alert("Sorry, an unforseen error was thrown.");
		console.log("***ERROR***");
		console.dir(e.target);
	}
 
	if(!db.objectStoreNames.contains("positions")) {
		var versionRequest = db.setVersion("1");
		versionRequest.onsuccess = function(e) {
			var objectStore = db.createObjectStore("positions", { autoIncrement:true });  
		}
	}
}

var title;
chrome.runtime.onMessage.addListener(function(message,sender,sendResponse){
  if(message.method == 'setPositionData') {
    transaction = db.transaction(["positions"], "readwrite")
	objectStore = transaction.objectStore('positions')
	console.log('got data from content script.')
	request = objectStore.add(message.positionData, 'replays'+new Date().getTime())
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		chrome.tabs.sendMessage(tabNum, {method:"dataSetConfirmationFromBG"}) 
    	console.log('sent confirmation')
  	})
  } else if(message.method == 'requestData') {
    console.log('got data request for '+message.fileName)
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		getPosData(message.fileName)
  	})
  } else if(message.method == 'requestList') {
	console.log('got list request')
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		listItems()
  	})
  } else if(message.method == 'requestDataForDownload') {
  	console.log('got data request for download')
  	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  		tabNum = tabs[0].id
  		getPosDataForDownload(message.fileName)
  	})
  }
});



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

transaction = db.transaction(["positions"], "readwrite")
objectStore = transaction.objectStore('positions')
request = objectStore.add('this is also a test', 'tester2')

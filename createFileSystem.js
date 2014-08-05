// create file system.
function createFileSystem(secondFunction, secondArguments) {


	// Handle vendor prefixes.
	window.requestFileSystem = window.requestFileSystem || 
                           window.webkitRequestFileSystem;

	function initFS(filesystem) {
		console.log('FileSystem Loaded')
		fs = filesystem
		// create a directory to store videos
		fs.root.getDirectory('savedMovies', {create: true}, function(dirEntry) {
  			console.log('You have just created the ' + dirEntry.name + ' directory.');
  			secondFunction(fs, 'savedMovies', secondArguments)
		}, errorHandler);
	}

	function errorHandler(err){
	 var msg = 'An error occured: ';
	  switch (err.code) { 
	    case FileError.NOT_FOUND_ERR: 
	      msg += 'File or directory not found'; 
	      break;
	    case FileError.NOT_READABLE_ERR: 
	      msg += 'File or directory not readable'; 
	      break;
	    case FileError.PATH_EXISTS_ERR: 
	      msg += 'File or directory already exists'; 
	      break;
	    case FileError.TYPE_MISMATCH_ERR: 
	      msg += 'Invalid filetype'; 
	      break;
	    default:
	      msg += 'Unknown Error'; 
	      break;
	  };	
	 console.log(msg);
	};

	window.requestFileSystem(window.PERSISTENT, 1024*1024*1024, initFS, errorHandler);
}

// function to print directory contents
function readDirectory(fs, directory) {
	fs.root.getDirectory(directory, {}, function(dirEntry){
	  var dirReader = dirEntry.createReader();
	  dirReader.readEntries(function(entries) {
	    for(var i = 0; i < entries.length; i++) {
	      var entry = entries[i];
	      if (entry.isDirectory){
	        console.log('Directory: ' + entry.fullPath);
	      }
	      else if (entry.isFile){
	        console.log('File: ' + entry.fullPath);
	      }
	    }
	 
	  }, function(){console.log('error1')});
	}, function(){console.log('error1')}); 
}

// function that creates and fills a file
function saveMovieFile(fs, directory, secondArguments) {
	function errorHandler(err){
	 var msg = 'An error occured: ';
	  switch (err.code) { 
	    case FileError.NOT_FOUND_ERR: 
	      msg += 'File or directory not found'; 
	      break;
	    case FileError.NOT_READABLE_ERR: 
	      msg += 'File or directory not readable'; 
	      break;
	    case FileError.PATH_EXISTS_ERR: 
	      msg += 'File or directory already exists'; 
	      break;
	    case FileError.TYPE_MISMATCH_ERR: 
	      msg += 'Invalid filetype'; 
	      break;
	    default:
	      msg += 'Unknown Error'; 
	      break;
	  };	
	 console.log(msg);
	};
	fileName = secondArguments[0].replace(/.*DATE/,'').replace('replays','')
	movie = secondArguments[1]
	fs.root.getFile(directory+'/'+fileName, {create: true}, function(fileEntry) {
		fileEntry.createWriter(function(fileWriter) {
			fileWriter.write(movie)
		}, errorHandler)
	}, errorHandler)
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
  return new Blob([ab],{type:'video/webm'});
}

// function to read contents of file -- no return value, this creates a variable called 'movie'
function getMovieFile(fs, directory, secondArguments) {
	function errorHandler(err){
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  						tabNum = tabs[0].id
  						chrome.tabs.sendMessage(tabNum, {method:"movieDownloadFailure"}) 
    					console.log('sent movie download failure notice')
  					})
	};
	delete(movie)
	name = secondArguments[0]
	fileName = name.replace(/.*DATE/,'').replace('replays','')
	console.log(fileName)
	fs.root.getFile(directory+'/'+fileName, {}, function(fileEntry) {
		fileEntry.file(function(file) {
		    reader = new FileReader();
    		reader.onloadend = function(e) {
      			movie = dataURItoBlob(this.result);
      			movie.type = 'video/webm'
      			if(typeof movie !== "undefined") {
					saveVideoData(name.replace(/DATE.*/,'')+'.webm', movie)
					chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
  						tabNum = tabs[0].id
  						chrome.tabs.sendMessage(tabNum, {method:"movieDownloadConfirmation"}) 
    					console.log('sent movie download confirmation')
  					})
  				}      
    		};
    		reader.readAsDataURL(file);     
  		}, errorHandler);
	}, errorHandler);
}
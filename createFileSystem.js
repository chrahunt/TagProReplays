// create file system.
function createFileSystem(thisDirectory, secondFunction, secondArguments) {


    // Handle vendor prefixes.
    window.requestFileSystem = window.requestFileSystem ||
    window.webkitRequestFileSystem;

    function initFS(filesystem) {
        console.log('FileSystem Loaded')
        fs = filesystem
        // create a directory to store videos
        fs.root.getDirectory(thisDirectory, {create: true}, function (dirEntry) {
            console.log('You have just created the ' + dirEntry.name + ' directory.');
            secondFunction(fs, thisDirectory, secondArguments)
        }, errorHandler);
    }

    function errorHandler(err) {
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
        }
        ;
        console.log(msg);
    };

    window.requestFileSystem(window.PERSISTENT, 50 * 1024 * 1024 * 1024, initFS, errorHandler);
}

// function to get savedMovies directory contents
function getRenderedMovieNames(fs, directory, secondArguments) {
    cont = []
    var allKeys = secondArguments[0];
    var textures = secondArguments[1];
    var metadata = secondArguments[2];
    var previews = secondArguments[3];
    fs.root.getDirectory(directory, {}, function (dirEntry) {
        var dirReader = dirEntry.createReader();
        dirReader.readEntries(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                cont.push(entry.name)
            }
            chrome.tabs.sendMessage(tabNum, {method: "itemsList", 
            								 positionKeys: allKeys, 
            								 movieNames: cont, 
            								 textures: textures,
            								 metadata: JSON.stringify(metadata),
            								 previews: previews
            })
            console.log('sent reply: ' + allKeys)
        }, function () {
            console.log('error1')
        });
    }, function () {
        console.log('error2')
    });
}

// function that creates and fills a file
function saveMovieFile(fs, directory, secondArguments) {
    function errorHandler(err) {
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
        }
        ;
        console.log(msg);
    };
    fileName = secondArguments[0].replace(/.*DATE/, '').replace('replays', '')
    movie = secondArguments[1]
    fs.root.getFile(directory + '/' + fileName, {create: true}, function (fileEntry) {
        fileEntry.createWriter(function (fileWriter) {
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
    return new Blob([ab], {type: 'video/webm'});
}

// function to read contents of file -- no return value, this creates a variable called 'movie'
function getMovieFile(fs, directory, secondArguments) {
    function errorHandler(err) {
        chrome.tabs.sendMessage(tabNum, {method: "movieDownloadFailure"});
        console.log('sent movie download failure notice');
    };
    delete(movie)
    name = secondArguments[0]
    fileName = name.replace(/.*DATE/, '').replace('replays', '')
    console.log(fileName)
    fs.root.getFile(directory + '/' + fileName, {}, function (fileEntry) {
        fileEntry.file(function (file) {
            reader = new FileReader();
            reader.onloadend = function (e) {
                movie = dataURItoBlob(this.result);
                movie.type = 'video/webm'
                if (typeof movie !== "undefined") {
                    saveVideoData(name.replace(/DATE.*/, '') + '.webm', movie)
                    chrome.tabs.sendMessage(tabNum, {method: "movieDownloadConfirmation"})
                    console.log('sent movie download confirmation')
                }
            };
            reader.readAsDataURL(file);
        }, errorHandler);
    }, errorHandler);
}


/////////////////////////////////////////////////////////////
//  functions for clearing deleted movies from filesystem  //
/////////////////////////////////////////////////////////////

// function to delete rendered movies from savedMovies filesystem directory
function deleteMovieFile(fs, directory, name) {
    function errorHandler(err) {
        console.log(err)
    }

    fs.root.getFile(directory + '/' + name, {}, function (fileEntry) {
            fileEntry.remove(function () {
                console.log('deleted movie file ' + name)
            })
        },
        errorHandler)
}

// function to check if a filesystem movie filename is in the indexedDB contents
function fileInIndexedDB(movieName, indexedDBContents) {
    for (var k = 0; k < indexedDBContents.length; k++) {
        if (movieName == indexedDBContents[k].replace(/.*DATE/, '').replace('replays', '')) {
            return (true)
        }
    }
    return (false)
}

// function that takes an array of position files from indexedDB, looks up filesystem contents, and 
//    calls deleteMovieFile for every entry in filesystem that is not in indexedDB
function cleanMovieFiles(fs, directory, secondArguments) {
    indexedDBContents = secondArguments[0]
    function errorHandler(err) {
        console.log(err)
    }

    fs.root.getDirectory(directory, {}, function (dirEntry) {
        var dirReader = dirEntry.createReader();
        dirReader.readEntries(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                if (!fileInIndexedDB(entry.name, indexedDBContents)) {
                    deleteMovieFile(fs, directory, entry.name)
                }
            }
        }, function () {
            console.log('error1')
        });
    }, function () {
        console.log('error2')
    });
}		
	    

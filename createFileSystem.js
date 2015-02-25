/**
 * This script is included as a background script.
 */
(function(window) {

function getMoviePath(directory, )
// create file system.
// scope: background.
/**
 * [createFileSystem description]
 * @param  {string} thisDirectory - The directory to access.
 * @param  {[type]} secondFunction  [description]
 * @param  {[type]} secondArguments [description]
 * @return {[type]}                 [description]
 */
//function createFileSystem(thisDirectory, secondFunction, secondArguments) {
// callback should be a function that takes the created file system and directory name.
window.createFileSystem = function(directory, callback) {

    // Handle vendor prefixes.
    window.requestFileSystem = window.requestFileSystem ||
    window.webkitRequestFileSystem;

    function initFS(filesystem) {
        console.log('FileSystem Loaded');
        var fs = filesystem;
        // Create a directory to store videos.
        fs.root.getDirectory(directory, {create: true}, function (dirEntry) {
            console.log(dirEntry.name + ' directory created.');
            callback(fs, directory);
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
        console.log(msg);
    };

    window.requestFileSystem(window.PERSISTENT, 50 * 1024 * 1024 * 1024, initFS, errorHandler);
}

// scope: background
// uses: tabNum
/**
 * Function to get savedMovies directory contents.
 * @param  {[type]} fs        [description]
 * @param  {[type]} directory [description]
 * @param  {[type]} allKeys   [description]
 * @param  {[type]} textures  [description]
 * @param  {[type]} metadata  [description]
 * @param  {[type]} previews  [description]
 */
window.getRenderedMovieNames = function(fs, directory, allKeys, textures, metadata, previews) {
    var cont = [];
    fs.root.getDirectory(directory, {}, function (dirEntry) {
        var dirReader = dirEntry.createReader();
        dirReader.readEntries(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                cont.push(entry.name)
            }
            chrome.tabs.sendMessage(tabNum, {
                method: "itemsList", 
                positionKeys: allKeys, 
                movieNames: cont, 
                textures: textures,
                metadata: JSON.stringify(metadata),
                previews: previews
            });
            console.log('sent reply: ' + allKeys)
        }, function () {
            console.log('error1')
        });
    }, function () {
        console.log('error2')
    });
}

/**
 * Function that creates and fills a file.
 * @param  {[type]} fs        [description]
 * @param  {[type]} directory [description]
 * @param  {[type]} filename  [description]
 * @param  {[type]} movie     [description]
 */
window.saveMovieFile = function(fs, directory, filename, movie) {
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
    }

    filename = filename.replace(/.*DATE/, '').replace('replays', '');
    fs.root.getFile(directory + '/' + filename, {create: true}, function (fileEntry) {
        fileEntry.createWriter(function (fileWriter) {
            fileWriter.write(movie);
        }, errorHandler);
    }, errorHandler);
}

// scope: file
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
window.getMovieFile = function(fs, directory, filename) {
    function errorHandler(err) {
        chrome.tabs.sendMessage(tabNum, {
            method: "movieDownloadFailure"
        });
        console.log('sent movie download failure notice');
    };
    delete movie;
    filename = filename.replace(/.*DATE/, '').replace('replays', '');
    console.log(filename);
    fs.root.getFile(directory + '/' + filename, {}, function (fileEntry) {
        fileEntry.file(function (file) {
            var reader = new FileReader();
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
        console.log(err);
    }

    fs.root.getFile(directory + '/' + name, {}, function (fileEntry) {
        fileEntry.remove(function () {
            console.log('deleted movie file ' + name)
        });
    }, errorHandler);
}

// function to check if a filesystem movie filename is in the indexedDB contents
function fileInIndexedDB(movieName, indexedDBContents) {
    for (var k = 0; k < indexedDBContents.length; k++) {
        if (movieName == indexedDBContents[k].replace(/.*DATE/, '').replace('replays', '')) {
            return true;
        }
    }
    return false;
}

// function that takes an array of position files from indexedDB, looks up filesystem contents, and 
//    calls deleteMovieFile for every entry in filesystem that is not in indexedDB
function cleanMovieFiles(fs, directory, indexedDBContents) {
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
	    
})(window);

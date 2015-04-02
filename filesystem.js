/**
 * This script provides functions for saving and retrieving rendered
 * movie files stored using the FileSystem API.
 * 
 * This script is included as a background script.
 */
(function(window) {

// Filesystem directory in which movies are saved.
var MOVIE_DIR = 'savedMovies';

function deleteFile(path, callback, error) {
    if (typeof error == 'undefined') error = errorHandler;
    getFileSystem(function(fs) {
        fs.root.getFile(path, {}, function(fileEntry) {
            fileEntry.remove(callback);
        }, error);
    });
}

/**
 * Write data to given path.
 * @param  {string} path - Path to write the data to.
 * @param  {*} data - Data to write to the path.
 * @param  {Function} [error=errorHandler] - The error handler to use.
 */
function saveFile(path, data, error) {
    if (typeof error == 'undefined') error = errorHandler;
    getFileSystem(function(fs) {
        fs.root.getFile(path, {create: true}, function (fileEntry) {
            fileEntry.createWriter(function (fileWriter) {
                fileWriter.write(data);
            }, error);
        }, error);
    });
}

/**
 * Get file from filesystem and pass the retrieved file to the callback
 * or null if no file was found.
 * @param {string} path
 * @param {Function} callback
 * @param {Function} error
 * 
 */
function getFile(path, callback, error) {
    getFileSystem(function(fs) {
        fs.root.getFile(path, {}, callback, error);
    });
}

/**
 * Get directory and pass resulting dirEntry to callback. Directory
 * is created if it does not already exist.
 * @param  {string} directory 
 * @param {function} callback - callback of the form `function(dirEntry) {...}`.
 */
function getDirectory(directory, callback, error) {
    if (typeof error == 'undefined') error = errorHandler;
    getFileSystem(function(fs) {
        fs.root.getDirectory(directory, { create: true }, function (dirEntry) {
            callback(dirEntry);
        }, error);
    });
}

/**
 * Generic error handler for file system interactions.
 * @param  {FileException} err - The error.
 */
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

/**
 * Get file system, creating if needed. Callback is passed the file
 * system object.
 */
function getFileSystem(callback, error) {
    var requestFileSystem = window.requestFileSystem ||
        window.webkitRequestFileSystem;
    if (typeof error == 'undefined') error = errorHandler;
    var size = 50 * 1024 * 1024 * 1024;
    requestFileSystem(window.PERSISTENT, size, callback, error);
}

/**
 * Retrieve the name of rendered movie files and pass to callback. The
 * file names are passed as an array of strings.
 * @param {Function} callback - The callback function that receives the
 *   array of movie names.
 */
window.getRenderedMovieNames = function(callback) {
    getDirectory(MOVIE_DIR, function(dirEntry) {
        var dirReader = dirEntry.createReader();
        dirReader.readEntries(function (entries) {
            var names = entries.map(function(entry) {
                return entry.name;
            });
            callback(names);
        }, errorHandler);
    });
}

/**
 * Save the movie with the given filename.
 * @param  {string} filename - The name under which to save the movie.
 * @param  {Blob} movie - The movie file to save.
 */
window.saveMovieFile = function(filename, movie) {
    saveFile(MOVIE_DIR + '/' + filename, movie);
}

/**
 * Retrieve the movie corresponding to the given file name and pass
 * the dataURI representation of the movie to the callback. If there is
 * an error retrieving the movie, then error is called.
 * @param  {string} filename - The name of the movie to retrieve.
 * @param  {Function} callback - The callback function to call with the
 *   retrieved movie dataURL
 * @param  {Function} [error] - The error handler function.
 */
window.getMovieFile = function(filename, callback, error) {
    getFile(MOVIE_DIR + '/' + filename, function(fileEntry) {
        fileEntry.file(function(file) {
            var reader = new FileReader();
            reader.onloadend = function (e) {
                var dataUri = this.result;
                callback(dataUri);
            };
            reader.readAsDataURL(file);
        }, error);
    }, error);
}

/**
 * Delete the movie file with the given name.
 * @param  {string} name - The name of the movie file to delete.
 */
function deleteMovieFile(name) {
    deleteFile(MOVIE_DIR + '/' + name, function() {
        console.log('deleted movie file ' + name)
    });
}

/**
 * Delete a list of movie files.
 * @param  {Array.<string>} names - The file names for the movie files
 *   to remove.
 */
window.deleteMovieFiles = function(names) {
    getRenderedMovieNames(function(filenames) {
        filenames.forEach(function(filename) {
            if (names.indexOf(filename) !== -1) {
                deleteMovieFile(filename);
            }
        });
    });
}      
        
})(window);

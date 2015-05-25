/**
 * This script provides functions for saving and retrieving rendered
 * movie files stored using the FileSystem API.
 * 
 * This script is included as a background script.
 */

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
    console.error(msg);
}

/**
 * Get file system, creating if needed. Callback is passed the file
 * system object.
 */
function getFileSystem(callback, error) {
    var requestFileSystem = window.requestFileSystem ||
        window.webkitRequestFileSystem;
    var size = 50 * 1024 * 1024 * 1024;
    requestFileSystem(window.PERSISTENT, size, callback, error);
}

/**
 * Get directory and pass resulting dirEntry to callback. Directory
 * is created if it does not already exist.
 * @param {string} directory 
 * @param {function} callback - callback of the form `function(dirEntry) {...}`.
 */
function getDirectory(directory, callback, error) {
    getFileSystem(function(fs) {
        fs.root.getDirectory(directory, { create: true }, function (dirEntry) {
            callback(dirEntry);
        }, error);
    }, error);
}

/**
 * Delete file at the given path.
 * @param {string} path - The location of the file to delete.
 * @param {Function} callback - The function called on success.
 * @param {Function} error - The function called with any error.
 */
exports.deleteFile = function(path, callback, error) {
    getFileSystem(function(fs) {
        fs.root.getFile(path, {}, function(fileEntry) {
            fileEntry.remove(callback, error);
        }, error);
    }, error);
};

/**
 * Write data to given path.
 * @param  {string} path - Path to write the data to.
 * @param  {*} data - Data to write to the path.
 * @param  {Function} [error=errorHandler] - The error handler to use.
 */
exports.saveFile = function(path, data, callback, error) {
    getFileSystem(function(fs) {
        fs.root.getFile(path, { create: true }, function (fileEntry) {
            fileEntry.createWriter(function (fileWriter) {
                fileWriter.onwriteend = function () {
                    if (!fileWriter.error) {
                        callback();
                    } else {
                        error(fileWriter.error);
                    }
                };
                fileWriter.write(data);
            }, error);
        }, error);
    }, error);
};

/**
 * Get file from filesystem and pass the retrieved file to the callback
 * or null if no file was found.
 * @param {string} path
 * @param {Function} callback
 * @param {Function} error
 */
exports.getFile = function(path, callback, error) {
    getFileSystem(function(fs) {
        fs.root.getFile(path, {}, function(fileEntry) {
            fileEntry.file(function(file) {
                callback(file);
            });
        }, error);
    }, error);
};

/**
 * Retrieve the name of rendered movie files and pass to callback. The
 * file names are passed as an array of strings.
 * @param {Function} callback - The callback function that receives the
 *   array of file names from the directory.
 */
exports.readDirectory = function(path, callback, error) {
    function readFullDirectory(dirReader, names) {
        dirReader.readEntries(function (entries) {
            if (entries.length === 0) {
                callback(names);
            } else {
                names = names.concat(entries.map(function(entry) {
                    return entry.name;
                }));
                readFullDirectory(dirReader, names);
            }
        }, error);
    }
    getDirectory(path, function(dirEntry) {
        var dirReader = dirEntry.createReader();
        var movieNames = [];
        readFullDirectory(dirReader, []);
    }, error);
};

exports.createDirectory = function(path, callback, error) {
    getDirectory(path, function(dirEntry) {
        callback();
    }, error);
};

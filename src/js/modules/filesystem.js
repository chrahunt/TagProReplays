var logger = require('./logger')('filesystem');

/**
 * This script provides functions for saving and retrieving rendered
 * movie files stored using the FileSystem API.
 */
/**
 * Takes a filesystem function that takes a callback and error function
 * in its last two arguments and wraps it in a Promise that returns a
 * value (if one is returned), or rejects on any error.
 * @param {Function} fn - The function to wrap.
 * @return {Function} - The wrapped function.
 */
function wrap(fn) {
    // Returns function that calls the given function with arguments
    // provided when called.
  function caller(fn) {
    return function () {
      fn(...arguments);
    };
  }
  return function () {
    return new Promise((resolve, reject) => {
      fn(...arguments, caller(resolve), caller(reject));
    });
  };
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
  logger.error(msg);
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
 * @param {function} callback - callback of the form
 *   `function(dirEntry) {...}`.
 */
function getDirectory(directory, callback, error) {
  getFileSystem((fs) => {
    fs.root.getDirectory(directory, { create: true }, (dirEntry) => {
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
function deleteFile(path, callback, error) {
  getFileSystem((fs) => {
    fs.root.getFile(path, {}, (fileEntry) => {
      fileEntry.remove(callback, error);
    }, error);
  }, error);
}

/**
 * Write data to given path.
 * @param  {string} path - Path to write the data to.
 * @param  {*} data - Data to write to the path.
 * @param  {Function} [error=errorHandler] - The error handler to use.
 */
function saveFile(path, data, callback, error) {
  getFileSystem((fs) => {
    fs.root.getFile(path, { create: true }, (fileEntry) => {
      fileEntry.createWriter((fileWriter) => {
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
}

/**
 * Get file from filesystem and pass the retrieved file to the callback
 * or null if no file was found.
 * @param {string} path
 * @param {Function} callback
 * @param {Function} error
 */
function getFile(path, callback, error) {
  getFileSystem((fs) => {
    fs.root.getFile(path, {}, (fileEntry) => {
      fileEntry.file((file) => {
        callback(file);
      });
    }, error);
  }, error);
}

/**
 * Retrieve the name of rendered movie files and pass to callback. The
 * file names are passed as an array of strings.
 * @param {Function} callback - The callback function that receives the
 *   array of file names from the directory.
 */
function readDirectory(path, callback, error) {
  function readFullDirectory(dirReader, names) {
    dirReader.readEntries((entries) => {
      if (entries.length === 0) {
        callback(names);
      } else {
        names = names.concat(entries.map((entry) => entry.name));
        readFullDirectory(dirReader, names);
      }
    }, error);
  }
  getDirectory(path, (dirEntry) => {
    var dirReader = dirEntry.createReader();
    readFullDirectory(dirReader, []);
  }, error);
}

/**
 * Create a directory if it does not already exist.
 * @param {Function} callback - function to be called when
 *   directory is created. Takes parameters 'dirEntry' and 'exists'
 *   which indicates whether the directory already existed.
 */
function createDirectory(path, callback, error) {
  getFileSystem((fs) => {
    fs.root.getDirectory(path, { create: false }, (dirEntry) => {
      callback(dirEntry, true);
    }, (err) => {
      if (err.name === "NotFoundError") {
        fs.root.getDirectory(path, { create: true }, (dirEntry) => {
          callback(dirEntry, false);
        }, error);
      } else {
        error(err);
      }
    });
  }, error);
}

var fs = {
  deleteFile: wrap(deleteFile),
  saveFile: wrap(saveFile),
  getFile: wrap(getFile),
  readDirectory: wrap(readDirectory),
  createDirectory: wrap(createDirectory),
  ready: ready
};

function ready() {
  // Initialize FileSystem Replay folder.
  return fs.createDirectory("savedMovies").then((_, existed) => {
    if (!existed) {
      logger.debug("Saved movies directory created.");
    } else {
      logger.debug("Saved movies directory exists.");
    }
  }).catch((err) => {
    logger.error("Error creating saved movies directory: ", err);
    throw err;
  });
}

module.exports = fs;

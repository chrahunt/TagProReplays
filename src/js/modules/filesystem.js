var logger = require('./logger')('filesystem');

var requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
var default_size = 50 * 1024 * 1024 * 1024;

function requestFS(size) {
  return new Promise((resolve, reject) => {
    requestFileSystem(window.PERSISTENT, size, resolve, reject);
  });
}

function getFileAsPromise(entry, path) {
  return new Promise((resolve, reject) => {
    entry.getFile(path, { create: true }, resolve, reject);
  });
}

// Given a FileEntry, returns a promise that resolves to the file.
function fileAsPromise(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function deleteFileAsPromise(entry, path) {
  return new Promise((resolve, reject) => {
    entry.getFile(path, {}, (entry) => {
      entry.remove(resolve);
    }, reject);
  });
}

function writeFileAsPromise(entry, data) {
  logger.info('writeFileAsPromise()');
  return new Promise((resolve, reject) => {
    entry.createWriter((writer) => {
      writer.onwriteend = () => {
        if (!writer.error) {
          resolve();
        } else {
          reject(writer.error);
        }
      };
      writer.write(data);
    });
  });
}

function getDirectoryAsPromise(entry, path) {
  return new Promise((resolve, reject) => {
    entry.getDirectory(path, { create: true }, resolve, reject);
  });
}

function mapEntriesAsPromise(entry, mapFn) {
  return new Promise((resolve, reject) => {
    let result = [];
    let reader = entry.createReader();
    let doBatch = () => {
      reader.readEntries(entries => {
        if (entries.length > 0) {
          entries.forEach(e => result.push(mapFn(e)));
          doBatch();
        } else {
          resolve(result);
        }
      }, reject);
    };
    doBatch();
  });
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
  logger.error(msg);
  throw err;
}

// External getDirectory may create the FileSystem.
// Returned promise resolves to directory entry.
function getDirectory(dir_name) {
  logger.info('getDirectory()');
  return requestFS(default_size).then((fs) => {
    logger.info('FileSystem loaded.');
    return getDirectoryAsPromise(fs.root, dir_name);
  }).then((entry) => {
    logger.info('Directory retrieved/created.');
    return entry;
  });//.catch(errorHandler);
}

// Get names of child entries.
function getEntryNames(entry) {
  logger.info('getEntryNames()');
  return mapEntriesAsPromise(entry, e => e.name); 
}

/**
 * Write data to given path.
 * @param  {string} path - Path to write the data to.
 * @param  {*} data - Data to write to the path.
 */
function saveFile(path, data) {
  logger.info('saveFile()');
  return requestFS(default_size).then((fs) => {
    logger.info('FileSystem loaded.');
    return getFileAsPromise(fs.root, path);
  }).then((entry) => {
    return writeFileAsPromise(entry, data);
  });//.catch(errorHandler);
}

/**
 * Get file at specified path.
 * @param  {string} path - Path of file to retrieve.
 */
function getFile(path) {
  logger.info('getFile()');
  return requestFS(default_size).then((fs) => {
    return getFileAsPromise(fs.root, path);
  }).then(fileAsPromise);//.catch(errorHandler);
}

function deleteFile(path) {
  logger.info('deleteFile()');
  return requestFS(default_size).then((fs) => {
    return deleteFileAsPromise(fs.root, path);
  });//.catch(errorHandler);
}

var fs = {
  getDirectory: getDirectory,
  getEntryNames: getEntryNames,
  saveFile: saveFile,
  getFile: getFile,
  deleteFile: deleteFile
};

module.exports = fs;

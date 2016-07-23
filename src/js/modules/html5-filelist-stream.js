var inherits = require('util').inherits;
var Readable = require('readable-stream').Readable;
var FileStream = require('./html5-file-stream');
var concat = require('concat-stream');

var logger = require('./logger')('filelist-stream');

inherits(FileListStream, Readable);
module.exports = FileListStream;

/**
 * @typedef {object} FLSOptions
 * @property {number} max_file_size - the maximum file size in bytes.
 *   By default 25 MB.
 */
/**
 * @typedef {object} FLSFile
 * @property {number} size The size of the file, in bytes.
 * @property {string} name The name of the file.
 * @property {*} data The file data.
 */
/**
 * Fires when error occurs processing a single file.
 * @event FileListStream#error
 * @type {object}
 * @property {string} name The name of the file for which the error
 *   occurred.
 * @property {string} reason Text message with reason for error.
 */
/**
 * Takes a filelist and streams file information. File information is
 * output in FLSFile format.
 * @param {FileList} filelist FileList as retrieved from a file
 *   input.
 * @param {FLSOptions} options Options defining the behavior
 *   of the stream.
 */
function FileListStream(filelist, options) {
  if (!(this instanceof FileListStream))
    return new FileListStream(filelist, options);
  if (typeof options == "undefined")
    options = {};
  logger.debug("Creating FileListStream");
  var defaults = {
    max_file_size: 1024 * 1024 * 25
  };
  var opts = Object.assign({}, defaults, options);
  opts.objectMode = true;
  Readable.call(this, opts);
  this._options = opts;
  this._files = filelist;
  this._index = 0;
  this._reading = false;
}

/**
 * Get next file.
 * @private
 * @return {File} - Next file, or null if no next file.
 */
FileListStream.prototype._next = function () {
  if (this._index >= this._files.length) return null;
  var index = this._index++;
  return this._files[index];
};

/**
 * Initiate the file reading process. One call to _read corresponds to
 * the initiation of one file reading, if one is not already being read.
 * @override
 */
FileListStream.prototype._read = function () {
  logger.debug("FileListStream#_read");
  // Stopping condition.
  if (this._index >= this._files.length) {
    logger.debug("FileListStream empty, ending stream.");
    this.push(null);
  } else if (!this._reading) {
    var file = this._next();
    if (file.size > this._options.max_file_size) {
      logger.debug("File too large, sending error.");
      this.emit('error', {
        name: file,
        reason: "exceeds max allowed size"
      });
    } else {
      logger.debug("Starting to read next file.");
      this._reading = true;
      var fs = FileStream(file, {
        encoding: 'utf8'
      });

      // Merge all read data together.
      fs.pipe(concat((data) => {
        logger.debug("Got finished file.");
        var info = {
          filename: file.name,
          data: data,
          size: file.size
        };
        this._reading = false;
        this.push(info);
      }));
    }
  }
};

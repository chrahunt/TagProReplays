var inherits = require('util').inherits;
var Readable = require('readable-stream').Readable;
var FileStream = require('./html5-file-stream');
var concat = require('concat-stream');

inherits(FileListStream, Readable);
module.exports = FileListStream;

/**
 * @typedef {object} FLSOptions
 */
/**
 * @typedef {object} FLSFile
 * @property {number} size - the size of the file, in bytes.
 * @property {string} name - the name of the file.
 * @property {*} data - the file data.
 */
/**
 * Takes a filelist and streams file information. File information is
 * output in FLSFile format.
 * @param {FileList} filelist - FileList as retrieved from a file
 *   input.
 * @param {FLSOptions} options - Options defining the behavior
 * of the stream.
 */
function FileListStream(filelist, options) {
  if (!(this instanceof FileListStream))
    return new FileListStream(filelist, options);
  if (typeof options == "undefined")
    options = {};
  options.objectMode = true;
  Readable.call(this, options);
  this._files = filelist;
  this._index = 0;
  this._reading = false;
}

/**
 * Get next file.
 * @private
 * @return {File} - Next file, or null if no next file.
 */
FileListStream.prototype._next = function() {
  if (this._index >= this._files.length) return null;
  var index = this._index++;
  return this._files[index];
};

/**
 * Initiate the file reading process. One call to _read corresponds to
 * the initiation of one file reading, if one is not already being read.
 * @override
 */
FileListStream.prototype._read = function() {
  // Stopping condition.
  if (this._index >= this._files.length) {
    this.push(null);
  } else if (!this._reading) {
    this._reading = true;
    var file = this._next();
    var fs = FileStream(file, {
      encoding: 'utf8'
    });
    var self = this;
    // Merge all read data together.
    fs.pipe(concat(function (data) {
      self._reading = false;
      var info = {
        filename: file.name,
        data: data,
        size: file.size
      };
      self.push(info);
    }));
  }
};

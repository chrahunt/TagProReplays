var inherits = require('util').inherits;
var Readable = require('readable-stream').Readable;

inherits(FileStream, Readable);
module.exports = FileStream;

/**
 * @typedef {object} Options
 * @property {number} [size] - The size, in bytes, of each chunk to
 *   read. Default is 1024 * 512 (512kb).
 * @property {string} [format] - The format to return chunks in. Can
 *   be one of `arraybuffer`, `binarystring`, `dataurl`, or `text`.
 */
/**
 * FileStream is a readable stream that can read a file in chunks.
 * Chunk size and format can be specified in options.
 * @param {File} file - The File object.
 * @param {Options} options - Options.
 */
function FileStream(file, options) {
  if (!(this instanceof FileStream))
    return new FileStream(file, options);
  if (typeof options == "undefined")
    options = {};
  Readable.call(this, options);

  this._file = file;
  this._offset = 0;
  this._size = options.size || 1024 * 512; // 512 kb
  this._format = options.format || "text";
  this.reading = false;

  this._reader = new FileReader();
  var self = this;
  this._reader.onload = function(event) {
    var data = event.target.result;
    if (data instanceof ArrayBuffer)
      data = new Buffer(new Uint8Array(data));
    var stop = !self.push(data);
    self.reading = false;
    if (!stop) {
      self.__read();
    }
  };
}

FileStream.prototype.__read = function() {
  if (this.reading) {
    return;
  } else {
    this.reading = true;
  }
  if (this._offset >= this._file.size) {
    this.push(null);
    this.reading = false;
  } else {
    var start = this._offset;
    var end = Math.min(start + this._size, this._file.size);
    var chunk;
    if (start === 0 && end === this._file.size) {
      chunk = this._file;
    } else {
      chunk = this._file.slice(start, end);
    }
    var format = this._format;
    if (format === "arraybuffer") {
      this._reader.readAsArrayBuffer(chunk);
    } else if (format === "binarystring") {
      this._reader.readAsBinaryString(chunk);
    } else if (format === "dataurl") {
      this._reader.readAsDataURL(chunk);
    } else if (format === "text") {
      this._reader.readAsText(chunk);
    }
    this._offset = end;
  }
};

FileStream.prototype._read = function() {
  this.__read();
};

// test
/*
var files = $(this).prop('files');
if (files.length === 0) return;
// testing
var fs = FileStream(files[0]);
var all = "";
fs.on('data', function (chunk) {
    all += chunk;
});
fs.on('end', function () {
    var data = JSON.parse(all);
    console.log("Data: %o", data);
});
 */

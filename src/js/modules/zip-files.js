var JSZip = require('jszip');
var sanitize = require('sanitize-filename');
var saveAs = require('file-saver');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

// Handles zipping files.
// events:
// - file: when file is handled
// - generating_int_zip: when generating/downloading intermediate zip
//     file
// - generating_final_zip: when generating/downloading final zip.
// - error: error somewhere.
// - end: after done is called.
function ZipFiles(opts) {
  EventEmitter.apply(this, arguments);
  this.zip = new JSZip();
  this.filenames = {};
  this.max_size = opts.max_size || 1024 * 1024 * 100;
  this.default_name = opts.default_name || "file";
  this.default_extension = opts.default_extension || "";
  this.current_size = 0;
  this.zip_name = opts.zip_name || "archive";
}
util.inherits(ZipFiles, EventEmitter);
module.exports = ZipFiles;

// Takes object with filename, ext, contents properties. contents can
// be blob/string.
ZipFiles.prototype.addFile = function (file) {
  var filename = sanitize(file.filename);
  if (filename === "") {
    filename =  this.default_name;
  }
  // Handle duplicate replay names.
  if (this.filenames.hasOwnProperty(filename)) {
    filename += " (" + (++this.filenames[filename]) + ")";
  } else {
    this.filenames[filename] = 0;
  }
  filename += "." + file.ext;
  var contents = file.contents;
  var size = typeof contents == "string" ? contents.length
                                         : contents.size;
  if (this.current_size !== 0 &&
      this.current_size + size > this.max_size) {
    this.emit("generating_int_zip");
    this._zip();
  }
  this.current_size += size;
  this.zip.file(filename, contents);
  this.emit("file");
};

// Call when finished.
ZipFiles.prototype.done = function (download) {
  if (typeof download == "undefined") download = true;
  if (download) {
    this.emit("generating_final_zip");
    this._zip();
  }
  this.emit("end");
};

// Generate zip file and reset.
// @private
ZipFiles.prototype._zip = function () {
  var contents = this.zip.generate({
    type: "blob",
    compression: "STORE"
  });
  saveAs(contents, this.zip_name + ".zip");
  this.zip = new JSZip();
  this.current_size = 0;
};

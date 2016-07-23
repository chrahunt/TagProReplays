var $ = require('jquery');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var logger = require('./logger')('upload');

/**
 * Upload link.
 * id is id of toggling element.
 * events:
 * - files
 */
function Upload(id) {
  EventEmitter.call(this);
  this.id = id;
  this.disabled = false;
  this.$ = $("<input>", {
    class: "hidden",
    type: "file",
    accept: ".txt,.json"
  });
  this.$.prop('multiple', true);
  this.$.insertAfter(`${id}`);

  $(`#${id}`).click((e) => {
    if (!this.disabled) {
      logger.debug(`Upload ${this.id} clicked.`);
      // Empty file input so change listener is invoked even if the
      // same file is selected.
      this.$.val('');
      this.$.click();
    }
    e.preventDefault();
  });
  this.$.change(() => {
    var files = this.$.prop('files');
    if (files.length === 0) return;
    logger.debug("Emitting Upload#files.");
    this.emit('files', files);
  });
}
util.inherits(Upload, EventEmitter);

Upload.prototype.disable = function () {
  logger.debug("Upload disabled.");
  this.disabled = true;
  this.emit('disabled');
};

Upload.prototype.enable = function () {
  logger.debug("Upload enabled.");
  this.disabled = false;
  this.emit('enabled');
};

module.exports = Upload;

const $ = require('jquery');
const EventEmitter = require('events');

var logger = require('util/logger')('upload');

/**
 * Upload component
 * Upload link.
 * Events:
 * @event Upload#files
 * @event Upload#disabled
 * @event Upload#enabled
 */
class Upload extends EventEmitter {
  /**
   * Listen on the provided element for file uploads.
   * @param {string} id
   */
  constructor(id) {
    super();
    this.id = id;
    this.disabled = false;
    this.$ = $("<input>", {
      type: "file",
      accept: ".txt,.json"
    });
    this.$.css({
      display: 'none'
    });
    this.$.prop('multiple', true);
    this.$.insertAfter(`${id}`);

    $(`#${this.id}`).click((e) => {
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

  disable() {
    logger.debug("Upload disabled.");
    this.disabled = true;
    this.emit('disabled');
  }

  enable() {
    logger.debug("Upload enabled.");
    this.disabled = false;
    this.emit('enabled');
  }
}

module.exports = Upload;

var $ = require('jquery');

var logger = require('./logger')('progress');

/**
 * For indicating the status of blocking activities.
 * @param {string} id The id of the paper-dialog.
 */
function Progress(id) {
  this.$ = $(`#${id}`);
  this.el = this.$.get(0);
  this.$buttons = this.$.find('.buttons');
  this.button = this.$buttons.find('paper-button').get(0);
  this.button.addEventListener('click', () => {
    this._button();
  });
  this.$message = this.$.find('.message');
  this.$title = this.$.find('.title');
  this.progress = this.$.find('paper-progress').get(0);
  this.activity = null;
  this._callback = () => {
    this._update();
  };
  this._close = () => {
    this.close();
  };
  this.el.modal = true;
  this.el.addEventListener('iron-overlay-canceled', () => {
    //this._closing();
  });
}

/**
 * Close the progress dialog.
 */
Progress.prototype.close = function () {
  logger.info("Progress closed.");
  this.activity.removeListener('update', this._callback);
  this.activity.removeListener('close', this._close);
  this.activity = null;
  this.el.close();
};

/**
 * Open progress with an activity.
 */
Progress.prototype.open = function (activity) {
  if (this.activity !== null) {
    throw new Error("Progress is already open.");
  }
  logger.info("Progress opened.");
  this.activity = activity;
  this.activity.on('update', this._callback);
  this.activity.on('done', this._close);
  if (this.activity.cancellable) {
    this.$buttons.addClass('hidden');
  } else {
    this.$buttons.removeClass('hidden');
  }
  this._update();
  this.el.open();
};

// Updates progress.
Progress.prototype._update = function () {
  logger.debug('Progress updated.');
  if (this.activity.progress.total) {
    this.progress.max = this.activity.progress.total;
    this.progress.value = this.activity.progress.current;
  } else {
    logger.debug("No total set");
  }

  this.$message.text(this.activity.message);

  if (this.activity.cancellable) {
    this.$buttons.removeClass("hidden");
    if (this.activity.cancel_message) {
      this.button.textContent = this.activity.cancel_message;
    } else {
      this.button.textContent = "Cancel";
    }
  } else {
    this.$buttons.addClass("hidden");
  }
};

// Button callback.
Progress.prototype._button = function () {
  logger.info('Button pressed');
  // Propagate event to activity.
  var result = this.activity.cancel();
  // Activity may return a promise that resolves on closability or
  // rejects on no closability.
  if (result && result.then) {
    result.then(() => {
      this.close();
    });
  } else if (result) {
    // don't close.
  } else {
    this.close();
  }
};

module.exports = Progress;

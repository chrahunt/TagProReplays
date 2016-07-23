var Mprogress = require('mprogress');
var $ = require('jquery');

var logger = require('./logger')('progress');

/**
 *
 */
// activity -> activity.name for getting template messages
// which can be rendered
function Progress(id) {
  this.$ = $(id);
  this.$button = this.$.find('button');
  this.$message = this.$.find('.message'),

  this.progress = new Mprogress({
    parent: `#${id} .progress`,
    template: 2
  });
  this.activity = null;
  this.callback = () => {
    this._update();
  };
}

Progress.prototype.close = function () {
  logger.info("Progress closed.");
  this.activity.removeListener("update", this.callback);
  this.activity = null;
  this.$.modal('hide');
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
  this.activity.on("update", this.callback);
  this._update();
  this.$.modal('show');
};

Progress.prototype._update = function () {
  if (this.activity.progress.total) {
    var amount = this.activity.progress.progress /
      this.activity.progress.total;
    this.progress.set(amount);
  } else {
    logger.debug("No total set");
  }

  // Indeterminate display but still keep progress bar.
  if (this.activity.progress.indeterminate) {
    this.progress.setBuffer(amount);
  } else {
    this.progress.setBuffer(1);
  }
  this.$message.text(this.activity.message);
  if (this.activity.cancellable) {
    this.$button.removeClass("hidden");
    if (this.activity.cancel_message) {
      this.$button.text(this.activity.cancel_message);
    }
  } else {
    this.$button.addClass("hidden");
  }
};

module.exports = Progress;

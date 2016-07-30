var $ = require('jquery');
var Mustache = require('mustache');

var logger = require('./logger')('dialog');

function Dialog(id) {
  this.$ = $(`#${id}`);
  this.el = this.$.get(0);
  this.el.modal = true;
  this.$message = this.$.find('.message');
  this.$title = this.$.find('.title');
  this.$buttons = this.$.find('.buttons');
}

var Extensions = [Err, Warning, Default];
Dialog.prototype.open = function (spec) {
  logger.debug('Dialog opened.');
  var source = spec;
  for (let Extension of Extensions) {
    if (Extension.applies(spec)) {
      source = new Extension(spec);
      break;
    }
  }
  source.render(this);
  if (source.dismissable) {
    this.$buttons.removeClass('hidden');
  } else {
    this.$buttons.addClass('hidden');
  }
  this.el.open();
};

Dialog.prototype.close = function () {
  this.el.close();
};

module.exports = Dialog;

// TODO: Pretty error info printing.
/**
 * Represents an error that occurs that should be reported,
 * has error theme and reporting information.
 *
 * May not be dismissed depending on severity.
 */
function Err(info) {
  this._title = info.title;
  this._error = info.error;
  this.dismissable = false;
}

Err.applies = function (spec) {
  return spec.type === "error";
};

Err._template =
  `<pre>{{error}}</pre>`;

Err.prototype.render = function (dialog) {
  dialog.$title.text = this._title;
  dialog.$message.html(Mustache.render(Err._template,
    { error: this._error.stack }));
};

/**
 * Warning or something expected for the user to be trying to do.
 */
function Warning(info) {
  this.title = "Warning";
  this.message = info.message;
  this.dismissable = info.hasOwnProperty('dismissable') ? info.dismissable
                                                        : true;
}

Warning.applies = function (spec) {
  return spec.type === "warning";
};

Warning.prototype.render = function (dialog) {
  dialog.$title = this.title;
  dialog.$message.text(this.message);
};

function Default(info) {
  this._title = info.title;
  this._message = info.message;
  this.dismissable = true;
}

Default.applies = function () {
  return true;
};

Default.prototype.render = function (dialog) {
  dialog.$title = this._title;
  dialog.$message.text(this._message);
};

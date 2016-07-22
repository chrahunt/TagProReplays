var Mprogress = require('mprogress');
var $ = require('jquery');

// activity -> activity.name for getting template messages
// which can be rendered
function Progress(id) {
  this.$ = $(id);
  this.cached = {
    state: null,
    substate: null
  };
  this.progress = new Mprogress({
    parent: '#progress .progress',
    template: 2
  });
}

Progress.prototype.close = function () {
  this.$.modal('hide');
};

Progress.prototype.open = function (activity) {
  this.activity = activity;
  this.activity.on("update", () => {
    this._update();
  });
  this._init();
  this.$.modal('show');
};

Progress.prototype._update = function () {
  var amount = this.activity.progress.progress /
    this.activity.progress.total;
  this.progress.set(amount);
  if (this.activity.progress.indeterminate) {
    this.setBuffer(amount);
  } else {
    this.setBuffer(1);
  }
};

Progress.prototype._init = function () {
  this.$.find('.message').text(this.activity.message);
  if (this.activity.cancellable) {
    this.$.find('.modal-footer').insert("<button>cancel</button>");
  }
};
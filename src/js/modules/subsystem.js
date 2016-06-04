var async = require('async');

module.exports = {
  add: function(name, ready) {
    console.log("Adding subsystem: " + name);
    this._subsystems.push({
      name: name,
      ready: ready
    });
  },
  _subsystems: [],
  init: function() {
    var self = this;
    console.log("Executing subsystem initialization.");
    return new Promise(function (resolve, reject) {
      async.each(self._subsystems, function (dep, callback) {
        console.log("Executing ready: " + dep.name);
        dep.ready().catch(function (err) {
          console.error("Error in ready: " + dep.name);
          callback(err);
        }).then(function () {
          console.log("Ready: " + dep.name);
          callback(null);
        });
      }, function (err) {
        if (!err) {
          console.log("Subsystems initialized.");
          resolve();
        } else {
          console.error("Subsystem initialization failed!");
          reject(err);
        }
      });
    });
  }
}
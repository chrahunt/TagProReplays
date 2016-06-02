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
  ready: function() {
    console.log("Executing subsystem ready.");
    return new Promise(function (resolve, reject) {
      async.each(this._subsystems, function (dep, callback) {
        dep.ready().catch(function (err) {
          console.error("Error in ready: " + dep.name);
          callback(err);
        }).then(function () {
          console.log("Ready: " + dep.name);
          callback(null);
        });
      }, function (err) {
        if (!err) {
          resolve();
          //self.handle("ready");
        } else {
          //console.error("Initialization failed!");
          // TODO: broken.
          reject(err);
          //self.handle("broken");
        }
      })
    });
  }
}
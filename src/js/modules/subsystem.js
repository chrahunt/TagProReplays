var async = require('async');

var logger = require('./logger')('subsystem');

module.exports = {
  add: function (name, ready) {
    logger.info(`Adding subsystem: ${name}`);
    this._subsystems.push({
      name: name,
      ready: ready
    });
  },
  _subsystems: [],
  init: function () {
    var self = this;
    logger.info("Executing subsystem initialization.");
    return new Promise((resolve, reject) => {
      async.each(self._subsystems, (dep, callback) => {
        logger.info(`Executing ready: ${dep.name}`);
        dep.ready().catch((err) => {
          logger.error(`Error in ready: ${dep.name}`);
          callback(err);
        }).then(() => {
          logger.info(`Ready: ${dep.name}`);
          callback(null);
        });
      }, (err) => {
        if (!err) {
          logger.info("Subsystems initialized.");
          resolve();
        } else {
          logger.error("Subsystem initialization failed!");
          reject(err);
        }
      });
    });
  }
}

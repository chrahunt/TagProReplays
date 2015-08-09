function Mutex() {
  this.locked = false;
  this.name = null;
}

module.exports = Mutex;

// Get the mutex under the specified name.
Mutex.prototype.get = function(name) {
  var self = this;
  return new Promise(function (resolve, reject) {
    if (self.locked) {
      if (self.name === name) {
        resolve();
      } else {
        reject();
      }
    } else {
      self.locked = true;
      self.name = name;
      resolve();
    }
  });
};

/**
 * Check if alright to continue.
 * @param {string} [name] - The name to check if alright
 *   to proceed, or nothing if no name.
 * @return {Promise} - Resolves if not locked or if authorized,
 *   rejects otherwise.
 */
Mutex.prototype.check = function(name) {
  var self = this;
  return new Promise(function (resolve, reject) {
    if (self.locked && self.name !== name) {
      reject();
    } else {
      resolve();
    }
  });
};

Mutex.prototype.release = function(name) {
  this.locked = false;
  this.name = null;
};

// Promise wrapper around chrome.storage.local.
module.exports = {
  get: function(items) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.get(items, function (items) {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve(items);
      });
    });
  },
  getBytesInUse: function(items) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.getBytesInUse(items, function (bytesInUse) {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve(bytesInUse);
      });
    });
  },
  set: function(items) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.set(items, function () {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve();
      });
    });
  },
  clear: function() {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.clear(function () {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve();
      });
    });
  },
  remove: function(items) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.remove(items, function () {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        else
          resolve();
      });
    });
  }
};

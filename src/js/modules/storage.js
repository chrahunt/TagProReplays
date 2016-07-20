// Promise wrapper around chrome.storage.local.
module.exports = {
  get: function (items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(items, (items) => {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve(items);
      });
    });
  },
  getBytesInUse: function (items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.getBytesInUse(items, (bytesInUse) => {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve(bytesInUse);
      });
    });
  },
  set: function (items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve();
      });
    });
  },
  clear: function () {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve();
      });
    });
  },
  remove: function (items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(items, () => {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        else
          resolve();
      });
    });
  }
};

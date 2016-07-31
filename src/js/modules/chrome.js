module.exports = {
  /**
   * Determine whether the script is running in a background page
   * context.
   * @return {Promise<boolean>} - Whether the script is running on the
   *   background page.
   */
  isBackground: function () {
    if (location.protocol != "chrome-extension:") {
      return Promise.resolve(false);
    } else {
      return new Promise((resolve, reject) => {
        chrome.runtime.getBackgroundPage((that) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(that === global);
          }
        });
      });
    }
  }
};

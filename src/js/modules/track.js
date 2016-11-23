/**
 * Contains the in-app tracking/metrics.
 */
const mixpanel = require('mixpanel-browser');

const logger = require('./logger')('track');

function isBackground() {
  // Synchronous shortcut since we don't use an options page.
  return location.protocol == 'chrome-extension:';
}

function getChromeVersion() {
  let groups = /Chrome\/([0-9.]+)/.exec(navigator.userAgent);
  return groups && groups[1];
}

function getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

function isDevMode() {
  return !('update_url' in chrome.runtime.getManifest());
}

if (isBackground()) {
  // Developer property to segment out test/unpacked extension usage.
  let mode = isDevMode() ? 'dev'
                         : 'user';

  mixpanel.init('45697f2913c69b86acf923f43dd9d066');

  // Chrome version.
  mixpanel.register({
    'Mode': mode,
    'Chrome Version': getChromeVersion(),
    'Version': getExtensionVersion()
  });

  function track(event_name, properties = {}) {
    logger.debug(`Received tracking event: ${event_name}`);
    return new Promise((resolve, reject) => {
      mixpanel.track(event_name, properties, resolve);
    });
  }
  module.exports = track;
  // Set up listener for content script.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let method = message.method;
    if (method == 'track') {
      logger.debug('Received event from content script.');
      track(message.event_name, message.properties).then(() => {
        sendResponse({});
      }).catch((err) => {
        sendResponse({
          error: err
        });
      });
    }
  });
} else {
  // Delegate to background page.
  module.exports = (event_name, properties = {}) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'track',
        event_name: event_name,
        properties: properties
      }, (result) => {
        if (result.error) {
          reject(result.error);
        } else {
          resolve();
        }
      });
    });
  };
}
/**
 * Contains the in-app tracking/metrics functions that send info
 * out to Mixpanel. When called from a content script the actual
 * mixpanel call is delegated to the background page to avoid being
 * blocked by other extensions.
 * 
 * Usage:
 * 
 *     const track = require('./track');
 *     track('Activity', {
 *       attribute_1: 'value',
 *       attribute_2: 'value'
 *     }).then(() => {
 *       console.log('All done!');
 *     }).catch((err) => {
 *       console.error(`Problem: ${err.message}`);
 *     });
 * 
 * By default the following properties are set:
 * 1. Specific version of Chrome (major, minor, build)
 * 2. User mode:
 *     - dev - loaded as an unpacked extension
 *     - user - installed version from Chrome web store
 * 3. Extension version
 */
const mixpanel = require('mixpanel-browser');

const logger = require('util/logger')('track');

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
        sendResponse({
          failed: false
        });
      }).catch((err) => {
        sendResponse({
          failed: true,
          reason: err.message
        });
      });

      return true;
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
        if (chrome.runtime.lastError) {
          logger.error(`Chrome error: ${chrome.runtime.lastError.message}`);
          reject(chrome.runtime.lastError.message);
        } else if (!result) {
          reject('No result returned from background page.');
        } else if (result.failed) {
          reject(new Error(result.reason));
        } else {
          resolve();
        }
      });
    });
  };
}

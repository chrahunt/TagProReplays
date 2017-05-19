const loadImage = require('image-promise');
require('chrome-storage-promise');

var logger = require('util/logger')('textures');
logger.info('Loading textures');

/*
 * We store default and custom textures as data URIs in
 * chrome.storage.local under
 * - textures
 * - default_textures
 * 
 * texture objects have keys corresponding to texture names
 * listed here.
 */
const texture_names = [
  'flair',
  'portal',
  'speedpad',
  'speedpadblue',
  'speedpadred',
  'splats',
  'tiles',
  'egg'
];

/*
 * Updates saved textures.
 * Each should be a data URI.
 */
exports.set = function (new_textures) {
  var result = {};
  return chrome.storage.promise.local.get("textures").then((items) => {
    var textures = items.textures;
    if (textures) {
      Object.assign(textures, new_textures);
      return chrome.storage.promise.local.set({
        textures: textures
      }).then(() => {
        logger.info('Textures updated');
      }).catch((err) => {
        logger.error('Error setting textures: ', err);
      });
    } else {
      throw new Error("Textures not set.");
    }
  });
}

/**
 * Retrieves saved textures. If custom is true then custom
 * textures are returned for sprites where they are set.
 * 
 * Each should be a data URI.
 */
exports.get = function (custom) {
  return chrome.storage.promise.local.get(['textures', 'default_textures'])
  .then(({ textures, default_textures }) => {
    let urls = [];
    for (let name of texture_names) {
      if (custom && textures[name]) {
        urls.push(textures[name]);
      } else {
        urls.push(default_textures[name]);
      }
    }
    return loadImage(urls);
  })
  .then((images) => {
    var out = {};
    for (let i = 0; i < images.length; i++) {
      out[texture_names[i]] = images[i];
    }
    return out;
  });
}

/**
 * Get a data URI for the image.
 * @param {Image} img - The image.
 * @returns {string} the data URI representing the image.
 */
function imageToDataURI(img) {
  var canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  var dataUrl = canvas.toDataURL("image/png");
  return dataUrl;
}

// Get initial texture information from extension.
// callback is passed the new textures object.
// Should only be called from background page to prevent cross-origin
// canvas contamination.
function getDefaultTextures() {
  return loadImage(texture_names.map((name) => {
    return chrome.extension.getURL(`images/${name}.png`);
  })).then((images) => {
    var out = {};
    for (let i = 0; i < images.length; i++) {
      out[texture_names[i]] = imageToDataURI(images[i]);
    }
    return out;
  });
}

/**
 * Ensure textures are set and ready.
 * @param {bool} forceReload force reload of default textures from disk.
 * @param {bool} overwrite force overwrite/removal of custom textures, for
 *   addressing updates to texture format.
 * @returns {Promise}
 */
exports.ready = function (forceReload=false, overwrite=false) {
  return chrome.storage.promise.local.get(["default_textures", "textures"])
  .then(({default_textures, textures}) => {
    let resetDefault = forceReload || !default_textures;
    let resetCustom = overwrite || !textures;
    if (resetDefault) {
      return getDefaultTextures().then((new_textures) => {
        if (resetCustom) {
          textures = {};
        }
        return chrome.storage.promise.local.set({
          default_textures: new_textures,
          textures: textures
        });
      });
    } else if (resetCustom) {
      return chrome.storage.promise.local.set({
        textures: {}
      });
    }
  });
};

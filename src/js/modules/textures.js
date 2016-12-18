const loadImage = require('image-promise');
require('chrome-storage-promise');

var logger = require('util/logger')('textures');
logger.info('Loading textures');

/*
 * We store default and custom textures as dataURLs in
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
  'tiles'
];

/*
 * Updates saved textures.
 * Each should be a dataURL.
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
};

/**
 * Retrieves saved textures. If custom is true then custom
 * textures are returned for sprites where they are set.
 * 
 * Each should be a dataURL.
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
  }).then((images) => {
    var out = {};
    for (let i = 0; i < images.length; i++) {
      out[texture_names[i]] = images[i];
    }
    return out;
  });
}

/**
 * Get a data URL for the image.
 * @param {Image} img - The image.
 * @returns {string} the Data URL representing the image.
 */
function imageToDataURL(img) {
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
      out[texture_names[i]] = imageToDataURL(images[i]);
    }
    return out;
  });
}

function setDefaultTextures() {
  return getDefaultTextures().then((textures) => {
    return chrome.storage.promise.local.set({
      textures: textures,
      // Copy the object, otherwise default_textures is
      // null.
      default_textures: Object.assign({}, textures)
    });
  });
}

/**
 * Ensure textures are set and ready.
 * @type {Promise}
 */
exports.ready = function () {
  return chrome.storage.promise.local.get(["default_textures", "textures"])
    .then((items) => {
    if (!items.textures || !items.default_textures) {
      return setDefaultTextures();
    }
  });
}

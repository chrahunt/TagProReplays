var $ = require('jquery');
var AsyncLoop = require('./async-loop');

// Save image from texture dialog.
exports.saveSettings = function() {
    // Mapping from file input ids to texture object properties.
    var imageSources = {
        tilesInput: "tiles",
        portalInput: "portal",
        speedpadInput: "speedpad",
        speedpadredInput: "speedpadred",
        speedpadblueInput: "speedpadblue",
        splatsInput: "splats"
    };
    AsyncLoop(Object.keys(imageSources)).do(function (id, resolve) {
        var file = $('#' + id)[0].files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function(e) {
                resolve({
                    id: id,
                    data: e.target.result
                });
            };
            reader.readAsDataURL(file);
        } else {
            resolve({
                id: id,
                data: null
            });
        }
    }).then(function (images) {
        var imageData = {};
        images.forEach(function (image) {
            if (image.data !== null) {
                imageData[imageSources[image.id]] = image.data;
            }
        });

        // Save values to chrome storage.
        chrome.storage.local.get("textures", function(items) {
            if (items.textures) {
                var textures = items.textures;
                for (var key in imageData) {
                    textures[key] = imageData[key];
                }
                chrome.storage.local.set({
                    textures: textures
                });
            }
            // TODO: Handle case where textures not found?
        });
    });
};

/**
 * Texture as saved in `chrome.storage`.
 * @typedef TextureData
 * @type {object}
 * @property {string} tiles - Data URL for tiles image.
 * @property {string} portal - Data URL for portal image.
 * @property {string} speedpad - Data URL for speedpad image.
 * @property {string} speedpadred - Data URL for speedpadred image.
 * @property {string} speedpadblue - Data URL for speedpadblue image.
 * @property {string} splats - Data URL for splats image.
 * @property {string} flair - Data URL for flair image.
 * @property {string} tagpro - Data URL for tagpro image.
 * @property {string} rollingbomb - Data URL for rollingbomb image.
 */
/**
 * Object which contains textures saved as images appropriate for use
 * as image sources for canvas rendering.
 * @typedef TextureImages
 * @type {object}
 * @property {Image} tiles - Image for the tiles texture.
 * @property {Image} portal - Image for the portal texture.
 * @property {Image} speedpad - Image for the speedpad texture.
 * @property {Image} speedpadred - Image for the speedpadred texture.
 * @property {Image} speedpadblue - Image for the speedpadblue texture.
 * @property {Image} splats - Image for the splats texture.
 * @property {Image} flair - Image for the flair texture.
 * @property {Image} tagpro - Image for the tagpro texture.
 * @property {Image} rollingbomb - Image for the rollingbomb texture.
 */
/**
 * Callback function that receives the retrieved texture images.
 * @callback TextureCallback
 * @param {TextureImages} textures - The constructed images
 *   representing the textures.
 */
/**
 * Get image elements for the given set of textures. If custom textures
 * are turned off, then this will construct images using the default
 * texture pack.
 * @param  {TextureData}   textures - The textures as retrieved from
 *   `chrome.storage`.
 * @param  {TextureCallback} callback - The function called with the
 *   result of constructing the texture images.
 */
exports.getImages = function(textures, callback) {
    var textureImages = {};
    var requiredTextures = Object.keys(textures);
    for (var texture in textures) {
        var dataURL = textures[texture];
        // The name argument is provided by the `bind` function called
        // on the callback.
        getImage(dataURL, function(name, image) {
            textureImages[name] = image;
            // Ensure all textures loaded.
            var missingTexture = requiredTextures.some(function(t) {
                return !textureImages.hasOwnProperty(t);
            });
            if (!missingTexture) {
                callback(textureImages);
            }
        }.bind(null, texture));
    }
};

/**
 * @callback ImageCallback
 * @param {Image} image - The constructed image.
 */
/**
 * Get an image object populated with the given url.
 * @param  {string} url - The actual or Data URL to use to construct
 *   the image.
 * @param  {ImageCallback} callback - The callback function which is
 *   passed the constructed image.
 */
function getImage(url, callback) {
    var img = new Image();
    img.onload = function() {
        callback(img);
    };
    img.src = url;
}

/**
 * @callback DataURLCallback
 * @param {string} url - Data URL that represents the image.
 */
/**
 * Get a data URL for the image at the provided URL.
 * @param {string} url - The url to use to retrieve the image.
 * @param {DataURLCallback} callback - The callback function which
 *   receives the constructed data URL.
 */
function getImageDataURL(url, callback) {
    getImage(url, function(img) {
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var dataUrl = canvas.toDataURL("image/png");
        callback(dataUrl);
    });
}

// Get initial texture information from extension.
// callback is passed the new textures object.
// Should only be called from background page to prevent cross-origin
// canvas contamination.
exports.getDefault = function(callback) {
    var defaultTextures = {
        tiles: 'images/textures/tiles.png',
        portal: 'images/textures/portal.png',
        speedpad: 'images/textures/speedpad.png',
        speedpadred: 'images/textures/speedpadred.png',
        speedpadblue: 'images/textures/speedpadblue.png',
        splats: 'images/textures/splats.png',
        flair: 'images/textures/flair.png',
        rollingbomb: 'images/textures/rollingbomb.png',
        tagpro: 'images/textures/tagpro.png'
    };

    var textureData = {};
    var requiredTextures = Object.keys(defaultTextures);
    for (var texture in defaultTextures) {
        var url = defaultTextures[texture];
        // The name argument is provided by the `bind` function called
        // on the callback.
        getImageDataURL(url, function(name, dataUrl) {
            textureData[name] = dataUrl;
            // Ensure all textures loaded.
            var missingTexture = requiredTextures.some(function(t) {
                return !textureData.hasOwnProperty(t);
            });
            if (!missingTexture) {
                callback(textureData);
            }
        }.bind(null, texture));
    }
};

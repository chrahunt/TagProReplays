/**
 * Deep clone object.
 * @param {object}
 * @return {object}
 */
exports.clone = function(obj) {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Return the index of the first value in the array that satisfies the given
 * function. Same as `findIndex`.
 */
exports.findIndex = function(array, fn) {
    for (var i = 0; i < array.length; i++) {
        if (fn(array[i])) {
            return i;
        }
    }
    return -1;
}

/**
 * Return the first value in the array that satisfies the given function. Same
 * functionality as `find`.
 */
exports.find = function(array, fn) {
  for (var i = 0; i < array.length; i++) {
    if (fn(array[i])) {
      return array[i];
    }
  }
}

/**
 * Given text, return a data URL representing a document containing it.
 */
exports.textToDataUrl = function(text) {
    var b = new Blob([text], { type: "text/plain" });
    return URL.createObjectURL(b);
}
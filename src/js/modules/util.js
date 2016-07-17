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
};

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
};

/**
 * Given text, return a data URL representing a document containing it.
 */
exports.textToDataUrl = function(text) {
    var b = new Blob([text], { type: "text/plain" });
    return URL.createObjectURL(b);
};

/**
 * Wrap a function to handle multiple types of results.
 * Maps the following behaviors to returned Promise:
 * bool returned:
 * - true -> resolve
 * - false -> reject
 * thenable returned:
 * - resolve(thenable)
 * function callback (as last argument):
 * - err -> reject(err)
 * - * -> resolve(...args)
 * Wrapped function can return true/false to resolve to
 * 
 * 
 * Returns a function which takes arbitrary arguments and returns
 * a promise on resolution.
 */
exports.wrap = function(wrapped) {
  return function() {
    var args = [...arguments];
    return new Promise((resolve, reject) => {
      // Resolve with callback, handle feedback.
      var result = wrapped(...args, function(err) {
        if (err) {
          reject(err);
        } else {
          var args = [...arguments];
          resolve(...args.slice(1));
        }
      });
      if (typeof result === "boolean") {
        // Bool handling.
        if (result) {
          resolve();
        } else {
          reject(Error("Function returned false."));
        }
      } else if (result && result.then) {
        // Promise response handling.
        resolve(result);
      } else if (typeof result === "undefined") {
        // Nothing, wait for callback.
      } else {
        // Non-conforming function.
        reject(Error("Function did not return value value."));
      }
    });
  };
};
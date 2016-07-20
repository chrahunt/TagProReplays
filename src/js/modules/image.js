module.exports = {
  // width/height optional
  // url can be data URL
  load: (url, width, height) => {
    return new Promise((resolve, reject) => {
      var img = new Image(width, height);
      img.onload = function (e) {
        resolve(e.target);
      };
      img.onerror = function (e) {
        reject(e.target.error);
      };
      img.src = url;
    });
  }
};

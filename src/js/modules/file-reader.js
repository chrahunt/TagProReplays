var logger = require('./logger')('file-reader');

module.exports = {
  readAsArrayBuffer: (blob) => {
    logger.info("reader#readAsArrayBuffer");
    return new Promise((resolve, reject) => {
      var r = new FileReader();
      r.onload = (e) => {
        resolve(e.target.result);
      };
      r.onerror = (e) => {
        reject(e.target.error);
      };
      r.readAsArrayBuffer(blob);
    });
  },
  readAsText: (blob, label) => {
    logger.info("reader#readAsText");
    return new Promise((resolve, reject) => {
      var r = new FileReader();
      r.onload = (e) => {
        resolve(e.target.result);
      };
      r.onerror = (e) => {
        reject(e.target.error);
      };
      r.readAsText(blob, label);
    });
  },
  readAsDataURL: (blob) => {
    logger.info("reader#readAsDataURL");
    return new Promise((resolve, reject) => {
      var r = new FileReader();
      r.onload = (e) => {
        resolve(e.target.result);
      };
      r.onerror = (e) => {
        reject(e.target.error);
      };
      r.readAsDataURL(blob);
    });
  }
};

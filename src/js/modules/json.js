// Promise wrapper around JSON.parse
module.exports = function (data) {
  return new Promise((resolve, reject) => {
    try {
      resolve(JSON.parse(data));
    } catch (e) {
      reject(e);
    }
  });
};

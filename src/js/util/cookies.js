var logger = require('util/logger')('cookies');

exports.read = function(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

exports.set = function(name, value, domain) {
  var now = new Date();
  var time = now.getTime();
  var expireTime = time + 1000 * 60 * 60 * 24 * 365;
  now.setTime(expireTime);
  document.cookie = name + '=' + value + ';expires=' + now.toGMTString() + ';path=/; domain=' + domain;
  logger.info('cookie: name=' + name + ' value=' + value + ' expires=' + now.toGMTString() + ' domain=' + domain);
};

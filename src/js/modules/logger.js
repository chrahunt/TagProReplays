var debug = require('debug');

var top = "tpr";

// Set debug by default.
if (global.localStorage) {
  global.localStorage.debug = `${top}:*`;
}

var loggers = {
  details: console.log.bind(console),
  debug: console.log.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

module.exports = function getLogger(name) {
  var levels = ["details", "debug", "info", "warn", "error"];
  var debugs = {};
  for (let level of levels) {
    debugs[level] = debug(`${top}:${name}:${level}`);
    debugs[level].log = loggers[level];
  }
  return debugs;
};

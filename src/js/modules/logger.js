var debug = require('debug');
debug.enable("*");

var top = "tpr";

// Set debug by default.
// Prevent breaking in sandboxed pages.
try {
  if (global.localStorage) {
    global.localStorage.debug = `${top}:*`;
  }
} catch(e) { }

var loggers = {
  trace: console.log.bind(console),
  debug: console.log.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

module.exports = function getLogger(name) {
  var levels = ["trace", "debug", "info", "warn", "error"];
  var debugs = {};
  for (let level of levels) {
    debugs[level] = debug(`${top}:${name}:${level}`);
    debugs[level].log = loggers[level];
  }
  return debugs;
};

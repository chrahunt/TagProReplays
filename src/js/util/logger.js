/* eslint no-console:off */
const debug = require('debug');
//debug.useColors = () => false;
debug.enable("*");

const top = "tpr";

// Set debug by default.

try {
  if (global.localStorage) {
    global.localStorage.debug = `${top}:*`;
  }
} catch(e) {
  // We continue to prevent breaking in sandboxed pages.
}

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

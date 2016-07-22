// Maps Error stacks to source.
require('source-map-support').install({
  handleUncaughtExceptions: false
});

// Main app.
var $ = require('jquery');

require('./modules/menu');
require('./modules/settings');

// Load help content from wiki.
$("#help-content").load("https://github.com/chrahunt/TagProReplays/wiki/Help #wiki-body .markdown-body");

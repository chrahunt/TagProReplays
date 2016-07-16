// Main app.
var $ = require('jquery');

var Menu = require('./modules/menu');

// Load help content from wiki.
$("#help-content").load("https://github.com/chrahunt/TagProReplays/wiki/Help #wiki-body .markdown-body");
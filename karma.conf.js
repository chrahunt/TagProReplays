/*eslint no-sync: "off" */
/* global __dirname: false */
var path = require('path');

var basePath = path.resolve(path.join(__dirname, './src/js'));

module.exports = function (config) {
  var props = {
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha', 'chai', 'browserify', 'source-map-support'],

    // list of files / patterns to load in the browser
    files: [
      // To include test/karma
      'test/**/*.spec.js',
      {pattern: 'src/images/**/*.png', watched: true, served: true, included: false},
      {pattern: 'src/schemas/**/*.json', watched: true, served: true, included: false},
      {pattern: 'test/fixtures/**/*', watched: true, served: true, included: false}
    ],

    // list of files to exclude
    exclude: [
    ],

    // Proxy to src folder.
    proxies: {
      '/images/': '/base/src/images/',
      '/fixtures/': '/base/test/fixtures/',
      '/schemas/': '/base/src/schemas/'
    },

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      'test/**/*.spec.js': ['browserify']
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['mocha'],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_DEBUG,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['Chrome'],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity,

    // Max length between messages from browser, we needed a higher value
    // for Travis since rendering is blocking.
    browserNoActivityTimeout: 45000,

    loggers: [{type: 'file', filename: 'karma-out.log'}],

    browserConsoleLogOptions: {
      level: 'debug',
      // We write nowhere so the fact that something is logged gets logged
      // but we don't truncate any actual file.
      path: process.platform == 'win32' ? 'NUL' : '/dev/null',
      terminal: false
    },

    // Chrome on Travis CI
    customLaunchers: {
      Chrome_travis_ci: {
        base: 'ChromeHeadless',
        displayName: 'Chrome-Travis',
        flags: ['--no-sandbox']
      }
    }
  };

  props.browserify = {};
  props.browserify.debug = true;
  props.browserify.paths = [basePath];
  if (process.env.TRAVIS) {
    props.browsers = ['Chrome_travis_ci'];
  }

  config.set(props);
};

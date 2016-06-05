var jsonfile = require('jsonfile');
var path = require('path');

// Karma configuration
// Generated on Sat Jun 04 2016 15:05:08 GMT-0400 (Eastern Daylight Time)
var pkg = jsonfile.readFileSync("./package.json");
var basePath = path.resolve(path.join(__dirname, './src/js'));

module.exports = function(config) {
  var props = {
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha', 'chai', 'browserify'],

    // list of files / patterns to load in the browser
    files: [
      'test/**/*.spec.js',
      {pattern: 'src/schemas/**/*.json', watched: true, served: true, included: false},
      {pattern: 'test/fixtures/**/*', watched: true, served: true, included: false}
    ],

    // list of files to exclude
    exclude: [
    ],

    // Proxy to src folder.
    proxies: {
      '/schemas/': '/base/src/schemas/',
      '/fixtures/': '/base/test/fixtures/'
    },

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      'test/*': ['browserify']
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress'],

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
    concurrency: Infinity
  };
  
  props.browserify = pkg.browserify;
  props.browserify.debug = true;
  props.browserify.paths = [ basePath ];
  props["browserify-shim"] = pkg["browserify-shim"];
  props.browser = pkg.browser;
  config.set(props);
};

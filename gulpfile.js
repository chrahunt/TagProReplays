var gulp = require('gulp'),
    inject = require('gulp-inject'),
    rename = require('gulp-rename'),
    mochaPhantomJS = require('gulp-mocha-phantomjs');

var background_libs = [
    'migrations.js',
    'filesystem.js',
    'indexedDBUtils.js',
    'map_draw_functions.js',
    'messaging.js'
];

var background_test = [
    'test/test-migrations.js'
];

var common_libs = [
    'barrier.js'
];

var common_test = [
    'test/test-barrier.js'
];

var content_libs = [
    'cookies.js',
    'messaging.js',
    'textures.js'
];

var test_libs = [
    'expect.js/index.js',
    'mocha/mocha.js',
    // Dependency for chrome stubs.
    'sinon/pkg/sinon.js',
    // Chrome stubs.
    'sinon-chrome/chrome.js',
    'sinon-chrome/phantom-tweaks.js'
].map(function(lib) {return 'node_modules/' + lib;});

gulp.task('inject-tests', function() {
    var sources = background_libs.concat(common_libs);
    var tests = background_test.concat(common_test);
    return gulp.src('test/index-template.html')
        // source files.
        .pipe(inject(
            gulp.src(sources, {read: false}),
            {name: 'scripts', relative: true}
        ))
        // Testing libraries.
        .pipe(inject(
            gulp.src(test_libs, {read: false}),
            {name: 'libs', relative: true}
        ))
        // test files.
        .pipe(inject(
            gulp.src(tests, {read: false}),
            {name: 'tests', relative: true}
        ))
        .pipe(rename('index.html'))
        .pipe(gulp.dest('test'));
});

gulp.task('test', ['inject-tests'], function() {
    return gulp.src('test/index.html', {read: false})
        .pipe(mochaPhantomJS());
});

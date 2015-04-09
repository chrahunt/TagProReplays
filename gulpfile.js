var gulp = require('gulp'),
    inject = require('gulp-inject'),
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

gulp.task('injectIntoIndex', function () {
    return gulp.src('test/index.html')
        // background source files.
        .pipe(inject(
            gulp.src(background_libs, {read: false}),
            {name: 'scripts', relative: true}
        ))
        // Testing libraries.
        .pipe(inject(
            gulp.src(test_libs, {read: false}),
            {name: 'libs', relative: true}
        ))
        // test files.
        .pipe(inject(
            gulp.src(background_test, {read: false}),
            {name: 'tests', relative: true}
        ))
        .pipe(gulp.dest('test'));
});

gulp.task('test', ['injectIntoIndex'], function () {
    return gulp.src('test/index.html', {read: false})
        .pipe(mochaPhantomJS());
});

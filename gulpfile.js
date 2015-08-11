var gulp = require('gulp'),
    browserify = require('browserify'),
    watchify = require('watchify'),
    es = require('event-stream'),
    glob = require('glob'),
    gutil = require('gulp-util'),
    rename = require('gulp-rename'),
    source = require('vinyl-source-stream'),
    assign = require('lodash.assign'),
    watch = require('gulp-watch'),
    plumber = require('gulp-plumber'),
    sass = require('gulp-sass');

var assets = [
    // Asset files in src
    ['src/**/*', '!src/js/**/*', '!src/scss/**/*'],
    // Asset files in vendor
    ['vendor/**/*', '!vendor/js/**/*']
];

var sources = 'src/js/*.js';
var sass_sources = './src/scss/**/*.scss';
var dirs = {
    dev: './build/dev',
    release: './build/release',
    beta: './build/beta'
};

// Browserify js, move files.
function build(dest, opts) {
    if (typeof opts == "undefined") opts = {};
    var bundle = glob(sources, function (err, files) {
        var streams = files.map(function (entry) {
            var b_opts = {
                entries: entry
            };
            if (opts.browserify) {
                for (var i in opts.browserify) {
                    b_opts[i] = opts.browserify[i];
                }
            }
            return browserify(b_opts)
                .bundle()
                .pipe(source(entry.replace(/^src\//, '')))
                .pipe(gulp.dest(dest));
        });
        return es.merge(streams);
    });
    
    assets.forEach(function(asset) {
        gulp.src(asset)
            .pipe(gulp.dest(dest));
    });
    compileSass(dest + '/css');
    return bundle;
}

function compileSass(out) {
    gulp.src(sass_sources)
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest(out));
}

// Compile and watchify sourced file.
function watchifyFile(src, out) {
    var opts = assign({}, watchify.args, {
        entries: src,
        debug: true
    });
    var b = watchify(browserify(opts));
    function bundle() {
        return b.bundle()
            .on('error', gutil.log.bind(gutil, "Browserify Error"))
            .pipe(source(src.replace(/^src\//, '')))
            .pipe(gulp.dest(out));
    }
    b.on('update', bundle);
    b.on('log', gutil.log);
    return bundle();
}

// dev build
gulp.task('build', function() {
    return build(dirs.dev, {
        browserify: {
            debug: true
        }
    });
});

gulp.task('build-prod', function() {
    return build(dirs.release);
});

gulp.task('build-beta', function() {
    return build(dirs.beta);
});

gulp.task('sass-dev', function () {
    compileSass(dirs.dev + '/css');
});

gulp.task('watch', function() {
    var bundle = glob(sources, function (err, files) {
        var streams = files.map(function (entry) {
            return watchifyFile(entry, dirs.dev);
        });
        return es.merge(streams);
    });
    
    assets.forEach(function(asset) {
        gulp.src(asset)
            .pipe(watch(asset))
            .pipe(plumber())
            .pipe(gulp.dest(dirs.dev));
    });
    gulp.watch(sass_sources, ['sass-dev']);
    return bundle;
});

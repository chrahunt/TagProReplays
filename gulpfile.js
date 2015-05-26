var gulp = require('gulp'),
    browserify = require('browserify'),
    watchify = require('watchify'),
    es = require('event-stream'),
    glob = require('glob'),
    gutil = require('gulp-util'),
    rename = require('gulp-rename'),
    source = require('vinyl-source-stream'),
    assign = require('lodash.assign');

// Compile and watchify sourced file.
function watch(src, out) {
    var opts = assign({}, watchify.args, {
        entries: src,
        debug: true
    });
    var b = watchify(browserify(opts));
    function bundle() {
        return b.bundle()
            .on('error', gutil.log.bind(gutil, "Browserify Error"))
            .pipe(source(src.replace(/^\.\/src\//, '')))
            .pipe(gulp.dest(out));
    }
    b.on('update', bundle);
    b.on('log', gutil.log);
    return bundle();
}

gulp.task('build-dev', function() {
    var dir = "./build/dev";
    var bundle = glob('./src/js/*.js', function (err, files) {
        var streams = files.map(function (entry) {
            return watch(entry, dir);
            /*return browserify({
                    entries: entry,
                    debug: true
                })
                .bundle()
                .pipe(source(entry.replace(/^\.\/src\//, '')))
                .pipe(gulp.dest('./build/dev'));*/
        });
        return es.merge(streams);
    });
    // Copy asset files from src.
    gulp.src(['./src/**/*', '!./src/js/**/*'])
        .pipe(gulp.dest(dir));
    // Copy asset files from vendor.
    gulp.src(['./vendor/**/*', '!./vendor/js/**/*'])
        .pipe(gulp.dest(dir));
    return bundle;
});

// using vinyl-source-stream:
gulp.task('build-prod', function() {
    var dir = "./build/release";
    var bundle = glob('./src/js/*.js', function (err, files) {
        var streams = files.map(function (entry) {
            return browserify({
                    entries: entry
                })
                .bundle()
                .pipe(source(entry.replace(/^\.\/src\//, '')))
                .pipe(gulp.dest(dir));
        });
        return es.merge(streams);
    });
    // Copy asset files from src.
    gulp.src(['./src/**/*', '!./src/js/**/*'])
        .pipe(gulp.dest(dir));
    // Copy asset files from vendor.
    gulp.src(['./vendor/**/*', '!./vendor/js/**/*'])
        .pipe(gulp.dest(dir));
    return bundle;
});

var gulp = require('gulp'),
    browserify = require('browserify'),
    es = require('event-stream'),
    glob = require('glob'),
    rename = require('gulp-rename'),
    source = require('vinyl-source-stream');

gulp.task('build-dev', function() {
    var bundle = glob('./src/js/*.js', function (err, files) {
        var streams = files.map(function (entry) {
            return browserify({
                    entries: entry,
                    debug: true
                })
                .bundle()
                .pipe(source(entry.replace(/^\.\/src\//, '')))
                .pipe(gulp.dest('./build/dev'));
        });
        return es.merge(streams);
    });
    // Copy asset files from src.
    gulp.src(['./src/**/*', '!./src/js/**/*'])
        .pipe(gulp.dest('./build/dev'));
    // Copy asset files from vendor.
    gulp.src(['./vendor/**/*', '!./vendor/js/**/*'])
        .pipe(gulp.dest('./build/dev'));
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

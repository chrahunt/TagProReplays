var source = require('vinyl-source-stream');
//var streamify = require('gulp-streamify');
var browserify = require('browserify');
var rename = require('gulp-rename');
var gulp = require('gulp');

// using vinyl-source-stream:
gulp.task('browserify', function() {
  browserify('./src/background.js')
    .bundle()
    .pipe(source('./src/background.js'))
    .pipe(rename('background.js'))
    .pipe(gulp.dest('./build/js'));

  browserify('./src/TagProReplays.js')
    .bundle()
    .pipe(source('./src/TagProReplays.js'))
    .pipe(rename('TagProReplays.js'))
    .pipe(gulp.dest('./build/js'));

  browserify('./src/replayRecording.js')
    .bundle()
    .pipe(source('./src/replayRecording.js'))
    .pipe(rename('replayRecording.js'))
    .pipe(gulp.dest('./build/js'));
});

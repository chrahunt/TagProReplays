/*eslint no-sync: "off" */
var gulp = require('gulp'),
  browserify = require('browserify'),
  watchify = require('watchify'),
  es = require('event-stream'),
  glob = require('glob'),
  gutil = require('gulp-util'),
  source = require('vinyl-source-stream'),
  watch = require('gulp-watch'),
  plumber = require('gulp-plumber'),
  sass = require('gulp-sass'),
  jeditor = require('gulp-json-editor'),
  jsonfile = require('jsonfile'),
  notify = require('gulp-notify'),
  filter = require('gulp-filter'),
  debug = require('gulp-debug'),
  duration = require('gulp-duration');

// Uncomment for shim debugging.
//process.env.BROWSERIFYSHIM_DIAGNOSTICS=1;
var assets = [
  // Asset files in src
  ['src/**/*', '!src/js/**/*', '!src/scss/**/*', '!src/manifest.json'],
  // Asset files in vendor
  [
    'vendor/**/*',
    '!vendor/js/**/*'
  ]
];

// Top-level source files which get browserified.
var sources = 'src/js/*.js';

var sass_sources = './src/scss/**/*.scss';

var manifest = './src/manifest.json';
var pkg = './package.json';

var dirs = {
  dev: './build',
  release: './dist'
};

// Browserify js, move files.
function build(dest, opts) {
  if (typeof opts == "undefined") opts = {};
  // Browserify.
  var bundle = glob(sources, (err, files) => {
    var t = duration('bundle time');
    var streams = files.map((entry) => {
      var b_opts = {
        entries: entry
      };
      Object.assign(b_opts, opts.browserify);
      return browserify(b_opts)
        .bundle()
        .pipe(t)
        .pipe(source(entry.replace(/^src\//, '')))
        .pipe(gulp.dest(dest));
    });
    return es.merge(streams);
  });

  var move_assets = assets.map((asset) => {
    return gulp.src(asset).pipe(gulp.dest(dest));
  });

  // Sass.
  var compile_sass = compileSass(dest + '/css');
  makeManifest(dest, opts.manifest);
  // TODO: merge all streams.
  return es.merge(...move_assets, compile_sass);
}

function compileSass(dest) {
  var t = duration('sass timer');
  return gulp.src(sass_sources)
    .pipe(sass().on('error', sass.logError))
    .pipe(t)
    .pipe(gulp.dest(dest));
}

// Update version and any additional properties.
function makeManifest(dest, props) {
  var manifestProps = Object.assign({}, props);

  return gulp.src(manifest)
    .pipe(jeditor(manifestProps))
    .pipe(gulp.dest(dest));
}

// Compile and watchify sourced file.
function watchifyFile(src, dest) {
  var opts = Object.assign({}, watchify.args, {
    entries: src,
    debug: true
  });
  var target = src.replace(/^src\//, '');
  var b = watchify(browserify(opts));
  function bundle() {
    return b.bundle()
            .on('error', notify.onError((err) => {
              gutil.log("Browserify Error: " + err.message);
              return `Build failed for ${target}`;
            }))
            .pipe(source(target))
            .pipe(gulp.dest(dest))
            .pipe(notify(`Built ${target}`));
  }
  b.on('update', bundle);
  b.on('log', gutil.log);
  return bundle();
}

// dev build
gulp.task('build', () => {
  var p = jsonfile.readFileSync(pkg);
  return build(dirs.dev, {
    browserify: {
      debug: true
    },
    manifest: {
      version: p.version
    }
  });
});

gulp.task('build-prod', () => {
  var p = jsonfile.readFileSync(pkg);
  return build(dirs.release, {
    manifest: {
      version: p.version
    }
  });
});

gulp.task('sass-dev', () => {
  return compileSass(dirs.dev + '/css');
});

gulp.task('manifest-dev', () => {
  var p = jsonfile.readFileSync(pkg);
  var opts = {
    manifest: {
      version: p.version
    }
  };
  jsonfile.readFile(pkg, (err, data) => {
    makeManifest(dirs.dev, {
      version: data.version
    });
  });
});

gulp.task('watch', ['sass-dev', 'manifest-dev'], () => {
  var bundle = glob(sources, (err, files) => {
    var streams = files.map((entry) => {
      return watchifyFile(entry, dirs.dev);
    });
    return es.merge(streams);
  });


  assets.forEach((asset) => {
    gulp.src(asset)
        .pipe(watch(asset))
        .pipe(plumber())
        .pipe(gulp.dest(dirs.dev))
        .pipe(notify((file) => {
          return `Updated ${file.path}`
        }));
  });

  gulp.watch(sass_sources, ['sass-dev']);
  gulp.watch([pkg, manifest], ['manifest-dev']);
  // TODO: Merge all streams.
  return bundle;
});
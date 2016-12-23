/*eslint no-sync: "off" */
const browserify = require('browserify'),
      concat     = require('concat-stream'),
      duration   = require('gulp-duration'),
      es         = require('event-stream'),
      glob       = require('glob'),
      gulp       = require('gulp'),
      gutil      = require('gulp-util'),
      jeditor    = require('gulp-json-editor'),
      jsonfile   = require('jsonfile'),
      notify     = require('gulp-notify'),
      plumber    = require('gulp-plumber'),
      rename     = require('gulp-rename'),
      rimraf     = require('rimraf'),
      sass       = require('gulp-sass'),
      source     = require('vinyl-source-stream'),
      through    = require('through2'),
      watch      = require('gulp-watch'),
      watchify   = require('watchify');

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

let asset_base = [
  'src',
  'vendor'
];

// Top-level source files which get browserified.
var sources = 'src/js/*.js';
var source_base = 'src/';

var sass_sources = './src/scss/**/*.scss';

var manifest = './src/manifest.json';
var pkg = './package.json';

var dirs = {
  dev: './build',
  release: './dist'
};

var b_defaults = {
  paths: ['./src/js']
};

// Returns duplex stream that takes vinyl files, browserifies them, and
// emits the browserified versions.
const browserified = (opts) => {
  return through.obj(function (file, enc, next) {
    let src = file.path;
    let b_opts = Object.assign({
      entries: src
    }, b_defaults);
    Object.assign(b_opts, opts);
    browserify(b_opts)
      .bundle()
      .pipe(concat((contents) => {
        let new_file = file.clone();
        new_file.contents = contents;
        this.push(new_file);
        next();
      }));
  });
};

// Browserify js, move files.
function build(dest, opts) {
  if (typeof opts == "undefined") opts = {};

  // Browserify.
  let bundle = gulp.src(sources, { base: source_base })
    .pipe(browserified(opts.browserify))
    .pipe(rename((path) => {
      path.dirname = path.dirname.replace(/^src(\/|\\\\)/, '');
    }))
    .pipe(gulp.dest(dest))
    .pipe(through.obj(function(file, enc, next) {
      gutil.log(`Filename: ${file.path}`);
      gutil.log(`File size: ${file.contents.length}`);
      this.push(file);
      next();
    }))
    .pipe(notify((file) => {
      return `Built ${file.path}`;
    }));

  // Move assets.
  var move_assets = assets.map((asset) => {
    return gulp.src(asset).pipe(gulp.dest(dest));
  });

  // Sass.
  var compile_sass = compileSass(dest + '/css');
  var man_str = makeManifest(dest, opts.manifest);
  return es.merge(bundle, ...move_assets, compile_sass, man_str);
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
  var opts = Object.assign({}, watchify.args, b_defaults, {
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

gulp.task('clean', (cb) => {
  rimraf(dirs.dev, cb);
});

// Implicitly a dev build.
gulp.task('build', ['clean'], () => {
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

gulp.task('clean-release', (cb) => {
  rimraf(dirs.release, cb);
});

gulp.task('build-release', ['clean-release'], () => {
  var p = jsonfile.readFileSync(pkg);
  return build(dirs.release, {
    manifest: {
      version: p.version
    }
  });
});

gulp.task('sass-dev', ['clean'], () => {
  return compileSass(dirs.dev + '/css');
});

gulp.task('sass-dev2', () => {
  return compileSass(dirs.dev + '/css');
});

gulp.task('manifest-dev', ['clean'], () => {
  // Pull version from package.json.
  var p = jsonfile.readFileSync(pkg);
  return makeManifest(dirs.dev, {
    version: p.version
  });
});

gulp.task('manifest-dev2', () => {
  // Pull version from package.json.
  var p = jsonfile.readFileSync(pkg);
  return makeManifest(dirs.dev, {
    version: p.version
  });
});

gulp.task('watch', ['clean', 'sass-dev', 'manifest-dev'], () => {
  var bundle = glob(sources, (err, files) => {
    var streams = files.map((entry) => {
      return watchifyFile(entry, dirs.dev);
    });
    return es.merge(streams);
  });


  assets.forEach((asset, i) => {
    gulp.src(asset)
        .pipe(watch(asset, {
          base: asset_base[i]
        }))
        .pipe(plumber())
        .pipe(gulp.dest(dirs.dev))
        .pipe(notify((file) => {
          return `Updated ${file.path}`
        }));
  });

  gulp.watch(sass_sources, ['sass-dev2']);
  gulp.watch([pkg, manifest], ['manifest-dev2']);
  // TODO: Merge all streams.
  return bundle;
});

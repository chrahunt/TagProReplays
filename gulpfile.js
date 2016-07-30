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
  bowerSrc = require('gulp-bower-src'),
  hashstream = require('hash-csp'),
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
    '!vendor/js/**/*',
    // glob from /css so it ends up in the right folder.
    'node_modules/bootstrap/dist/**/bootstrap.min.css*',
    'node_modules/bootstrap-material-design/dist/**/*.min.css*'
  ]
];

// Top-level source files which get browserified.
var sources = 'src/js/*.js';

var sass_sources = './src/scss/**/*.scss';

var manifest = './src/manifest.json';
var pkg = './package.json';
var bower_root = "bower_components";
var bower_sources = `${bower_root}/**/*`;

var dirs = {
  dev: './build/dev',
  release: './build/release',
  beta: './build/beta'
};

var bower_filter = filter([
  '**/*.html',
  '!**/test/**',
  '!**/test',
  '!**/demo/**',
  '!**/demo',
  '!**/index.html'
]);

gulp.task('g', () => {
  return bowerSrc()
    .pipe(bower_filter)
    .pipe(debug());
});

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

  var hash_timer = duration('hash timer');
  // Bower assets + make extension manifest.
  var move_bower_assets = bowerSrc()
    // Only html.
    .pipe(bower_filter)
    .pipe(gulp.dest(dest))
    .pipe(hashstream((hashes) => {
      console.log(`Number of hashes: ${hashes.length}`);
      hash_timer.emit('end');
      var shas = hashes.map((h) => `'${h}'`).join(" ");
      var csp = `script-src 'self' 'unsafe-eval' ${shas}; object-src 'self'`;
      var man_opts = Object.assign({}, opts.manifest, {
        content_security_policy: csp
      });
      makeManifest(dest, man_opts);
    }));
  // Sass.
  var compile_sass = compileSass(dest + '/css');
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

gulp.task('build-beta', () => {
  var p = jsonfile.readFileSync(pkg);
  return build(dirs.beta, {
    manifest: {
      version: p.version,
      version_name: p.version + "-beta"
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
  bowerSrc()
    .pipe(bower_filter)
    .pipe(hashstream((hashes) => {
      var shas = hashes.map((h) => `'${h}'`).join(" ");
      var csp = `script-src 'self' 'unsafe-eval' ${shas}; object-src 'self'`;
      var man_opts = Object.assign({}, opts.manifest, {
        content_security_policy: csp
      });
      makeManifest(dirs.dev, man_opts);
    }));
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

  // Watch for changes later, e.g. packages added
  watch(bower_sources, () => {
    bowerSrc()
      .pipe(bower_filter)
      .pipe(gulp.dest(dirs.dev));
  });
  // Initial population.
  bowerSrc()
    .pipe(bower_filter)
    .pipe(gulp.dest(dirs.dev));
  gulp.watch(sass_sources, ['sass-dev']);
  gulp.watch([pkg, manifest, bower_sources], ['manifest-dev']);
  // TODO: Merge all streams.
  return bundle;
});

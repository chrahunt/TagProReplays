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
    sass = require('gulp-sass'),
    jeditor = require('gulp-json-editor'),
    jsonfile = require('jsonfile'),
    notify = require('gulp-notify');

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

var sources = 'src/js/*.js';
var sass_sources = './src/scss/**/*.scss';
var manifest = './src/manifest.json';
var pkg = './package.json';

var dirs = {
    dev: './build/dev',
    release: './build/release',
    beta: './build/beta'
};

// Browserify js, move files.
function build(dest, opts) {
    if (typeof opts == "undefined") opts = {};
    // Browserify.
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
    // Assets.
    assets.forEach(function(asset) {
        gulp.src(asset)
            .pipe(gulp.dest(dest));
    });
    // Sass.
    compileSass(dest + '/css');
    // Extension Manifest.
    makeManifest(dest, opts.manifest);
    return bundle;
}

function compileSass(out) {
    gulp.src(sass_sources)
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest(out));
}

// Update version and any additional properties.
function makeManifest(out, props) {
    var manifestProps = {};
    if (props)
        assign(manifestProps, props);

    gulp.src(manifest)
        .pipe(jeditor(manifestProps))
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
            .on('error', notify.onError(function (err) {
                gutil.log("Browserify Error: " + err.message);
                return "Build Failed";
            }))
            .pipe(source(src.replace(/^src\//, '')))
            .pipe(gulp.dest(out))
            .pipe(notify("Build Succeeded"));
    }
    b.on('update', bundle);
    b.on('log', gutil.log);
    return bundle();
}

// dev build
gulp.task('build', function() {
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

gulp.task('build-prod', function() {
    var p = jsonfile.readFileSync(pkg);
    return build(dirs.release, {
        manifest: {
            version: p.version
        }
    });
});

gulp.task('build-beta', function() {
    var p = jsonfile.readFileSync(pkg);
    return build(dirs.beta, {
        manifest: {
            version: p.version,
            version_name: p.version + "-beta"
        }
    });
});

gulp.task('sass-dev', function () {
    compileSass(dirs.dev + '/css');
});

gulp.task('manifest-dev', function () {
    jsonfile.readFile(pkg, function (err, data) {
        makeManifest(dirs.dev, {
            version: data.version
        });
    });
});

gulp.task('watch', ['sass-dev', 'manifest-dev'], function() {
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
    gulp.watch([pkg, manifest], ['manifest-dev']);
    return bundle;
});

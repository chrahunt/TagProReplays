var gulp = require('gulp')
  , fs   = require('fs')
  , path = require('path')
  , zip  = require('gulp-zip');

// Have a base directory
var base_dir = '.';
var manifest = 'manifest.json';
// Globs for any files not in manifest.
var other_files = [

];

// Return list of globs listed in manifest.
function get_files_from_manifest() {
  var p = path.join(base_dir, manifest);
  var o = JSON.parse(fs.readFileSync(p));
  // Start with manifest.
  var globs = [p];
  // Background page scripts.
  if (o.background) {
    if (o.background.scripts) {
      globs.push(...o.background.scripts.map(glob => {
        return path.join(base_dir, glob);
      }));
    }
  }
  // Content scripts.
  if (o.content_scripts) {
    for (let content_script of o.content_scripts) {
      if (content_script.js) {
        globs.push(...content_script.js.map(glob => {
          return path.join(base_dir, glob);
        }));
      }
      if (content_script.css) {
        globs.push(...content_script.css.map(glob => {
          return path.join(base_dir, glob);
        }));
      }
    }
  }
  // Web accessible resources.
  if (o.web_accessible_resources) {
    globs.push(...o.web_accessible_resources.map(glob => {
      return path.join(base_dir, glob);
    }));
  }
  // background
  // content scripts array
  // - js
  // - css
  // - web_accessible_resources
  // anything matching a glob
  return globs;
}

gulp.task('zip', () => {
  var files = get_files_from_manifest();
  return gulp.src(files.concat(other_files), { base: base_dir })
    .pipe(zip('tpr.zip'))
    .pipe(gulp.dest('.'));
});
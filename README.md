# TagProReplays

TagProReplays is a Chrome extension for recording short clips of gameplay in [TagPro](http://tagpro.gg/).

The extension uses a replay buffer, remembering the last several seconds (default 30) so you can save sick plays after the fact.

If screen capture software is a little heavy for your machine, this extension can help!

## Installation

TagProReplays is only available in Chromium-based browsers. You can get it from the [Chrome Web Store](https://chrome.google.com/webstore/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh).

For Opera users, first install [this extension](https://addons.opera.com/en/extensions/details/download-chrome-extension-9/?display=en) then download from the Chrome web store.

## Development

### Building/Updating the Extension

This extension uses [Browserify](http://browserify.org/) to turn CommonJS-style
modules into code suitable for the browser. To go from source files to extension
files:

1. Download NodeJS and ensure npm is updated ([instructions](https://docs.npmjs.com/getting-started/installing-node))
2. Execute `npm install` in the project directory
3. Execute `npm install -g gulp-cli` anywhere
4. Execute `gulp build` in the project directory
5. Inspect extension files in `$project_dir/build`

If you make a change, just run `gulp build` again.

For quicker development execute `gulp watch` instead of `gulp build`. The
process will stay up and watch the source files for changes, rebuilding when
a change is detected.

### Notes

References to assets using `chrome.extension.getURL` can assume the same
relative location as in the `src` directory.

Dependencies are resolved by browserify at compile-time, but the assets
that may be required for those libraries are moved from their respective
folders and into the `build` directory. This applies to bootstrap, and
the relevant CSS has been updated to properly refer to the images in the
build directory.

The manifest has some substitutions/insertions completed during the build
process, like the `version` field being set with the version specified in
`package.json`.

### More Information

**Customized Dependencies**

One reason for having specific dependencies included in the extension is
because they require changes before use. Those changes are documented here:

* Bootstrap (3.2.0): CSS compiled so that any and all changes are scoped to
  `.bootstrap-container`. The URLs for font assets are substituted to use
  `chrome-extension://__MSG_@@extension_id__/`, which enables Chrome to resolve
  the files even thought the CSS files are injected as content-scripts.

**Extension File Organization**:

* **src/**: Main source files for the extension.
    - **js/**: Files directly under this directory are treated as individual entry points for the browserify build.
        + **modules/**: These files are disregarded by the build process (it's assumed that they'll be required by the top-level js files).
    - **schemas/**: Holds the JSON-Schema files for the main replay file format. This also mirrors, for the most part, the format of the replays as they exist in the IndexedDB document store within the extension.
* **vendor/**: Third-party libraries that either don't have a proper module, or which required customization. Subdirectories other than `js` are copied to the `build` directory on build.

For CSS files injected as content scripts, ensure that referenced resources
are prepended with `chrome-extension://__MSG_@@extension_id__/`, and listed
under `web_accessible_resources` in the manifest.

### Release

When you're ready to make a new release:

1. Make sure to update the version in `package.json` and `manifest.json`.
2. `gulp build-release` - this outputs compiled non-sourcemapped files to
   `./dist`.
3. Load the `dist` directory as an unpacked extension and test.
4. If tests pass, then make your version-release commit and any history changes
   to clean up ugly intermediate git commits.
5. zip up contents of `dist`
6. Push to origin, make a release in GitHub, make a post on /r/TagPro, and
   upload the zip to the Chrome developer dashboard.

# TagProReplays

TagProReplays is a Chrome extension for recording short clips of gameplay in
[TagPro](http://tagpro.gg/).

The extension uses a replay buffer, remembering the last several seconds
(default 30) so you can save sick plays after the fact.

If screen capture software is a little heavy for your machine, this extension
can help!

## Installation

TagProReplays is only available in Chromium-based browsers. You can get it from
the [Chrome Web Store](https://chrome.google.com/webstore/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh).

For Opera users, first install [this extension](https://addons.opera.com/en/extensions/details/download-chrome-extension-9/?display=en)
then download from the Chrome web store.

## Development

### Building/Updating the Extension

This extension uses [Browserify](http://browserify.org/) to turn CommonJS-style
modules into code suitable for the browser. To go from source files to extension
files:

1. Download NodeJS and ensure npm is updated ([instructions](https://docs.npmjs.com/getting-started/installing-node))
2. Execute `npm install` in the project directory
3. Execute `npm install -g gulp-cli` anywhere
4. Execute `gulp build` in the project directory
5. Load the directory `$project_dir/build` as an unpacked extension.
6. Develop!

If you make a change to the source files, just run `gulp build` again.

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
    - **html/**
    - **images/**
    - **js/**: Files directly under this directory are treated as individual
      target scripts for the browserify build.
        + **modules/**: These files are disregarded by the build process (it's
        assumed that they'll be required by the top-level js files).
        + **util/**: Mostly self-contained modules, single purpose.
    - **schemas/**: JSON schemas for the replay files
    - **scss/**: these get compiled to CSS and dropped into `css` in the
      generated code directory.
* **test/**: automated tests and fixtures
* **vendor/**: Third-party libraries that either don't have a proper module,
  or which required customization. Subdirectories other than `js` are copied
  to the `build` directory on build.

For CSS files injected as content scripts, ensure that referenced resources
are prepended with `chrome-extension://__MSG_@@extension_id__/`, and listed
under `web_accessible_resources` in the manifest.

### Testing

This extension uses Karma for testing.

To run tests once, you can just execute `npm test` in the root project
directory.

To run tests continuously (with rebuild):

1. `npm install -g karma-cli`
2. `karma start`

As files are edited they will be rebuilt and the tests re-run.

For the list of manual tests, see [here](https://github.com/chrahunt/TagProReplays/wiki/Testing).

The extension currently supports Chrome 49+.

### Release

When you're ready to make a new release:

1. Make sure to update the version in `package.json` (this is automatically
   populated in `manifest.json`).
   `./dist`.
3. Load the `dist` directory as an unpacked extension and test.
4. If tests pass, then run `./tools/release.sh version`
6. Push to origin, make a release in GitHub, make a post on /r/TagPro, and
   upload `./dist/dist.zip` to the Chrome developer dashboard.

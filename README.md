# TagProReplays

TagProReplays is a Chrome extension designed to enable users to record short clips of gameplay for the game TagPro. The extension records the game continuously, saving the last several seconds (by default, 15) when the user hits the "save" button on the page, or presses their configured hotkey.

This Chrome extension is meant to serve as a replacement for screen capture software like OBS for users that don't require all the features or whose computers take a performance hit when running both the game and the screen capture software at the same time.

This project was initially authored by [Ballparts](https://github.com/ballparts), who may still pop in from time-to-time.

## Where do I get the extension?

You can find the TagProReplays Extension in the Chrome Web Store [here](https://chrome.google.com/webstore/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh).

## Does this extension only work for Chrome?

Yes and no. It is only designed to work with Chrome, but it will very likely also work with Opera if you first install [this extension](https://addons.opera.com/en/extensions/details/download-chrome-extension-9/?display=en), which allows downloading extensiond from the Chrome Web Store through Opera, then visit the link to the TagProReplays Extension given above.

## Development

### Building the Extension

There are two options for building the extension, development and production, which correspond to the `build-dev` and `build-prod` gulp tasks, respectively. The development build drops all the files into `build/dev` and includes source maps (TODO: incorporate watchify and gulp-watch). The production build puts the files into `build/release` and is only for releases.

In either case, when the extension is built, all non-JS files are copied into the relevant folder from `src` and `vendor`, then the files in the top-level of `src/js` are compiled using browserify and placed in the `js` directory of the target folder for the build.

```
npm install
gulp build-dev  # or ./node_modules/.bin/gulp if not installed globally
```

References to assets using `chrome.extension.getURL` can assume the same relative location as in the `src` directory.

Dependencies are resolved by browserify at compile-time, but the assets that may be required for those libraries are moved from their respective folders and into the `build` directory. This applies to bootstrap and jQuery-UI, and their CSS has been updated to properly refer to the images in the build directory.

`require` resolution for internal modules is done by specifying the relative location, but third-party dependencies (both in `vendor` and those installed as node modules) can be accessed using aliases defined in `package.json` under the `browser` key. See [browserify-shim](https://github.com/thlorenz/browserify-shim) for more information on this.

### Developing on the Extension

1. with watchify

### More Information

**Customized Dependencies**

As mentioned below, one reason for having specific dependencies included in the extension is because they required changes before use. Those changes are documented here:
* Bootstrap (3.2.0): CSS compiled so that any and all changes are scoped to `.bootstrap-container`. URL for fonts substituted to use `chrome-extension://__MSG_@@extension_id__/`, which allows it to resolve the file even as a content-script injected file.
* jQuery-UI (1.11.4): CSS scoped to `.jquery-ui-container` and image resource references changed similar to the above.
* FileSaver: No changes, just easier to shim than using the bower module.
* spinkit: No changes.
* Whammy: No changes, just needed to shim.

**Extension File Organization**:
* **build/**: This is the directory that the extension gets built to. `dev` is the target for the development build process and `release` is the target for the production build.
* **src/**: Main source files for the extension.
    - **js/**: Files directly under this directory are treated as individual entry points for the browserify build.
        + **modules/**: These files are disregarded by the build process (it's assumed that they'll be required by the top-level js files).
* **vendor/**: Third-party libraries that either don't have a proper module, or which required customization. Subdirectories other than `js` are copied to the `build` directory on build.

For CSS content scripts, ensure that referenced resources are prepended with `chrome-extension://__MSG_@@extension_id__/`, and listed under `web_accessible_resources` in the manifest.

### Testing

With [npm](https://github.com/npm/npm) installed, run `npm install` in the project root directory.

To run tests easily, install gulp globally with `npm install -g gulp` then run `gulp test` in the project's root directory.

Data format. Data formats are documented for the database as well as for the exportable raw replay data.


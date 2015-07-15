# TagProReplays

TagProReplays is a Chrome extension designed to enable users to record short clips of gameplay for the game TagPro. The extension records the game continuously, saving the last several seconds (by default, 15) when the user hits the "save" button on the page, or presses their configured hotkey.

This Chrome extension is meant to serve as a replacement for screen capture software like OBS for users that don't require all the features or whose computers take a performance hit when running both the game and the screen capture software at the same time.

This project was initially authored by [Ballparts](https://github.com/ballparts).

## Usage

### Where do I get the extension?

You can find the TagProReplays Extension in the Chrome Web Store [here](https://chrome.google.com/webstore/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh).

### Does this extension only work for Chrome?

Yes and no. It is only designed to work with Chrome, but it will very likely also work with Opera if you first install [this extension](https://addons.opera.com/en/extensions/details/download-chrome-extension-9/?display=en), which allows downloading extensiond from the Chrome Web Store through Opera, then visit the link to the TagProReplays Extension given above.

## Development

### Building/Updating the Extension

Because the project uses browserify, the individual JavaScript files can't be used directly, and compilation with browserify is needed before release and during development. The utility [`gulp`](http://gulpjs.com/) makes this easier to deal with. After reading about and installing the utility, you can execute one of the tasks below by running `gulp [task name]` (without brackets) in a command window pointing to the root directory of the project

* `build`: Browserifies the top-level JS source files in `src/js` (including source maps) and moves them along with all assets folders from `src` and `vendor` to `build/dev`. This directory isn't tracked, so when making non-release commits or debugging, this is the command to use.
* `build-prod`: Same as `build-dev` except without source maps and the files end up in `build/release`.
* `watch`: This is `build`+. It builds as above, but watches for changes to source and asset files, rebrowserifying and moving when any changes are made. After the initial build rebuilds are very quick, so there is little impact to development.

References to assets using `chrome.extension.getURL` can assume the same relative location as in the `src` directory.

Dependencies are resolved by browserify at compile-time, but the assets that may be required for those libraries are moved from their respective folders and into the `build` directory. This applies to bootstrap and jQuery-UI, and their CSS has been updated to properly refer to the images in the build directory.

`require` resolution for internal modules is done by specifying the relative location, but third-party dependencies (both in `vendor` and those installed as node modules) can be accessed using aliases defined in `package.json` under the `browser` key. See [browserify-shim](https://github.com/thlorenz/browserify-shim) for more information on this.

### More Information

**Customized Dependencies**

As mentioned below, one reason for having specific dependencies included in the extension is because they required changes before use. Those changes are documented here:

* Bootstrap (3.2.0): CSS compiled so that any and all changes are scoped to `.bootstrap-container`. The URLs for font assets are substituted to use `chrome-extension://__MSG_@@extension_id__/`, which enables Chrome to resolve the files even thought the CSS files are injected as content-scripts.
* jQuery-UI (1.11.4): CSS scoped to `.jquery-ui-container` and image resource references changed similar to the above.
* FileSaver: No changes, just easier to shim than using the bower module.
* spinkit: No changes.
* Whammy: No changes, just needed to shim.

**Extension File Organization**:

* **build/**: This is the directory that the extension gets built to. Subdirectories `dev` and `release` are the targets for the development and production builds, respectively.
* **src/**: Main source files for the extension.
    - **js/**: Files directly under this directory are treated as individual entry points for the browserify build.
        + **modules/**: These files are disregarded by the build process (it's assumed that they'll be required by the top-level js files).
    - **schemas/**: Holds the JSON-Schema files for the main replay file format. This also mirrors, for the most part, the format of the replays as they exist in the IndexedDB document store within the extension.
* **vendor/**: Third-party libraries that either don't have a proper module, or which required customization. Subdirectories other than `js` are copied to the `build` directory on build.

For CSS files injected as content scripts, ensure that referenced resources are prepended with `chrome-extension://__MSG_@@extension_id__/`, and listed under `web_accessible_resources` in the manifest.

### Testing

With [npm](https://github.com/npm/npm) installed, run `npm install` in the project root directory.

To run tests easily, install gulp globally with `npm install -g gulp` then run `gulp test` in the project's root directory.

Data format. Data formats are documented for the database as well as for the exportable raw replay data.

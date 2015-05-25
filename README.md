# TagProReplays

TagProReplays is a Chrome extension designed to enable users to record short clips of gameplay for the game TagPro. The extension records the game continuously, saving the last several seconds (by default, 15) when the user hits the "save" button on the page, or presses their configured hotkey.

This Chrome extension is meant to serve as a replacement for screen capture software like OBS for users that don't require all the features or whose computers take a performance hit when running both the game and the screen capture software at the same time.

## Where do I get the extension?

You can find the TagProReplays Extension in the Chrome Web Store [here](https://chrome.google.com/webstore/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh).

## Does this extension only work for Chrome?

Yes and no. It is only designed to work with Chrome, but it will very likely also work with Opera if you first install [this extension](https://addons.opera.com/en/extensions/details/download-chrome-extension-9/?display=en), which allows downloading extensiond from the Chrome Web Store through Opera, then visit the link to the TagProReplays Extension given above.

## Development

### Building the Extension

```
npm install
gulp browserify  # or ./node_modules/.bin/gulp if not installed globally
```

When the extension is built, the `background.js`, `TagProReplays.js`, and `replayRecording.js` files are run through browserify and their output is placed in the `js` directory of `build`. The folders `css`, `html`, and `images` are also copied over to `build`. As a result, references to assets using `chrome.extension.getURL` can assume the same relative location as in the `src` directory.

Dependencies are resolved by browserify at compile-time, but the assets that may be required for those extensions are moved from their respective folders and into the `build` directory. This applies to bootstrap and jQuery-UI, and their CSS has been updated to properly refer to the images in the build directory.

`require` resolution for internal modules is done by specifying the relative location, but third-party dependencies (both in `lib` and those installed as node modules) are defined in `package.json` under the `browser` key. See [browserify-shim](https://github.com/thlorenz/browserify-shim) for more information on this.

### Developing on the Extension

1. watchify

### More Information

**Customized Dependencies**

As mentioned below, one reason for having specific dependencies included in the extension is because they required changes before use. Those changes are documented here:
* Bootstrap (3.2.0): CSS compiled so that any and all changes are scoped to `.bootstrap-container`. URL for fonts substituted to use `chrome-extension://__MSG_@@extension_id__/`, which allows it to resolve the file even as a content-script injected file.
* jQuery-UI (1.11.4): CSS scoped to `.jquery-ui-container` and image resource references changed similar to the above.
* FileSaver: No changes, just easier to shim than using the bower module.
* spinkit: No changes.
* Whammy: No changes, just needed to shim.

**Extension File Organization**:
* **build/**: This is the directory that the extension gets built to.
* **lib/**: Third-party libraries that either don't have a proper module, or which required customization.
* **src/**: Main source files for the extension.
* **background.js**: The background page for the extension. It handles initial setup of the database that holds the extension data as well as the rendered movie data. It also has functions for getting and setting the textures, rendering movies, and other tasks to support the user interface.
* **cookies.js**: Utility script with functions for getting and setting cookies.
* **filesystem.js**: FileSystem API interface for storing, retrieving, and deleting rendered webm videos.
* **in-page-preview.js**: Create the in-browser replay viewer UI and provide additional functions for editing the replay from the replay viewer.
* **indexedDBUtils.js**: Provides interface for interaction with IndexedDB store, which is used for holding replay information.
* **map_draw_functions.js**: Contains methods for drawing and animating replays from the raw position/game state data.
* **menu.js**: Provides the interface to the in-page user interface. Initialized on tagprop server home pages by `TagProReplays.js`.
* **messaging.js**: Provides messaging interface for content script <=> background script messaging.
* **replayRecordings.js**: Content script for in-game recording. This is injected by code in TagProReplays.js when the user is in a game.
* **TagProReplays.js**: The main content script. Contains functions for initializing the user interface, injecting the recording script into the game page, updating the settings cookies used by the recording script, and relaying recorded information to the background page to be saved.
* **textures.js**: Contains functions for generating DataURL representations for textures from URLs as well as retrieving and converting textures between different formats.

For CSS content scripts, ensure that referenced resources are prepended with `chrome-extension://__MSG_@@extension_id__/`, and listed under `web_accessible_resources` in the manifest.
### Testing

With [npm](https://github.com/npm/npm) installed, run `npm install` in the project root directory.

To run tests easily, install gulp globally with `npm install -g gulp` then run `gulp test` in the project's root directory.

Data format. Data formats are documented for the database as well as for the exportable raw replay data.


# TagProReplays

TagProReplays is a Chrome extension designed to enable users to record short clips of gameplay for the game TagPro. The extension records the game continuously, saving the last several seconds (by default, 15) when the user hits the "save" button on the page, or presses their configured hotkey.

This Chrome extension is meant to serve as a replacement for screen capture software like OBS for users that don't require all the features or whose computers take a performance hit when running both the game and the screen capture software at the same time.

## Where do I get the extension?

You can find the TagProReplays Extension in the Chrome Web Store [here](https://chrome.google.com/webstore/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh).

## Does this extension only work for Chrome?

Yes and no. It is only designed to work with Chrome, but it will very likely also work with Opera if you first install [this extension](https://addons.opera.com/en/extensions/details/download-chrome-extension-9/?display=en), which allows downloading extensiond from the Chrome Web Store through Opera, then visit the link to the TagProReplays Extension given above.

## Development

**Extension File Organization**:
* **img/**: Holds the default image assets used by the extension for the user interface and as textures for replay rendering.
* **lib/**: Directory to hold third-party libraries used by the extension.
* **ui/**: Holds the assets and html that correspond to the in-page user interface for the extension.
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


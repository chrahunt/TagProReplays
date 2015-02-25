# TagProReplays

TagProReplays is a Chrome extension designed to enable users to record short clips of gameplay for the game TagPro. The extension records the game continuously, saving the last several seconds (by default, 15) when the user hits the "save" button on the page, or presses their configured hotkey.

This Chrome extension is meant to serve as a replacement for screen capture software like OBS for users that don't require all the features or whose computers take a performance hit when running both the game and the screen capture software at the same time.

## Where do I get the extension?

You can find the TagProReplays Extension in the Chrome Web Store [here](https://chrome.google.com/webstore/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh).

## Does this extension only work for Chrome?

Yes and no. It is only designed to work with Chrome, but it will very likely also work with Opera if you first install [this extension](https://addons.opera.com/en/extensions/details/download-chrome-extension-9/?display=en), which allows downloading extensiond from the Chrome Web Store through Opera, then visit the link to the TagProReplays Extension given above.

## Development

**Project Organization**:
* **img/**: Holds the default image assets used by the extension for replay rendering.
* **lib/**: Directory to hold third-party libraries used by the extension.
* **ui/**: Holds the assets and html that correspond to the in-page user interface for the extension.
* **background.js**: The background page for the extension. It handles initial setup of the database that holds the extension data as well as the rendered movie data. It also has functions for getting and setting the textures, rendering movies, and other tasks to support the user interface.
* **filesystem.js**: Contains functions that support the background script in interacting with the database.
* **in-page-preview.js**: Create the in-browser replay viewer UI and provide additional functions for editing the replay from the replay viewer.
* **loadTextures.js**: Single function for saving textures uploaded via the settings UI.
* **map_draw_functions.js**: Contains methods for drawing and animating replays from the raw position/game state data.
* **replayRecordings.js**: Content script for in-game recording. This is injected by code in TagProReplays.js when the user is in a game.
* **TagProReplays.js**: The main content script. Contains functions for initializing the user interface, saving settings, interacting with the background script for replay-editing and download capabilities, and injecting the game data listener script into the page during a game.

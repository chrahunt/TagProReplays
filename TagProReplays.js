/**
 * Constructs the user interface accessible on the main page of any
 * TagPro server. Also responsible for injecting the listener script
 * onto game pages and relaying the recorded game information to the
 * background script for saving.
 *
 * This script is included as a content script.
 */
(function(window, document, undefined) {

// Callback for options update event, updates the cookies needed
// by the recording script.
function updateCookies(options) {
    setCookie('fps', options.fps);
    setCookie('duration', options.duration);
    setCookie('useRecordKey', options.shortcut_key_enabled);
    setCookie('replayRecordKey', options.shortcut_key);
    setCookie('record', options.record);
}

// Set listener to update cookies when options are updated.
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (changes.options && changes.options.newValue) {
        updateCookies(changes.options.newValue);
    }
});

// Options management.
// Get default options object.
function getDefaultOptions() {
    var options = {
        fps: 60,
        duration: 30,
        shortcut_key_enabled: true,
        shortcut_key: 47, // '/' key.
        custom_textures: false,
        canvas_width: 1280,
        canvas_height: 800,
        splats: true,
        ui: true,
        chat: true,
        spin: true,
        record: true // Recording enabled.
    };
    return options;
}

// Ensure extension options are set, setting to default if needed.
function checkOptions() {
    chrome.storage.local.get("options", function(items) {
        if (!items.hasOwnProperty("options") ||
            typeof items.options !== "object") {
            chrome.storage.local.set({
                options: getDefaultOptions()
            });
        }
    });
}

checkOptions();

/**
 * Inserts Replay button in main page
 * @param  {Menu} menu - The menu to open.
 */
function createReplayPageButton(menu) {
    function findInsertionPoint() {
        buttons = $('article>div.buttons.smaller>a')
        for (var i = 0; i < buttons.length; i++) {
            textcontent = buttons[i].textContent
            if (textcontent.search('Leaders') >= 0) {
                return (buttons[i]);
            }
        }
    }

    $(findInsertionPoint()).after('<a class=button id=ReplayMenuButton>Replays')
    $('#ReplayMenuButton').append('<span>watch yourself')
    $('#ReplayMenuButton').click(function () {
        menu.open();
    });
}

// This is an easy method wrapper to dispatch events
function emit(event, data) {
    var e = new CustomEvent(event, {detail: data});
    window.dispatchEvent(e);
}

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function (e) {
        listener(e.detail);
    });
}

// set up listener for info from injected script
// if we receive data, send it along to the background script for storage
listen('saveReplay', function (data) {
    console.log('Received position data from injected script. Sending to background script.');
    // Generate new name for replay.
    var name = 'replays' + Date.now();
    chrome.runtime.sendMessage({
        method: 'saveReplay',
        data: data,
        name: name
    }, function(response) {
        emit('replaySaved', response.failed);
    });
});

function injectScript(path) {
    var script = document.createElement('script');
    script.setAttribute("type", "application/javascript");
    script.src = chrome.extension.getURL(path);
    script.onload = removeScript;
    (document.head || document.documentElement).appendChild(script);
}

function removeScript() {
    this.parentNode.removeChild(this);
}

function injectStyleSheet(path) {
    var link = document.createElement('link');
    link.setAttribute("rel", "stylesheet");
    link.href = chrome.extension.getURL(path);
    //script.onload = removeScript;
    (document.head || document.documentElement).appendChild(link);
}

// If we're on the main tagpro server screen, create the main menu and
// the button that opens it.
if (document.URL.search(/[a-z]+\/#?$/) >= 0) {
    // Make the body scrollable.
    $('body')[0].style.overflowY = "scroll"

    // Initialize the menu.
    var menu = new Menu();
    
    // Make the menu-opening button.
    createReplayPageButton(menu);

    // Include custom bootstrap.css scoped to #tpr-container
    injectStyleSheet("ui/bootstrap.css");
    injectStyleSheet("ui/menus.css");
}

// if we're in a game, as evidenced by there being a port number,
// inject the replayRecording.js script.
if (document.URL.search(/\.\w+:/) >= 0) {
    var scripts = ["replayRecording.js"];
    scripts.forEach(injectScript);
}

})(window, document);

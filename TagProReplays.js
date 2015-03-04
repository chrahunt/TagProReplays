/**
 * Constructs the user interface accessible on the main page of any
 * TagPro server. Also responsible for injecting the listener script
 * onto game pages, and relaying information and actions from the
 * listener script and user interface to the background page for
 * processing.
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

// function to delete replays from menu after their data are deleted from IndexedDB    
// this gets called in reponse to a message from the background script confirming a
// data deletion    
function deleteRows(deletedFiles) {
    if(!$.isArray(deletedFiles)) {
        $('#'+deletedFiles).remove();
        return;
    }
    deletedFiles.forEach(function(deletedFile){
        $('#'+deletedFile).remove();
    });
};

// function to change the name text and id of a replay when a user renames the replay
// this gets called in response to a message from the background script confirming a 
// successful renaming
function renameRow(oldName, newName) {
    var oldRow = $('#' + oldName);
    $('#'+oldName + ' .playback-link').text(newName.replace(/DATE.*/, ''));
    oldRow.data("replay", newName);
    oldRow[0].id = newName;
};

//Get replay id for row, given an element in it.
function getReplayId(elt) {
    var replayRow = $(elt).closest('tr');
    return replayRow.data("replay");
}

// set global scope for some variables and functions
// then set up listeners for info from background script
var positions
var populateList

messageListener("positionData",
function(message, sender, sendResponse) {
    console.log('got positionData message')
    localStorage.setItem('currentReplayName', message.movieName)
    console.log(typeof message.title)
    positions = JSON.parse(message.title)
    console.log(positions)
    createReplay(positions)
});

messageListener("fileRenameSuccess",
function(message, sender, sendResponse) {
    console.log('Received confirmation of replay rename from background script.');
    renameRow(message.oldName, message.newName);
    sortReplays();
});

messageListener("picture",
function(message, sender, sendResponse) {
    console.log('Received picture file from background script.');
    picture = message.file;
});

messageListener("movieDownloadFailure",
function(message, sender, sendResponse) {
    alert('Download failed. Most likely you haven\'t rendered that movie yet.')
});

messageListener("progressBarCreate",
function(message, sender, sendResponse) {
    console.log('Received request to create progress bar for ' + message.name)
    $('#' + message.name + ' .rendered-check').html('<progress class="progressbar">')
});

/**
 * Update progress bar.
 */
messageListener("progressBarUpdate",
function(message, sender, sendResponse) {
    if (typeof $('#' + message.name + ' .progressbar')[0] !== 'undefined') {
        $('#' + message.name + ' .progressbar')[0].value = message.progress
    }
});

messageListener("renderConfirmation",
function(message, sender, sendResponse) {
    $('#' + message.name + ' .progressbar').remove();
    if (message.failure) {
        console.log('Rendering of ' + message.name + ' was a failure.');
        $('#' + message.name + ' .rendered-check').text('✘');
        $('#' + message.name + ' .rendered-check').css('color', 'red');
    } else {
        $('#' + message.name + ' .rendered-check').text('✓');
        $('#' + message.name + ' .download-movie-button').prop('disabled', false);
    }

    if (!message.last) {
        var index = message.index + 1;
        var last = false;
        if (index == message.replaysToRender.length - 1) {
            last = true;
        }
        chrome.runtime.sendMessage({
            method: 'render',
            data: message.replaysToRender,
            index: index,
            last: last
        });
        console.log('Sent request to render replay: ' + replaysToRender[index]);
    }
});

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

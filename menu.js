/**
 * Holds the interface to the main page user interface.
 * Methods prepended with an underscore are used internally by the
 * Menu.
 * There are two areas of concern in the user interface, settings
 * and the replay list. A method that begins _list_ is a callback
 * for some list-specific action that a user my invoke.
 */
(function(window, document, undefined) {

// Symbols used for replay table headers.
var UP_ARROW = "\u25B2";
var DOWN_ARROW = "\u25BC";

/**
 * Construct the replay menu.
 * @constructor
 */
var Menu = function() {
    // Create Container for Replay Menu.
    $('article').append(
        '<div id="tpr-container" class="bootstrap-container">');
    var url = chrome.extension.getURL("ui/menus.html");

    // Retrieve html of menu.
    $('#tpr-container').load(url, this._init.bind(this));
};

// Make menu class accessible.
window.Menu = Menu;

/**
 * Carry out initialization. Should be called after (or in response to)
 * the loading of the html for the menu.
 */
Menu.prototype._init = function() {
    /* UI-specific code */
    // Handling multiple modals
    // http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
    $(function () {
        $('.modal').on('hidden.bs.modal', function (e) {
            $(this).removeClass('fv-modal-stack');
            $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') - 1);
        });

        $('.modal').on('shown.bs.modal', function (e) {
            // keep track of the number of open modals
            if (typeof($('#tpr-container').data('open_modals')) == 'undefined') {
                $('#tpr-container').data('open_modals', 0);
            }

            // if the z-index of this modal has been set, ignore.
            if ($(this).hasClass('fv-modal-stack')) {
                return;
            }

            $(this).addClass('fv-modal-stack');

            $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') + 1);

            $(this).css('z-index', 1040 + (10 * $('#tpr-container').data('open_modals')));

            $('.modal-backdrop').not('.fv-modal-stack').css(
                'z-index',
                1039 + (10 * $('#tpr-container').data('open_modals'))
            );

            $('.modal-backdrop').not('fv-modal-stack').addClass('fv-modal-stack');
        });
    });

    // Run initialization for other parts of the menu.
    this._initListeners();
    this._initSettings();
    this._initReplayList();
};

/**
 * Initialize state and functionality related to the replay list.
 */
Menu.prototype._initReplayList = function() {
    // allow 'select all' checkbox to work
    $('#selectAllCheckbox')[0].onchange = function(e) {
        $('.replayRow:not(.clone) .selected-checkbox').each(function() {
            this.checked = e.target.checked;
        });
    }

    // Buttons that take action on multiple entries.
    $('#renderSelectedButton').click(this._list_Render.bind(this));
    $('#deleteSelectedButton').click(this._list_Delete.bind(this));
    $('#downloadRawButton').click(this._list_RawDownload.bind(this));

    /*
    These next functions allow toggling of the various sort methods.
    A cookie is used to store the current sort preference.
    Values of this cookie include:
        - "alphaA"  : alphabetical ascending - normal alphabetical order
        - "alphaD"  : alphabetical descending - reverse alphabetical
        - "chronoA" : chronological ascending - older replays appear at the top
        - "chronoD" : chronological descending - newer replays appear at the top
        - "durA"    : duration ascending - shorter replays appear at the top
        - "durD"    : duration descending - longer replays appear at the top
        - "renA"    : rendered ascending - unrendered replays appear at the top
        - "renD"    : rendered descending - rendered replays appear at the top
    
    */
    // Sorting functionality.
    $('#nameHeader').click(this._getSortFunction("alpha"));
    $('#dateHeader').click(this._getSortFunction("chrono"));
    $('#durationHeader').click(this._getSortFunction("dur"));
    $('#renderedHeader').click(this._getSortFunction("ren"));

    // If no sortmethod cookie exists, default is chronoD.
    if(!readCookie('sortMethod')) {
        setCookie('sortMethod', 'chronoD');
    }

    // Raw data import functionality.
    // Visible button invokes the actual file input.
    $('#raw-upload-button').click(function (e) {
        // Empty file input so change listener is invoked even if same
        // file is selected.
        $('#raw-upload').val('');
        $('#raw-upload').click();
        e.preventDefault();
    });
    $('#raw-upload').attr('accept', '.txt');
    $('#raw-upload').change(this._list_Import());

    // Initialize listener for list modifications.
    var target = $('#replayList tbody')[0];
    var observer = new MutationObserver(function(mutations) {
        var update = mutations.some(function(mutation) {
            return mutation.type === 'childList';
        });
        if (update) {
            this._list_Update();
        }
    }.bind(this));
    observer.observe(target, { childList: true });

    // Re-set menu dimensions on window resize.
    $(window).resize(this._setListHeight);
    $(window).resize(this._setListWidth);

    // Send request for initially populating list.
    chrome.runtime.sendMessage({
        method: 'requestList'
    }, function(response) {
        var entries = this._getEntryData(response);
        // Sort the entries.
        this._sortEntries(entries, readCookie('sortMethod'));
        // Hide loader.
        $('#replaysLoading').hide();
        entries.forEach(function(entry) {
            this.addRow(entry);
        }, this);
        this.listInitialized = true;
    }.bind(this));

    // Initially set list UI in case above request doesn't result in
    // any new rows being added.
    this._list_Update();
};

/**
 * Returns a function to be set as a listener on the replay import
 * button.
 * @return {Function} - The function to be set as a listener on the
 *   replay import button.
 */
Menu.prototype._list_Import = function() {
    var menu = this;
    return function() {
        /**
         * Given the name of an uploaded file, get the name of the replay
         * the raw data should be saved under.
         * @param {string} filename - The name of the raw data file
         *   uploaded.
         * @return {string} - The name to use for the replay.
         */
        function getReplayName(filename) {
            var name = filename.replace(/\.txt$/, '');
            if (name.search('DATE') < 0 && name.search('replays') != 0) {
                name += 'DATE' + new Date().getTime();
            }
            return name;
        }

        /**
         * Checks whether the values for each of the properties on the
         * passed object are true.
         * @param {object} pending - The object with properties
         *   corresponding to the tasks to be completed.
         * @return {Boolean} - Whether or not all the tasks are
         *   completed.
         */
        function isComplete(pending) {
            for (var operation in pending) {
                var status = pending[operation];
                if (!status) {
                    return false;
                }
            }
            return true;
        }
        
        var fileData = [];
        var rawFiles = $(this).prop('files');
        var files = [];
        for (var i = 0; i < rawFiles.length; i++) {
            files.push(rawFiles[i]);
        }
        // Object to hold the status of each file reading operation.
        var pending = {};
        files.forEach(function(file) {
            var replayName = getReplayName(file.name);
            pending[replayName] = false;
            var fr = new FileReader();
            fr.onload = function(e) {
                fileData.push({
                    name: replayName,
                    data: e.target.result,
                    filename: file.name
                });
                delete pending[replayName];
                if (isComplete(pending)) {
                    menu._parseRawData(fileData);
                }
            };
            fr.readAsText(file);
        });
    };
};

/**
 * @typedef FileData
 * @type {object}
 * @property {string} name - The name to use for the replay.
 * @property {string} filename - The name of the file as uploaded by
 *   the user.
 * @property {PositionData} data - The actual replay data.
 */
/**
 * Parse the raw data and send the information to the background script
 * for saving.
 * @param {Array.<FileData>} filedata - The data for the file(s)
 *   uploaded by the user.
 */
Menu.prototype._parseRawData = function(filedata) {
    if (filedata.length === 0) return;
    /**
     * Check whether a given data file meets some basic requirements.
     * @param {object} parsedData
     * @return {boolean} - Whether the object from the data file
     *   contains the required properties.
     */
    function checkParsed(parsedData) {
        var props = ["tiles", "clock", "floorTiles", "map", "wallMap"];
        return props.every(function(prop) {
            return parsedData.hasOwnProperty(prop);
        });
    }

    var info = filedata.pop();
    var name = info.name;
    var data = info.data;
    try {
        var parsed = JSON.parse(data);
    } catch (err) {
        alert('The file you uploaded was not a valid TagPro Replays raw file.');
        return;
    }

    if (!checkParsed(parsed)) {
        alert('The file you uploaded was not a valid TagPro Replays raw file.');
    } else {
        var message = {
            method: 'saveReplay',
            data: data
        };
        // When would filename be undefined?
        if(typeof name !== 'undefined') {
            message.name = name;
        } else {
            message.name = 'replays' + new Date().getTime();
        }

        // Send message to set position data.
        chrome.runtime.sendMessage(message, function(response) {
            // TODO: Handle failed replay adding.
            // Read next file.
            this._parseRawData(filedata);
        }.bind(this));
    }
};

/**
 * Function called in response to a list update.
 */
Menu.prototype._list_Update = function() {
    var entries = this.getEntries();
    if (entries.length === 0) {
        $('#noReplays').show();
        $('#replayList').hide();

        $('#renderSelectedButton').prop('disabled', true);
        $('#deleteSelectedButton').prop('disabled', true);
        $('#downloadRawButton').prop('disabled', true);
        $('#selectAllCheckbox').prop('checked', false);
        $('#selectAllCheckbox').prop('disabled', true);
    } else {
        $('#replayList').show();
        $('#noReplays').hide();
        // Enable buttons for interacting with multiple selections.
        $('#renderSelectedButton').prop('disabled', false);
        $('#deleteSelectedButton').prop('disabled', false);
        $('#downloadRawButton').prop('disabled', false);
        $('#selectAllCheckbox').prop('disabled', false);
    }

    // Updating.
    $('#replayList').height('auto');
    // Automatic height adjustment for replay list.
    $('#menuContainer .modal-dialog').data(
        'original-height',
        $('#menuContainer .modal-dialog').actual('height'));

    this._setListHeight();
    this._setListWidth();
};

/**
 * Set replay list height relative to the visible height of the window
 * unless the window is very short.
 */
Menu.prototype._setListHeight = function() {
    if ($('#menuContainer .modal-dialog').data('original-height') > $(window).height()) {
        var setHeight = false;
        var newHeight = 185;
        if ($(window).height() > 500) {
            newHeight = $(window).height() - 315;
        }
        $('#replayList').height(newHeight);
        // Fix table header width.
        $('#replay-headers').width($('#replayList table').actual('width'));
    }
};

/**
 * Set replay list width relative to the visible width of the window.
 */
Menu.prototype._setListWidth = function() {
    $('#menuContainer .modal-dialog').width(0.70 * $(window).width());
};

/**
 * Render checked items on the replay list.
 */
Menu.prototype._list_Render = function() {
    var replaysToRender = this.getCheckedEntries();
    if (replaysToRender.length > 0) {
        var msg = "Are you sure you wish to render these replays? " +
            "Some extension functions will be unavailable until the " +
            "movies are rendered.";
        if (confirm(msg)) {
            // Display queued message on replays.
            replaysToRender.forEach(function(replay) {
                $('#' + replay + ' .rendered-check').text('Queued...');
                $('#' + replay + ' .rendered-check')
                    .css('color', 'green');
            });
            chrome.runtime.sendMessage({
                method: 'render',
                data: replaysToRender
            });
            console.log('Sent request to render replay' + 
                (replaysToRender.length == 1 ? '' : 's') + ': ' +
                replaysToRender);
        }
    }
};

/**
 * Delete checked items on the replay list after confirmation.
 */
Menu.prototype._list_Delete = function() {
    var replaysToDelete = this.getCheckedEntries();

    if (replaysToDelete.length > 0) {
        if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
            console.log('requesting to delete ' + replaysToDelete);
            chrome.runtime.sendMessage({
                method: 'requestDataDelete',
                fileName: replaysToDelete
            });
        }
    }
};

/**
 * Download raw replay data corresponding to checked items.
 */
Menu.prototype._list_RawDownload = function() {
    var rawDataToDownload = this.getCheckedEntries();
    if (rawDataToDownload.length > 0) {
        console.log('Requesting to download raw data for ' + rawDataToDownload);
        chrome.runtime.sendMessage({
            method: 'requestDataForDownload',
            files: rawDataToDownload
        });
    }
};

/**
 * Sort replays according to given sort type.
 * @param  {string} type [description]
 */
Menu.prototype._list_Sort = function(baseSortType) {
    // Get sort type and save it.
    var type = this._getSortTypeFromDesired(baseSortType);
    this._saveSortType(type);
    this.sort(type);
};

/**
 * Returns callback for download button for individual replay list entry. Sends
 * a request to the background script to initiate download of the
 * rendered movie file.
 */
Menu.prototype._entry_Download = function() {
    var menu = this;
    return function() {
        var replayId = menu._getReplayId(this);
        var fileNameToDownload = replayId;
        console.log('asking background script to download video for ' + fileNameToDownload);
        chrome.runtime.sendMessage({
            method: 'downloadMovie',
            name: fileNameToDownload
        });
    };
};

/**
 * Callback for rename button for individual replay list entry. Sends
 * a request to the background script to carry out the action.
 */
Menu.prototype._entry_Rename = function() {
    var menu = this;
    return function() {
        var replayId = menu._getReplayId(this);
        var fileNameToRename = replayId;
        var datePortion = fileNameToRename.replace(/.*DATE/, '').replace('replays', '');
        var newName = prompt('How would you like to rename ' + fileNameToRename.replace(/DATE.*/, ''));
        if (newName !== null) {
            newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '') + "DATE" + datePortion;
            console.log('requesting to rename from ' + fileNameToRename + ' to ' + newName);
            chrome.runtime.sendMessage({
                method: 'renameReplay',
                id: replayId,
                name: newName
            });
        }
    };
};

/**
 * Callback for playback link which initiates the in-browser previewer
 * for the replay.
 */
Menu.prototype._entry_Play = function() {
    var menu = this;
    return function() {
        var replayId = menu._getReplayId(this);
        $('#menuContainer').hide();
        console.log('sending data request for ' + replayId);
        sessionStorage.setItem('currentReplay', replayId);
        chrome.runtime.sendMessage({
            method: 'requestData',
            id: replayId
        }, function(response) {
            console.log('Got requestData response.');
            // Set local storage for in-page-preview.
            localStorage.setItem('currentReplayName', replayId);
            console.log(typeof response.data);
            var positions = JSON.parse(response.data);
            //console.log(positions);
            createReplay(positions);
        });
    };
};

/**
 * Callback for hover on playback link, which shows a preview for the
 * replay.
 */
Menu.prototype._entry_Preview = function() {
    var menu = this;

    // Replace the loader icon with the preview image.
    function replaceLoaderWithPreview(id, preview) {
        // Cache preview image.
        $('#' + id + ' a.playback-link').data('preview', preview);

        var $popover = $('#' + id + ' .popover');
        // Don't show preview image if popover has already been
        // removed.
        if ($popover.length === 0) return;
        var previewImage = new Image();
        previewImage.onload = function() {
            var $content = $('#' + id + ' .popover-content');
            var poHeight = $popover.height();
            var poWidth = $popover.width();
            var poTop = +$popover.css('top').replace('px', '');
            var cHeight = $content.height();
            var cWidth = $content.width();
            var height = poHeight + previewImage.height - cHeight;
            var width = poWidth + previewImage.width - cWidth;
            var top = poTop - (height - poHeight) / 2;
            $popover.animate({
                height: height,
                width: width,
                top: top
            }, {
                duration: 600,
                complete: function() {
                    // Replace loading image with preview.
                    $('#' + id + ' .popover-content > div')
                        .replaceWith(previewImage);
                }
            });
        };
        previewImage.src = preview;
    }

    return function () {
        // Check if image data has been cached on element data
        // property.
        if (!$(this).data('preview')) {
            var id = menu._getReplayId(this);
            var key = "preview:" + id;
            // Check if preview has previously been generated and stored.
            chrome.storage.local.get(key, function(items) {
                if (!items[key]) {
                    // Generate preview.
                    // TODO: Handle generation failure.
                    this._generatePreview(id, function(preview) {
                        var store = {};
                        store[key] = preview;
                        // TODO: Handle save failure.
                        chrome.storage.local.set(store);
                        replaceLoaderWithPreview(id, preview);
                        
                    });
                } else {
                    replaceLoaderWithPreview(id, items[key]);
                }
            }.bind(menu));
            // Return loading icon.
            return '<div class="sk-spinner sk-spinner-rotating-plane"></div>';
        } else {
            return '<img src="' + $(this).data('preview') + '"/>';
        }
    };
};

/**
 * Returns callback for entry checkboxes to support the shift-click
 * multi-select behavior.
 * @return {Function} - The function to be used as a callback on entry
 *   checkboxes.
 */
Menu.prototype._entry_Check = function() {
    return function(e) {
        var boxesChecked = $('.replayRow:not(.clone) .selected-checkbox:checked').length;
        if(this.checked && e.shiftKey && boxesChecked > 1) {
            var boxes = $('.replayRow:not(.clone) .selected-checkbox'),
                closestBox,
                thisBox;
            for(var i = 0; i < boxes.length; i++) {
                if ( this == boxes[i] ) { 
                    var thisBox = i; 
                    if (closestBox) break;
                    continue;
                }
                if (boxes[i].checked) var closestBox = i;
                if ( thisBox && closestBox ) break;
            }
            var bounds = [closestBox, thisBox].sort(function(a, b){
                return a - b;
            });
            boxes.map(function(num, box) { 
                if(num > bounds[0] && num < bounds[1]) box.checked = true;
            });
        }
    }
};

// TODO: Finish documenting.
/**
 * @typedef Metadata
 * @type {object}
 * @property {[type]} redTeam [description]
 * @property {[type]} blueTeam [description]
 * @property {[type]} map [description]
 * @property {[type]} fps [description]
 * @property {integer} duration [description]
 */
/**
 * This object type also adheres to the specification for SortObj
 * and can be used in sorting functions.
 * @typedef EntryData
 * @type {object}
 * @property {integer} duration - Duration of the replay in seconds.
 * @property {string} name - Name of the replay.
 * @property {string} id - The id of the replay.
 * @property {Date} date - Integer date the replay was recorded.
 * @property {boolean} rendered - Whether the replay was rendered.
 * @property {Metadata} metadata - The metadata for the replay.
 */
/**
 * Convert the information returned from the background page into
 * information that can be used to populate the list. If there are
 * no entries in the respones then an empty array is returned.
 * @param  {object} response - The response sent by the background
 *   page in response to the request for information.
 * @return {Array.<EntryData>} - An array of data for populating
 *   the rows.
 */
Menu.prototype._getEntryData = function(response) {
    var ids = response.positionKeys;
    var renderedIds = response.movieNames;
    // Same order as the ids.
    var metadata = JSON.parse(response.metadata).map(function(data) {
        return JSON.parse(data);
    });

    var entries = ids.map(function(id, index) {
        var info = metadata[index];
        var movieId = id.replace('replays', '').replace(/.*DATE/, '');
        return {
            name: this._getName(id),
            id: id,
            rendered: (renderedIds.indexOf(movieId) !== -1),
            date: new Date(this._getTime(id)),
            duration: info.duration,
            metadata: info
        };
    }, this);
    return entries;
};

/**
 * Return a function to use as a callback for sort-invoking elements.
 * @param  {string} type - The type to sort by.
 * @return {Function} - The function to use as a callback.
 */
Menu.prototype._getSortFunction = function(type) {
    return function() {
        this._list_Sort(type);
    }.bind(this);
};

/**
 * Compare two elements a and b. If a is smaller than b then -1 is
 * returned, if larger then 1 is returned, if equal then 0 is returned.
 * @param {(number|string)} a
 * @param {(number|string)} b
 * @return {number} - one of -1, 0, 1 indicating a is less than, equal
 *   to, or greater than b.
 */
Menu.prototype._compare = function(a, b) {
    if (typeof a == 'string' && typeof b == 'string') {
        return a.localeCompare(b);
    } else {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }
};

/**
 * Given a replay id, get the ms representing the date it was captured.
 * This function is used when the time information is stored in the
 * replay id.
 * @param  {string} replayId - The id of the replay.
 * @return {integer} - ms representing date/time replay was recorded.
 */
Menu.prototype._getTime = function(replayId) {
    return Number(replayId.replace('replays', '').replace(/.*DATE/, ''));
};

/**
 * Given a replay id, get the name of the replay.
 * This function is used when the name information for the replay is
 * stored in the replay id.
 * @param {string} id - The id of the replay.
 */
Menu.prototype._getName = function(id) {
    return id.replace(/DATE.*/, '');
};

/**
 * Initialize state related to the settings panel.
 */
Menu.prototype._initSettings = function() {
    $('#settings-title').text('TagPro Replays v' + chrome.runtime.getManifest().version);
    this._setSettingsFormTitles();
    $('#saveSettingsButton').click(this._settingsSave);

    // Set initial settings values.
    chrome.storage.local.get("options", function(items) {
        if (items.options) {
            this._settingsSet(items.options);
        }
    }.bind(this));

    // Update options fields if options are updated.
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (changes.options && changes.options.newValue) {
            this._settingsSet(changes.options.newValue);
        }
    }.bind(this));
    $('#textureSaveButton').click(function () {
        saveTextureSettings();
        $('#textureContainer').modal('hide');
    });

    // Record key functionality.
    keyListener = function (e) {
        currentRecordKey = e.which
        $('#recordKeyChooserInput').text(String.fromCharCode(e.which))
        $('#recordKeyChooserInput').data('record', true);
        $('#record-key-remove').show();
        stopInputting();
    }

    stopInputting = function () {
        $('#record-key-input-container').removeClass('focused');
        $(document).off("keypress", keyListener);
    }

    $('#record-key-input-container').click(function (e) {
        $(this).addClass('focused');
        $(document).on("keypress", keyListener)
    });

    $('#record-key-remove').click(function (e) {
        e.stopPropagation();
        $('#recordKeyChooserInput').data('record', false);
        $('#recordKeyChooserInput').text('None');
        $('#record-key-remove').hide();
        return false;
    });

    $(document).click(function (e) {
        if (!$(e.target).parents().andSelf().is('#record-key-input-container')) {
            stopInputting();
        }
    });
};

/**
 * Callback for the save settings button.
 */
Menu.prototype._settings_Save = function() {
    chrome.storage.local.get("options", function(items) {
        var options;
        if (items.options) {
            options = items.options;
        } else {
            options = getDefaultOptions();
        }
        var inputs = {
            fps: $('#fpsInput')[0].value,
            duration: $('#durationInput')[0].value,
            record: $('#recordCheckbox')[0].checked,
            custom_textures: $('#useTextureCheckbox')[0].checked,
            shortcut_key_enabled: $('#recordKeyChooserInput').data('record'),
            shortcut_key: $('#recordKeyChooserInput').text(),
            splats: $('#useSplatsCheckbox')[0].checked,
            spin: $('#useSpinCheckbox')[0].checked,
            ui: $('#useClockAndScoreCheckbox')[0].checked,
            chat: $('#useChatCheckbox')[0].checked,
            canvas_width: Number($('#canvasWidthInput').val()),
            canvas_height: Number($('#canvasHeightInput').val())
        };

        if (!isNaN(inputs.fps) && inputs.fps != "") {
            options.fps = +inputs.fps;
        }
        if (!isNaN(inputs.duration) && inputs.duration != "") {
            options.duration = +inputs.duration;
        }
        options.record = inputs.record;
        options.custom_textures = inputs.custom_textures;
        options.shortcut_key_enabled = inputs.shortcut_key_enabled;
        if (inputs.shortcut_key !== 'None') {
            options.shortcut_key = inputs.shortcut_key.charCodeAt(0);
        }
        options.splats = inputs.splats;
        options.spin = inputs.spin;
        options.ui = inputs.ui;
        options.chat = inputs.chat;
        if (!isNaN(inputs.canvas_width) && inputs.canvas_width !== "") {
            options.canvas_width = inputs.canvas_width;
        }
        if (!isNaN(inputs.canvas_height) && inputs.canvas_height !== "") {
            options.canvas_height = inputs.canvas_height;
        }

        chrome.storage.local.set({
            options: options
        }, function() {
            chrome.runtime.sendMessage({
                method: 'cleanRenderedReplays'
            });
            $('#settingsContainer').modal('hide');
        });
    });
};

/**
 * Set value of form fields in settings panel.
 * @param  {[type]} options [description]
 */
Menu.prototype._settingsSet = function(options) {
    $('#fpsInput')[0].value = options.fps;
    $('#durationInput')[0].value = options.duration;
    if (options.shortcut_key_enabled) {
        $('#recordKeyChooserInput').text(
            String.fromCharCode(options.shortcut_key));
        $('#recordKeyChooserInput').data('record', true);
        $('#record-key-remove').show();
    } else {
        $('#recordKeyChooserInput').text('None');
        $('#recordKeyChooserInput').data('record', false);
        $('#record-key-remove').hide();
    }
    $('#useTextureCheckbox')[0].checked = options.custom_textures;
    $('#useSplatsCheckbox')[0].checked = options.splats;
    $('#recordCheckbox')[0].checked = options.record;
    $('#useSpinCheckbox')[0].checked = options.spin;
    $('#useClockAndScoreCheckbox')[0].checked = options.ui;
    $('#useChatCheckbox')[0].checked = options.chat;
    $('#canvasWidthInput').val(options.canvas_width);
    $('#canvasHeightInput').val(options.canvas_height);
};

/**
 * Save sort type to cookie.
 * @param  {string} type - The type to save.
 */
Menu.prototype._saveSortType = function(type) {
    setCookie('sortMethod', type);
};

/**
 * Get sort type from cookie. If no cookie is set then it returns
 * "alphaD".
 * @return {string} - The sort type.
 */
Menu.prototype._getSortType = function() {
    var val = readCookie('sortMethod');
    return val || 'alphaD';
};

/**
 * Takes a desired sort type and returns the sort type to use next. If
 * the entries are currently sorted by the type passed in then the type
 * will be the opposite direction, otherwise it will be descending in
 * the provided type.
 * @param  {string} type - enum of "alpha", "chrono", "dur", or "ren"
 * @return {string}
 */
Menu.prototype._getSortTypeFromDesired = function(type) {
    function getOppositeDirection(type) {
        var typeRe = /(\w+)(A|D)/;
        var found = type.match(typeRe);
        var dir = found[2] == 'A' ? 'D' : 'A';
        return found[1] + dir;
    }
    var currentType = this._getSortType();
    if (currentType.search(type) == 0) {
        return getOppositeDirection(currentType);
    } else {
        return type + 'D';
    }
};

/**
 * Minimum object used for sorting entries.
 * @typedef SortObject
 * @type {object}
 * @property {integer} duration - The length of the replay (in
 *   seconds).
 * @property {boolean} rendered - Whether the replay has been rendered.
 * @property {string} name - The name of the replay.
 * @property {Date} date - The date the replay was recorded.
 */
/**
 * Get objects representing the sortable attributes of the replays.
 * @return {Array.<SortObject>} - Objects with properties corresponding to
 *   the sortable fields of the set of replays.
 */
Menu.prototype._getSortableEntries = function() {
    var replays = this.getEntries();
    var entries = replays.map(function(row) {
        var thisDurationString = $(row).find('.duration').text();
        var thisMinutes = Number(thisDurationString.split(':')[0]);
        var thisSeconds = Number(thisDurationString.split(':')[1]);
        var thisDuration = 60*thisMinutes + thisSeconds;
        var thisRendered = $(row).find('.rendered-check').text() !== '';
        return {
            id: row.id,
            name: this._getName(row.id),
            duration: thisDuration,
            rendered: thisRendered,
            date: new Date(this._getTime(row.id))
        };
    }.bind(this));
    return entries;
};

/**
 * Sorts the array given in the way indicated by type. Edites the array
 * in-place
 * @param {Array.<SortObject>} entries - The entries to be sorted
 * @param {string} sortType - One of the sort types.
 */
Menu.prototype._sortEntries = function(entries, sortType) {
    // Sort methods in ascending order.
    var sortMethods = {
        alpha: function(a, b) {
            return this._compare(a.name, b.name);
        }.bind(this),
        chrono: function(a, b) {
            return this._compare(a.date.getTime(), b.date.getTime());
        }.bind(this),
        dur: function(a, b) {
            return this._compare(a.duration, b.duration);
        }.bind(this),
        ren: function(a, b) {
            return this._compare(a.rendered, b.rendered);
        }.bind(this)
    };

    var type = sortType.slice(0, -1);
    var dir = sortType.slice(-1);

    entries.sort(sortMethods[type]);
    if (dir == 'D') {
        entries.reverse();
    }
};

/**
 * Sort table entries by type given.
 * @param  {string} sortType - One of 'alpha', 'chrono', 'dur', or 'ren'
 *   with the direction 'D' or 'A' for descending or ascending
 *   appended. Types correspond to alphabetical by name, chronological
 *   by date, ordered by duration length, and ordered by rendered
 *   status.
 */
Menu.prototype.sort = function(sortType) {
    var headers = [
        { type: "alpha", id: "nameHeader", text: "Name" },
        { type: "chrono", id: "dateHeader", text: "Date" },
        { type: "dur", id: "durationHeader", text: "Duration" },
        { type: "ren", id: "renderedHeader", text: "Rendered" }
    ];

    var type = sortType.slice(0, -1);
    var dir = sortType.slice(-1);

    // Set column headers.
    headers.forEach(function(header) {
        var text = header.text;
        if (header.type == type) {
            if (dir == 'A') {
                text = text + ' ' + UP_ARROW;
            } else {
                text = text + ' ' + DOWN_ARROW;
            }
        }
        $('#'+header.id).text(text);
    });

    // Get entries.
    var entries = this._getSortableEntries();

    this._sortEntries(entries, sortType);
    var orderedIds = entries.map(function(entry) {
        return entry.id;
    });

    this.orderList(orderedIds);
};

/**
 * Order entries by array of ids given.
 * @param  {Array.<string>} order - Array of ids dictating the order
 *   the rows should be in.
 */
Menu.prototype.orderList = function(order) {
    var last;
    order.forEach(function(id, i) {
        var entry = $('#replayList #' + id);
        if (i === 0) {
            $('#replayList tBody').prepend(entry);
            last = entry;
        } else {
            $(last).after(entry);
            last = entry;
        }
    });
    $('#replayList tBody').prepend($('#replayList .clone'));
};

/**
 * Add a row to the list.
 * @param {EntryData} entry - The information for the replay to add
 *   to the list.
 * @param {(string|boolean)} [insertAfterId=false] - If a string, then
 *   it should be the id of an existing row. The added row will be
 *   placed after the row with that id. If false, then the row will be
 *   inserted at the top of the table.
 */
Menu.prototype.addRow = function(entry, insertAfterId) {
    if (typeof insertAfterId == "undefined" ) insertAfterId = false;

    // Formats metadata object to put into title text.
    function formatMetaDataTitle(metadata) {
        var title = '';
        title += "Map: " + metadata.map + "\n";
        title += "FPS: " + metadata.fps + "\n";
        title += "Red Team:\n\t" + metadata.redTeam.join('\n\t') + "\n";
        title += "Blue Team:\n\t" + metadata.blueTeam.join('\n\t') + "\n";
        return title;
    }

    var id = entry.id;
    var name = entry.name;
    var date = entry.date;
    var datevalue = date.toDateString() + ' ' + date.toLocaleTimeString().replace(/:.?.? /g, ' ');
    var duration = entry.duration;
    var durationDate = new Date(duration * 1000);
    var durationFormatted = durationDate.getUTCMinutes()+':'+('0'+durationDate.getUTCSeconds()).slice(-2)
    var titleText = formatMetaDataTitle(entry.metadata);
    var rendered = entry.rendered;
    
    if(!insertAfterId) {
        var newRow = $('#replayList .replayRow.clone:first').clone(true);
        newRow.removeClass('clone');

        newRow.data("replay", id);
        newRow.attr("id", id);
        // Set playback link text
        newRow.find('a.playback-link').text(name);
        //newRow.find('a.playback-link').data('preview', thisPreview);
        newRow.find('a.playback-link').popover({
            html: true,
            trigger: 'hover',
            placement : 'right',
            content: this._entry_Preview()
        });
        if (rendered) {
            newRow.find('.rendered-check').text('✓');
        } else {
            newRow.find('.download-movie-button').prop('disabled', true);
        }
        newRow.find('.replay-date').text(datevalue);
        newRow.find('.duration').text(durationFormatted);
        newRow[0].title = titleText;
        $('#replayList tbody').prepend(newRow);
    
        // Set replay row element click handlers.
        // Set handler for in-browser-preview link.
        $('#' + id + ' .playback-link')
            .click(this._entry_Play());

        // Set handler for movie download button.
        $('#' + id + ' .download-movie-button')
            .click(this._entry_Download());

        // Set handler for rename button.
        $('#' + id + ' .rename-button')
            .click(this._entry_Rename());

        // Set handler for checkbox.
        $('#' + id + ' .selected-checkbox')
            .click(this._entry_Check());
    } else {
        var oldRow = $('#'+insertionPoint);
        oldRow.find('.rendered-check').text('');
        oldRow.find('.download-movie-button').prop('disabled', true);
        oldRow.find('.duration').text(durationFormatted);
    }
};

/**
 * Remove the replay for corresponding to the given id.
 * @param  {string} id The id of the replay to remove the row for.
 */
Menu.prototype.removeRow = function(id) {
    $('#' + id).remove();
};

/**
 * Remove the rows corresponding to the replays with the given ids.
 * @param  {Array.<string>} ids [description]
 */
Menu.prototype.removeRows = function(ids) {
    ids.forEach(function(id) {
        this.removeRow(id);
    }, this);
};

/**
 * Change the visible name text of a replay with the given id.
 * @param  {string} id      The id of the replay to change the name of.
 * @param  {string} name The new name of the replay.
 * @return {}         [description]
 */
Menu.prototype.renameEntry = function(id, name) {
    var row = $('#' + id);
    // Change row name.
    $('#' + id + ' .playback-link').text(this._getName(name));
    // Replay name<>id
    row.data("replay", name);
    row[0].id = name;
};

/**
 * Retrieve all current table entries.
 * @return {Array.<DOMElement>} - jQuery object containing elements
 */
Menu.prototype.getEntries = function() {
  return $('#replayList .replayRow').not('.clone').toArray();
};

/**
 * Retrieve currently checked table entries.
 * @return {Array.<string>} - The replay ids corresponding to the
 *   checked rows.
 */
Menu.prototype.getCheckedEntries = function() {
    var checkedEntries = [];
    var menu = this;
    $('.selected-checkbox').each(function () {
        if (this.checked) {
            checkedEntries.push(menu._getReplayId(this));
        }
    });
    return checkedEntries;
};

/**
 * Shows the menu.
 */
Menu.prototype.open = function() {
    if ($('#menuContainer').length) {
        this._list_Update();
        $('#menuContainer').modal('show');
    }
};

/**
 * Set form titles for input controls on settings window.
 */
Menu.prototype._setSettingsFormTitles = function() {
    fpsTitle = 'Use this to set how many times per second data are recorded from the tagpro game.\n' +
    'Higher fps will create smoother replays.\n\nIf you experience framerate drops during gameplay,' +
    'or if your replays are sped up, try reducing this value.';
    $('#fpsTxt').prop('title', fpsTitle);
    $('#fpsInput').prop('title', fpsTitle);

    durationTitle = 'Use this to set how long the replay will be in seconds. Values greater than 60 ' +
    'seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect' +
    'replays that have already been recorded';
    $('#durationText').prop('title', durationTitle);
    $('#durationInput').prop('title', durationTitle);

    recordTitle = 'This controls whether the extension is capable of recording replays during a tagpro game.\n\n' +
    'Uncheck to disable the extension.';
    $('#recordTxt').prop('title', recordTitle);
    $('#recordCheckbox').prop('title', recordTitle);

    useTextureTitle = 'This controls whether custom texture files will be used in rendered movies.\n\n' +
    'Check to use textures, uncheck to use vanilla.\n\nThis only applies to rendered movies.';
    $('#useTextureTxt').prop('title', useTextureTitle);
    $('#useTextureCheckbox').prop('title', useTextureTitle);

    textureMenuButtonTitle = 'This button allows you to upload your custom texture files';
    $('#textureMenuButton').prop('title', textureMenuButtonTitle);

    recordKeyTitle = 'This allows you to designate a key that acts exactly like clicking ' +
    'the record button with the mouse.\n\nDon\'t use keys that have other uses in the ' +
    'game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all, ' +
    'because the extension will listen for that key even if you are typing in chat.';
    $('#recordKeyTxt').prop('title', recordKeyTitle);
    $('#recordKeyCheckbox').prop('title', recordKeyTitle);

    useSplatsTitle = 'This toggles whether to show splats or not.\n\nCheck the box if you ' +
    'want to show splats in the replay';
    $('#useSplatsTxt').prop('title', useSplatsTitle);
    $('#useSplatsCheckbox').prop('title', useSplatsTitle);
    
    canvasWidthAndHeightTitle = 'Set the width and height of the .webm movie file. The default is 1280 by 800, ' +
    'but set it to 1280 by 720 for true 720p resolution';
    $('#canvasWidthInput').prop('title', canvasWidthAndHeightTitle);
    $('#canvasHeightInput').prop('title', canvasWidthAndHeightTitle);
};

/**
 * Get replay id for row, given an element in it.
 * @param  {HTMLElement} elt
 * @return {string} - The id of the replay corresponding to the row.
 */
Menu.prototype._getReplayId = function(elt) {
    var replayRow = $(elt).closest('tr');
    return replayRow.data("replay");
};

Menu.prototype._generatePreview = function(id, callback) {
    function requestPreview(data, options, textures) {
        var preview = drawPreview(data, options, textures);
        callback(preview);
    }

    // First call that completes changes this to true, the next call
    // to run sees that the other values were retrieved and executes
    // the function above.
    var retrieved = false;

    var data, options, textures;
    // Get Replay data.
    chrome.runtime.sendMessage({
        method: "requestData",
        id: id
    }, function(response) {
        data = JSON.parse(response.data);
        if (retrieved) {
            requestPreview(data, options, textures);
        } else {
            retrieved = true;
        }
    });
    // Get options and textures.
    chrome.storage.local.get(["options", "default_textures"], function(items) {
        options = items.options;
        getTextureImages(items.default_textures, function(textureImages) {
            textures = textureImages;
            if (retrieved) {
                requestPreview(data, options, textures);
            } else {
                retrieved = true;
            }
        });
    });
};

/**
 * Initialize listeners for events from background page and changes
 * to google storage.
 */
Menu.prototype._initListeners = function() {
    /**
     * Listen for new replay to be added to list.
     */
    messageListener("replayAdded",
    function(message, sender, sendResponse) {
        var name = message.name;
        var metadata = JSON.parse(message.metadata);
        // Construct entry to use in addRow.
        var entry = {
            name: this._getName(name),
            id: name,
            rendered: false, // Can't be rendered if just added.
            date: new Date(this._getTime(name)),
            duration: metadata.duration,
            metadata: metadata
        };
        // Remove any existing rows with the same id (for overwrites).
        this.removeRow(entry.id);
        // Add to list.
        this.addRow(entry);
        // Re-sort list.
        this.sort(readCookie('sortMethod'));
    }.bind(this));

    /**
     * Listen for replays to have been deleted.
     */
    messageListener("dataDeleted",
    function(message, sender, sendResponse) {
        console.log('Replays have been deleted.');
        var deletedFiles = message.deletedFiles;
        if (typeof deletedFiles == "string") {
            this.removeRow(deletedFiles)
        } else {
            this.removeRows(deletedFiles);
        }
    }.bind(this));

    messageListener("replayRenamed",
    function(message, sender, sendResponse) {
        console.log('Received confirmation of replay rename from background script.');
        this.renameEntry(message.id, message.name);
        this.sort(readCookie('sortMethod'));
    }.bind(this));

    messageListener("movieDownloadFailure",
    function(message, sender, sendResponse) {
        alert('Download failed. Most likely you haven\'t rendered that movie yet.')
    });

    messageListener("progressBarCreate",
    function(message, sender, sendResponse) {
        
        $('#' + message.name + ' .rendered-check').html('<progress class="progressbar">')
    });

    /**
     * Notification that a replay is in the process of being rendered.
     * Create/update progress bar and ensure editing functionality for
     * the specific replay is disabled.
     */
    messageListener("replayRendering",
    function(message, sender, sendResponse) {
        console.log('Received notice that ' + message.name + ' is being rendered.');
        // Update UI for rendering mode.
        if (this.listInitialized && !$('#' + message.name).data('rendering')) {
            $('#' + message.name).data('rendering', true);
            // Disable renaming buttons for all replays.
            $('.rename-button').prop('disabled', true);
            $('#deleteSelectedButton').prop('disabled', true);
            $('#renderSelectedButton').prop('disabled', true);

            $('#' + message.name + ' .rendered-check').html('<progress class="progressbar">');
            // TODO: Disable editing buttons on in-page-previewer.
        }

        if ($('#' + message.name).data('rendering')) {
            $('#' + message.name + ' .progressbar')[0].value = message.progress;
        }
    }.bind(this));

    /**
     * Alerts the menu that a new replay has been rendered. The UI is
     * updated with the result of the rendering.
     * message has properties failure and name.
     */
    messageListener("replayRendered",
    function(message, sender, sendResponse) {
        $('#' + message.name + ' .progressbar').remove();
        $('#' + message.name).removeData('rendering');

        // Reset general UI.
        $('.rename-button').prop('disabled', false);
        $('#deleteSelectedButton').prop('disabled', false);
        $('#renderSelectedButton').prop('disabled', false);
        if (message.failure) {
            console.log('Rendering of ' + message.name + ' was a failure.');
            $('#' + message.name + ' .rendered-check').text('✘');
            $('#' + message.name + ' .rendered-check').css('color', 'red');
        } else {
            $('#' + message.name + ' .rendered-check').text('✓');
            $('#' + message.name + ' .download-movie-button').prop('disabled', false);
            $('#' + message.name + ' .rename-button').prop('disabled', false);
        }
    });

    /**
     * Received after a requested rendering is completed. Only send
     * back to the tab containing the menu that requested the initial
     * rendering.
     */
    messageListener("renderConfirmation",
    function(message, sender, sendResponse) {
        var replaysLeft = message.replaysLeft;
        if (replaysLeft.length !== 0) {
            replaysLeft.forEach(function(replay) {
                $('#' + replay + ' .rendered-check').text('Queued...');
                $('#' + replay + ' .rendered-check').css('color', 'green');
            });
            chrome.runtime.sendMessage({
                method: 'render',
                data: replaysLeft
            });
            console.log('Sent request to render replay: ' + replaysLeft[0]);
        }
    });
};

})(window, document);

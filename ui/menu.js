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
    var url = chrome.extension.getURL("ui/menu.html");

    // Retrieve html of menu.
    $('#tpr-container').load(url, this._init.bind(this));
    
    // Initialize viewer for replay preview.
    this.viewer = new Viewer();

    this._initState();
};

// Make menu class accessible.
window.Menu = Menu;

/**
 * Carry out initialization. Should be called after (or in response to)
 * the loading of the html for the menu.
 */
Menu.prototype._init = function() {
    $("#menuContainer").hide();
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

    // Functions to display alerts to user.
    this.alert = {
        show: function(name, msg, type) {
            var existing = $("#alert-messages ." + name);
            if (existing.length > 0) {
                this.hide(name);
            }
            $("<div>")
                .addClass("alert " + type + " " + name)
                .text(msg)
                .appendTo($("#alert-messages"));
        },
        log: function (name, msg) {
            this.show(name, msg, "alert-info");
        },
        warn: function (name, msg) {
            this.show(name, msg, "alert-warning");
        },
        error: function (name, msg) {
            this.show(name, msg, "alert-danger");
        },
        win: function (name, msg) {
            this.show(name, msg, "alert-success");
        },
        hide: function (name) {
            $("#alert-messages ." + name).remove();
        }
    };

    // Run initialization for other parts of the menu.
    this._initListeners();
    this._initSettings();
    this._initReplayList();
};

/**
 * Initialize the state of the menu.
 */
Menu.prototype._initState = function() {
    // Takes a condition set and callback to be called when that is
    // met.
    var addStateCallback = function(condition, callback) {
        this.stateCallbacks.push({
            condition: condition,
            callback: callback
        });
    }.bind(this);


    this.stateCallbacks = [];
    this.state = {
        loaded: false,
        rendering: false,
        background: null
    };

    addStateCallback({ background: "rendering", rendering: false, loaded: false }, function() {
        this.alert.warn("render",
            "Background page is still rendering, it may take a moment to load your replays.");
    });

    addStateCallback({ background: "rendering", rendering: false, loaded: true }, function() {
        this.alert.warn("render",
            "Background page is still rendering, some functions will be unavailable until it is complete.");
    });

    addStateCallback({ background: "rendering", rendering: true }, function() {
        this.alert.warn("render",
            "Background page is rendering, some functions will be unavailable until it is complete.");
    });

    addStateCallback({ background: "idle", rendering: false, loaded: true, empty: false }, function() {
        this.alert.hide("render");
        $('.rename-button').prop('disabled', false);
        $('#deleteSelectedButton').prop('disabled', false);
        $('#renderSelectedButton').prop('disabled', false);
        $('#downloadRawButton').prop('disabled', false);
        $(".rendered .download-movie-button").prop('disabled', false);
    });

    addStateCallback({ empty: true }, function() {
        $('#noReplays').show();
        $('#replayList').hide();

        $('#renderSelectedButton').prop('disabled', true);
        $('#deleteSelectedButton').prop('disabled', true);
        $('#downloadRawButton').prop('disabled', true);
        $('#selectAllCheckbox').prop('checked', false);
        $('#selectAllCheckbox').prop('disabled', true);
    });

    addStateCallback({ empty: false }, function() {
        $('#replayList').show();
        $('#noReplays').hide();
        
        $('#selectAllCheckbox').prop('disabled', false);
    });

    addStateCallback({ background: "upgrading" }, function() {
        this.alert.info("upgrade",
            "The background page is doing an extension update, this may take some time.");
    });

    function renderingUI() {
        console.log("Running render UI change.");
        $('.rename-button').prop('disabled', true);
        $('.download-movie-button').prop('disabled', true);
        $('#renderSelectedButton').prop('disabled', true);
        $('#deleteSelectedButton').prop('disabled', true);
        $('#downloadRawButton').prop('disabled', true);
    }

    addStateCallback({ background: "rendering" }, renderingUI);
    addStateCallback({ rendering: true }, renderingUI);
    addStateCallback({ background: "idle", rendering: false }, function() {
        $('.rename-button').prop('disabled', false);
        $('#deleteSelectedButton').prop('disabled', false);
        $('#renderSelectedButton').prop('disabled', false);
    });

    // Listen for background status change.
    onStatusChange(function(status) {
        this.updateState("background", status);
    }.bind(this));

    // Getting initial background page status.
    getStatus(function (err, status) {
        if (err) {
            this.alert.error(err.message);
        } else {
            this.updateState("background", status);
        }
    }.bind(this));
};

/**
 * Initialize state and functionality related to the replay list.
 */
Menu.prototype._initReplayList = function() {
    var menu = this;

    // Buttons that take action on multiple entries.
    $('#renderSelectedButton').click(this._list_Render.bind(this));
    $('#deleteSelectedButton').click(this._list_Delete.bind(this));
    $('#downloadRawButton').click(this._list_RawDownload.bind(this));

    // "Select all" checkbox.
    $("#selectAllCheckbox").change(function() {
        $(".replayRow:not(.clone) .selected-checkbox")
            .prop("checked", this.checked);
    });

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
    $('#raw-upload').attr('accept', '.txt,.json');
    $('#raw-upload').change(this._list_Import());

    // Replay row listeners.
    $("#replayList tbody").on("click", ".playback-link", function() {
        var id = $(this).closest('tr').data("info").id;
        $('#menuContainer').hide();
        menu.viewer.preview(id);
    });
    $("#replayList tbody").on("click", ".download-movie-button", function() {
        var id = $(this).closest('tr').data("info").id;
        console.log('Requesting movie download for replay ' + id + '.');
        sendMessage("downloadMovie", {
            id: id
        });
    });
    $("#replayList tbody").on("click", ".rename-button", function() {
        var replay = $(this).closest('tr').data("info");
        var newName = prompt('How would you like to rename ' + replay.name + '?');
        if (newName !== null && newName !== "") {
            console.log('Requesting rename from ' + replay.name + ' to ' + newName + '.');
            sendMessage("renameReplay", {
                id: replay.id,
                name: newName
            });
        }
    });
    $("#replayList tbody").on("click", ".selected-checkbox", this._entry_Check());

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
        method: 'getReplayList'
    }, function(response) {
        var replays = response.data;
        // Hide loader.
        $('#replaysLoading').hide();
        replays.forEach(function(replay) {
            this.addRow(replay);
        }, this);
        // Sort the replays.
        this.sort(this._getSortType('sortMethod'));
        this.listInitialized = true;
        this.updateState("loaded", true);
    }.bind(this));

    // Initially set list UI in case above request doesn't result in
    // any new rows being added.
    this._list_Update();
};

/**
 * Initialize state related to the settings panel.
 */
Menu.prototype._initSettings = function() {
    $('#settings-title').text('TagPro Replays v' + chrome.runtime.getManifest().version);
    this._setSettingsFormTitles();
    $('#saveSettingsButton').click(this._settings_Save());

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
 * Initialize listeners for events from background page and changes
 * to google storage.
 */
Menu.prototype._initListeners = function() {
    /**
     * Listen for new replay to be added to list.
     */
    messageListener("replayAdded",
    function(message, sender, sendResponse) {
        // Remove any existing rows with the same id (for overwrites).
        this.removeRow(message.id);
        // Add to list.
        this.addRow(message.data);
        // Re-sort list.
        this.sort(readCookie('sortMethod'));
    }.bind(this));

    /**
     * Listen for replays to have been deleted.
     */
    messageListener(["replayDeleted", "replaysDeleted"],
    function(message, sender, sendResponse) {
        console.log('Replays have been deleted.');
        // Normalize id/ids.
        var ids = message.id ? [message.id] : message.ids;
        ids.forEach(function(id) {
            this.removeRow(id);
        }, this);
    }.bind(this));

    messageListener("replayRenamed",
    function(message, sender, sendResponse) {
        console.log('Received confirmation of replay rename from background script.');
        var id = message.id;
        var name = message.name;
        var row = $('#replay-' + id);
        // Change row name.
        $('#replay-' + id + ' .playback-link').text(name);
        // Update replay object.
        var data = row.data("info");
        data.name = name;
        row.data("info", data);
        this.sort(readCookie('sortMethod'));
    }.bind(this));

    /**
     * Notification that a replay is in the process of being rendered.
     * Create/update progress bar and ensure editing functionality for
     * the specific replay is disabled.
     */
    messageListener("replayRendering",
    function(message, sender, sendResponse) {
        console.log('Received notice that ' + message.id + ' is being rendered.');
        // Update UI for rendering mode.
        if (this.listInitialized && !$('#replay-' + message.id).data('rendering')) {
            $('#replay-' + message.id).data('rendering', true);
            $('#replay-' + message.id + ' .rendered-check').html('<progress class="progressbar">');
            // TODO: Disable editing buttons on in-page-previewer.
        }

        if ($('#replay-' + message.id).data('rendering')) {
            $('#replay-' + message.id + ' .progressbar')[0].value = message.progress;
        }
    }.bind(this));

    /**
     * Alerts the menu that a new replay has been rendered. The UI is
     * updated with the result of the rendering.
     * message has properties failure and name.
     */
    messageListener("replayRendered",
    function(message, sender, sendResponse) {
        $('#replay-' + message.id + ' .progressbar').remove();
        $('#replay-' + message.id).removeData('rendering');

        if (message.failure) {
            console.log('Rendering of ' + message.id + ' was a failure.');
            $('#replay-' + message.id + ' .rendered-check').text('✘');
            $('#replay-' + message.id + ' .rendered-check').css('color', 'red');
        } else {
            $("#replay-" + message.id).addClass("rendered");
            $('#replay-' + message.id + ' .rendered-check').text('✓');
            $('#replay-' + message.id + ' .download-movie-button').prop('disabled', false);
        }
    });
};

/**
 * Change in response to menu and background state.
 * @param {string} name - The name of the state variable to change.
 * @param {*} value - The new value of the state variable.
 */
Menu.prototype.updateState = function(name, value) {
    console.log("Updating " + name + " to: " + value + ".");
    this.stateCallbacks.forEach(function(info) {
        var condition = info.condition;
        var fn = info.callback;
        // Make sure updated value is relevant to state change
        // function.
        if (Object.keys(condition).indexOf(name) !== -1) {
            // Make sure current state and new value match.
            for (var prop in condition) {
                var val;
                if (prop === name) {
                    val = value;
                } else {
                    val = this.state[prop];
                }
                if (val !== condition[prop]) {
                    // No match, skip this function.
                    return;
                }
            }
            fn.call(this);
        }
    }, this);
    this.state[name] = value;
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
        var fileData = [];
        var rawFiles = $(this).prop('files');
        var files = [];
        for (var i = 0; i < rawFiles.length; i++) {
            files.push(rawFiles[i]);
        }
        // Ensure all read operations are complete before continuing.
        var fileReadBarrier = new Barrier();
        fileReadBarrier.onComplete(function parseRawData() {
            if (fileData.length === 0) return;

            var info = fileData.pop();

            sendMessage('importReplay', info, function (response) {
                // TODO: Handle failed replay adding.
                // Read next file.
                parseRawData();
            });
        });
        // Read in each of the files.
        files.forEach(function(file) {
            var id = fileReadBarrier.start();
            var fr = new FileReader();
            fr.onload = function(e) {
                fileData.push({
                    data: e.target.result,
                    filename: file.name
                });
                fileReadBarrier.stop(id);
            };
            fr.readAsText(file);
        });
    };
};

/**
 * Function called in response to a list update.
 */
Menu.prototype._list_Update = function() {
    var entries = $('#replayList .replayRow').not('.clone');
    if (entries.length === 0) {
        this.updateState("empty", true);
    } else {
        this.updateState("empty", false);
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
    var menu = this;
    // Render replays in session storage.
    function renderReplays() {
        var ids = JSON.parse(sessionStorage.getItem("render-list"));
        if (ids !== null && ids.length > 0) {
            var id = ids.shift();
            sendMessage("renderReplay", {
                id: id
            }, function() {
                renderReplays();
            });
            $('#replay-' + id + ' .rendered-check').text("Starting...");
            sessionStorage.setItem("render-list", JSON.stringify(ids));
        } else {
            menu.updateState("rendering", false);
        }
    }
    var ids = this.getCheckedEntries();
    if (ids.length > 0) {
        var msg = "You will not be able to edit, view, or record " +
            "replays while rendering. Do not close the browser or " +
            "navigate away from this page until rendering is " +
            "complete. Would you like to continue?";
        if (confirm(msg)) {
            this.updateState("rendering", true);
            // Display queued message on replays.
            ids.forEach(function(replay) {
                $('#replay-' + replay + ' .rendered-check').text('Queued...');
                $('#replay-' + replay + ' .rendered-check')
                    .css('color', 'green');
            });
            // Set replays to be rendered.
            sessionStorage.setItem("render-list", JSON.stringify(ids));
            renderReplays();
        }
    } else {
        alert("You have to select at least 1 replay.");
    }
};

/**
 * Delete checked items on the replay list after confirmation.
 */
Menu.prototype._list_Delete = function() {
    var ids = this.getCheckedEntries();

    if (ids.length > 0) {
        if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
            console.log('Requesting deletion of ' + ids);
            chrome.runtime.sendMessage({
                method: 'deleteReplays',
                ids: ids
            });
        }
    }
};

/**
 * Download raw replay data corresponding to checked items.
 */
Menu.prototype._list_RawDownload = function() {
    var ids = this.getCheckedEntries();
    if (ids.length > 0) {
        console.log('Requesting raw replay download for ' + ids + '.');
        chrome.runtime.sendMessage({
            method: 'downloadReplays',
            ids: ids
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
 * Callback for hover on playback link, which shows a preview for the
 * replay.
 */
Menu.prototype._entry_Preview = function() {
    var menu = this;

    // Replace the loader icon with the preview image.
    function replaceLoaderWithPreview(id, preview) {
        // Cache preview image.
        $('#replay-' + id + ' a.playback-link').data('preview', preview);

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
            var id = menu._getRowInfo(this).id;
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
 * Callback for the save settings button.
 */
Menu.prototype._settings_Save = function() {
    var menu = this;
    return function() {
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
                if (this.settingsListener) {
                    this.settingsListener(options);
                }
                $('#settingsContainer').modal('hide');
            }.bind(this));
        });
    };
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

    function compare(a, b) {
        if (typeof a == 'string' && typeof b == 'string') {
            return a.localeCompare(b);
        } else {
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        }
    }

    // Sort methods in ascending order.
    var sortMethods = {
        alpha: function(a, b) {
            return compare(a.name, b.name);
        },
        chrono: function(a, b) {
            return compare(a.dateRecorded, b.dateRecorded);
        },
        dur: function(a, b) {
            return compare(a.duration, b.duration);
        },
        ren: function(a, b) {
            return compare(a.rendered, b.rendered);
        }
    };

    var type = sortType.slice(0, -1);
    var sortMethod = sortMethods[type];
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
        $('#' + header.id).text(text);
    });

    // Get entries.
    var sorted = $('#replayList .replayRow').not('.clone').sort(function(a, b) {
        var aInfo = $(a).data("info"),
            bInfo = $(b).data("info");
        if (dir === 'A') {
            return sortMethod(aInfo, bInfo);
        } else {
            return sortMethod(bInfo, aInfo);
        }
    });
    $('#replayList tBody').append(sorted);
};

/**
 * Add a row to the list.
 * @param {EntryData} entry - The information for the replay to add
 *   to the list.
 */
Menu.prototype.addRow = function(replay) {
    // Formats metadata object to put into title text.
    function getTitleText(replay) {
        var title = '';
        title += "Map: " + replay.mapName + "\n";
        title += "FPS: " + replay.fps + "\n";
        var red = [];
        var blue = [];
        $.each(replay.players, function(id, player) {
            var name;
            if (id == replay.player) {
                name = player.name + " (*)";
            } else {
                name = player.name;
            }
            if (player.team === 1) {
                red.push(name);
            } else {
                blue.push(name);
            }
        });
        title += replay.teamNames[1] + ":\n\t" + red.join('\n\t') + "\n";
        title += replay.teamNames[2] + ":\n\t" + blue.join('\n\t') + "\n";
        return title;
    }

    var id = replay.id;
    var name = replay.name;
    var date = moment(replay.dateRecorded);
    var duration = moment.utc(replay.duration);
    var titleText = getTitleText(replay);
    var rendered = replay.rendered;
    
    var newRow = $('#replayList .replayRow.clone:first').clone(true);
    newRow.removeClass('clone');

    newRow.data("info", replay);
    newRow.attr("id", "replay-" + id);
    // Set playback link text
    newRow.find('a.playback-link').text(name);
    newRow.find('a.playback-link').popover({
        html: true,
        trigger: 'hover',
        placement : 'right',
        content: this._entry_Preview()
    });
    if (rendered) {
        newRow.addClass('rendered');
        newRow.find('.rendered-check').text('✓');
    } else {
        newRow.find('.download-movie-button').prop('disabled', true);
    }
    newRow.find('.replay-date').text(date.format("ddd MMM D, YYYY h:mm A"));
    newRow.find('.duration').text(duration.format("m:ss"));
    newRow[0].title = titleText;
    $('#replayList tbody').prepend(newRow);
};

/**
 * Remove the replay for corresponding to the given id.
 * @param  {string} id The id of the replay to remove the row for.
 */
Menu.prototype.removeRow = function(id) {
    $('#replay-' + id).remove();
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
            checkedEntries.push(menu._getRowInfo(this).id);
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
Menu.prototype._getRowInfo = function(elt) {
    var replayRow = $(elt).closest('tr');
    return replayRow.data("info");
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
 * @callback SettingsCallback
 * @param {Options} options - The updated options.
 */
/**
 * Add a function to be called when the serrings are updated.
 * @param {Function} fn - The function to be called when the settings
 *   are changed via the menu.
 */
Menu.prototype.addSettingsChangeListener = function(fn) {
    this.settingsListener = fn;
};

})(window, document);

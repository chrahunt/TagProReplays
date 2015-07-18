var moment = require('moment');
var $ = require('jquery');
require('jquery.actual');
require('jquery-ui');
require('bootstrap');
//require('material');
//require('ripples');
//$.material.init();
var DataTable = require('datatables');

var Barrier = require('./barrier');
var Cookies = require('./cookies');
var Messaging = require('./messaging');
var Status = require('./status');
var Textures = require('./textures');
var Viewer = require('./viewer');

/**
 * Holds the interface to the main page user interface.
 * Methods prepended with an underscore are used internally by the
 * Menu.
 * There are two areas of concern in the user interface, settings
 * and the replay list. A method that begins _list_ is a callback
 * for some list-specific action that a user my invoke.
 */

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
        '<div id="tpr-container" class="bootstrap-container jquery-ui-container">');
    var url = chrome.extension.getURL("html/menu.html");

    // Retrieve html of menu.
    $('#tpr-container').load(url, this._init.bind(this));
    
    // Initialize viewer for replay preview.
    this.viewer = new Viewer();

    this._initState();
};

// Make menu class accessible.
module.exports = Menu;

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

    // Menu navigation.
    $(".nav-home").click(function() {
        $(this).addClass("active");
        $(".nav-render").removeClass("active");
        $("#replays").show();
        $("#replay-footer").show();
        $("#rendering").hide();
        $("#render-footer").hide();
    });

    $(".nav-render").click(function() {
        $(this).addClass("active");
        $(".nav-home").removeClass("active");
        $("#rendering").show();
        $("#render-footer").show();
        $("#replays").hide();
        $("#replay-footer").hide();
    });

    // Run initialization for other parts of the menu.
    this._initListeners();
    this._initSettings();
    this._initReplayList();
    this._initRenderList();
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
        background: null
    };

    addStateCallback({ background: "rendering", loaded: false }, function() {
        this.alert.warn("render",
            "Background page is still rendering, it may take a moment to load your replays.");
    });

    addStateCallback({ background: "rendering", loaded: true }, function() {
        this.alert.warn("render",
            "Background page is rendering, some functions will be slower until it is complete.");
    });

    addStateCallback({ background: "idle" }, function() {
        this.alert.hide("render");
    });

    addStateCallback({ background: "upgrading" }, function() {
        this.alert.info("upgrade",
            "The background page is doing an extension update, this may take some time.");
    });

    // Listen for background status change.
    Status.onChanged(function(status) {
        this.updateState("background", status);
    }.bind(this));

    // Getting initial background page status.
    Status.get(function (err, status) {
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
    var x = menu;
    this.selected_replays = [];

    this.replay_table = $("#replay-table").DataTable({
        ajax: function (data, callback, settings) {
            var args = {
                length: data.length,
                sortedBy: data.columns[data.order[0].column].data,
                dir: data.order[0].dir,
                start: data.start
            };
            Messaging.send("getReplayList", args, function (response) {
                var list = response.data.map(function (replay) {
                    return {
                        name: replay.name,
                        date: moment(replay.dateRecorded).format("ddd MMM D, YYYY h:mm A"),
                        duration: moment.utc(replay.duration).format("m:ss"),
                        rendered: replay.rendered,
                        id: replay.id,
                        DT_RowId: "replay-row-" + replay.id,
                        DT_RowData: {
                            id: replay.id
                        }
                    };
                });
                console.log("Response: %o", response);
                callback({
                    data: list,
                    draw: data.draw,
                    recordsTotal: response.total,
                    recordsFiltered: response.filtered
                });
            });
            console.log("Data: %o", data);
            console.log("Settings: %o", settings);
            console.log("Sending list request: %d.", data.draw);
        },
        serverSide: true,
        columns: [
            {
                data: null,
                defaultContent: '<input type="checkbox" class="selected-checkbox">',
                orderable: false
            },
            {
                data: "name",
                render: function (data, type, row, meta) {
                    return '<div class="replay-static"><span class="replay-name">' +
                        data + '</span><div class="replay-name-edit pull-right">' +
                        '<span class="glyphicon glyphicon-pencil"></span></div></div>' +
                        '<div class="replay-edit">' +
                        '<input type="text" class="replay-name-input" value="' + data + '"></div>';
                }
            },
            { data: "rendered" },
            { data: "duration" },
            { data: "date" },
            {
                data: null,
                render: function (data, type, row, meta) {
                    return '<div class="controls">' +
                        '<div class="row-download-json"><span class="glyphicon glyphicon-save"></span></div>' +
                        '<div class="row-download-movie"><span class="glyphicon glyphicon-save"></span></div>' +
                        '<div class="row-preview"><span class="glyphicon glyphicon-film"></span></div>' +
                        '<div class="row-delete"><span class="glyphicon glyphicon-trash"></span></div>' +
                        '</div>';
                },
                orderable: false
            }
        ],
        dom: '<"header">rtlip',
        searching: false,
        order: [[1, 'asc']],
        rowCallback: function (row, data) {
            if (menu.selected_replays.indexOf(data.id) !== -1) {
                $(row).addClass('selected')
                    .find('.selected-checkbox')
                    .prop('checked', true);
            }
        },
        drawCallback: function (settings) {
            updateWhenChecked();
        }
    });

    // Track selected rows across all pages.
    $("#replay-table tbody").on("change", ".selected-checkbox", function () {
        var replayId = $(this).closest("tr").data("id");
        if (this.checked) {
            menu.selected_replays.push(replayId);
        } else {
            var idx = menu.selected_replays.indexOf(replayId);
            menu.selected_replays.splice(idx, 1);
        }
    });    

    // Selection behavior.
    $("#replay-table tbody").on("click", ".selected-checkbox", function (evt) {
        var elt = $(this);
        var numChecked = $("#replay-table .selected-checkbox:checked").length;
        var tr = elt.closest("tr");
        if (elt.prop('checked')) {
            tr.addClass('selected');
            if (evt.shiftKey && numChecked > 1) {
                var boxes = $("#replay-table .selected-checkbox"),
                    closestBox,
                    thisBox;
                for (var i = 0; i < boxes.length; i++) {
                    if (this == boxes[i]) {
                        thisBox = i;
                        if (closestBox) break;
                        continue;
                    }
                    if (boxes[i].checked) closestBox = i;
                    if (thisBox && closestBox) break;
                }
                var bounds = [closestBox, thisBox].sort(function(a, b){
                    return a - b;
                });
                boxes.slice(bounds[0], bounds[1]).each(function (i) {
                    this.checked = true;
                    $(this).closest("tr").addClass('selected');
                });
            }
        } else {
            tr.removeClass('selected');
        }
        updateWhenChecked();
    });

    // Update table when entry is checked.
    function updateWhenChecked() {
        var numChecked = $("#replay-table .selected-checkbox:checked").length;
        if (numChecked > 0) {
            $("#replays .table-header").addClass("actions");
            if (numChecked === 1) {
                $("#replays .table-header .text").text(numChecked + " replay selected");
            } else {
                $("#replays .table-header .text").text(numChecked + " replays selected");
            }
            $("#replays .table-header .controls").css({ display: "inline-block" });
        } else {
            // Normal header content.
            $("#replays .table-header").removeClass("actions");
            $("#replays .table-header .text").text("Replays");
            $("#replays .table-header .controls").css({ display: "none" });
        }
    }
    
    // Buttons that take action on multiple entries.
    $('#replays .table-header .controls .render').click(this._list_Render.bind(this));
    $('#replays .table-header .controls .delete').click(this._list_Delete.bind(this));
    $('#replays .table-header .controls .download-raw').click(this._list_RawDownload.bind(this));

    // "Select all" checkbox.
    /*$("#replays .select-all").change(function() {
        $(".replayRow:not(.clone) .selected-checkbox")
            .prop("checked", this.checked);
        if (this.checked) {
            $("#replay-footer .selected-action").prop("disabled", false);
        } else {
            $("#replay-footer .selected-action").prop("disabled", true);
        }
    });*/

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
    $("#replay-table tbody").on("click", ".row-preview", function() {
        var id = $(this).closest('tr').data("id");
        $('#menuContainer').hide();
        menu.viewer.preview(id);
    });

    $("#replay-table tbody").on("click", ".row-download-movie", function() {
        var id = $(this).closest('tr').data("id");
        console.log('Requesting movie download for replay ' + id + '.');
        Messaging.send("downloadMovie", {
            id: id
        });
    });

    $("#replay-table tbody").on("click", ".replay-name-edit", function() {
        var tr = $(this).closest('tr');
        var id = tr.data("id");
        tr.find(".replay-static").hide();
        var input_container = tr.find(".replay-edit");
        input_container.show();
        var input = input_container.find(".replay-name-input");

        function isValid(text) {
            return text !== "";
        }

        function save(id, text) {
            console.log("Renaming replay %d to %s.", id, text);
            Messaging.send("renameReplay", {
                id: id,
                name: text
            });
        }

        function enter(evt) {
            // Enter key.
            if (evt.which === 13) {
                var text = $(this).val();
                if (isValid(text)) {
                    var id = $(this).closest("tr").data("id");
                    save(id, text);
                    // TODO: Saving feedback?
                    dismiss();
                } else {
                    // Show invalid error.
                }
            }
        }

        function dismiss() {
            tr.find(".replay-static").show();
            input_container.hide();
            input.off("keypress", enter);
            input.off("blur", dismiss);
        }
        input.keypress(enter);
        input.blur(dismiss);
        input.focus(function () {
            this.selectionStart = 0;
            this.selectionEnd = this.value.length;
        });
        input.focus();
    });
    /*
    // Initialize listener for list modifications.
    var target = $('#replays .section-list tbody')[0];
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
    Messaging.send("getReplayList", function(response) {
        var replays = response.data;
        // Hide loader.
        $('#replays .section-loading').hide();
        var rendering = {};
        replays.forEach(function(replay) {
            if (!replay.rendering) {
                menu.addRow(replay);
            } else {
                rendering[replay.id] = replay;
            }
        });
        // Sort the replays.
        menu.sort(menu._getSortType('sortMethod'));
        // Get the order of renders and make render rows.
        Messaging.send("getRenderList", function(response) {
            $('#rendering .section-loading').hide();
            var list = response.data;
            var renders = list.map(function(id) {
                return rendering[id];
            }).filter(function(replay) {
                return !!replay;
            });
            renders.forEach(function(replay) {
                menu.addRenderRow(replay);
            });
            menu.listInitialized = true;
            menu.updateState("loaded", true);
        });
    });

    // Initially set list UI in case above request doesn't result in
    // any new rows being added.
    this._list_Update();
    */
};

Menu.prototype._initRenderList = function() {
    var self = this;

    // "Select all" checkbox.
    $("#rendering .select-all").change(function() {
        $(".render-row:not(.clone) .selected-checkbox")
            .prop("checked", this.checked);
        if (this.checked) {
            $("#render-footer .selected-action").prop("disabled", false);
        } else {
            $("#render-footer .selected-action").prop("disabled", true);
        }
    });

    // Single cancellation buttons.
    $("#rendering .section-list tbody").on("click", ".cancel-render-button", function() {
        var id = $(this).closest('tr').data("info").id;
        console.log('Requesting render cancellation for replay ' + id + '.');
        Messaging.send("cancelRender", {
            id: id
        });
    });

    // Multi-cancellation buttons.
    $('#cancel-selected-button').click(function() {
        var ids = self.getCheckedEntries("render");
        if (ids.length > 0) {
            Messaging.send("cancelRenders", {
                ids: ids
            });
        } else {
            alert("You have to select at least 1 render.");
        }
    });

    $("#rendering .section-list tbody").on("click", ".selected-checkbox", this._entry_Check("render"));
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
        Textures.saveSettings();
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
    Messaging.listen("replayAdded",
    function(message, sender, sendResponse) {
        this.replay_table.ajax.reload();
    }.bind(this));

    /**
     * Listen for replays to have been deleted.
     */
    Messaging.listen(["replayDeleted", "replaysDeleted"],
    function(message, sender, sendResponse) {
        console.log('Replays have been deleted.');
        this.replay_table.ajax.reload();
    }.bind(this));

    Messaging.listen("replayRenamed",
    function(message, sender, sendResponse) {
        console.log('Received confirmation of replay rename from background script.');
        this.replay_table.ajax.reload();
    }.bind(this));

    /**
     * Notification that replays have been set to render.
     * @param {object} message - with property `ids` which is an array
     *   of integer ids.
     */
    Messaging.listen("replayRenderAdded",
    function (message, sender, sendResponse) {
        var ids = message.ids;
        ids.map(function(id) {
            return $("#replay-" + id).data("info");
        }).filter(function(replay) {
            return !!replay;
        }).forEach(function(replay) {
            replay.rendering = true;
            this.removeRow(replay.id);
            this.addRenderRow(replay);
        }, this);
    }.bind(this));

    /**
     * Notification that rendering has been cancelled for replays.
     */
    Messaging.listen("replayRenderCancelled",
    function (message, sender, sendResponse) {
        var ids = message.ids;
        // TODO: Set render status as being cancelled on page?
        ids.map(function(id) {
            return $("#render-" + id).data("info");
        }).filter(function(replay) {
            return !!replay;
        }).forEach(function(replay) {
            replay.rendering = false;
            this.removeRenderRow(replay.id);
            this.addRow(replay);
        }, this);
    }.bind(this));

    /**
     * Notification that a replay is in the process of being rendered.
     * Create/update progress bar and ensure editing functionality for
     * the specific replay is disabled.
     */
    Messaging.listen("replayRenderProgress",
    function(message, sender, sendResponse) {
        var id = message.id;
        console.log('Received notice that ' + id + ' is being rendered.');
        // Ensure that menu is loaded and check if this replay is still in replay list.
        if (this.listInitialized) {
            // Ensure that replay row is made into render row.
            if ($('#replay-' + id).length > 0) {
                var replay = $("#replay-" + id).data("info");
                replay.rendering = true;
                this.removeRow(id);
                this.addRenderRow(replay);
            }
            $("#render-" + id + " .render-status").text("Rendering...");
            // TODO: Add progress bar.
            $("#render-" + id + " .render-progress").html("<div class='progress'>" +
                "<div class='progress-bar'></div></div>");
        }

        // TODO: Better progress bar.
        // TODO: Estimated time remaining.
        if ($('#render-' + id).length > 0) {
            $('#render-' + id + ' .progress-bar').css("width", (message.progress * 100) + "%");
        }
    }.bind(this));

    /**
     * Alerts the menu that a new replay has been rendered. The UI is
     * updated with the result of the rendering.
     * message has properties failure and name.
     */
    Messaging.listen("replayRenderCompleted",
    function(message, sender, sendResponse) {
        var id = message.id;
        console.log("Received notice that replay " + id + " has finished rendering.");
        var replay = $("#render-" + id).data("info");
        replay.rendered = true;
        replay.rendering = false;
        this.removeRenderRow(id);
        this.addRow(replay);
        
        if (message.failure) {
            console.log('Rendering of ' + message.id + ' was a failure.');
            $('#replay-' + message.id + ' .rendered-check').text('✘');
            $('#replay-' + message.id + ' .rendered-check').css('color', 'red');
        } else {
            $("#replay-" + message.id).addClass("rendered");
            $('#replay-' + message.id + ' .rendered-check').text('✓');
            $('#replay-' + message.id + ' .download-movie-button').prop('disabled', false);
        }
    }.bind(this));
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
                if (Array.isArray(condition[prop]) && condition[prop].indexOf(val) === -1) {
                    // No match for array condition.
                    return;
                } else if (val !== condition[prop]) {
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

            Messaging.send('importReplay', info, function (response) {
                // TODO: Handle failed replay adding.
                if (response.failed) {
                    console.error("Failed to import replay %s.", info.filename);
                } else {
                    // Read next file.
                    parseRawData();
                }
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
    var replayEntries = $('#replays .section-list .replayRow').not('.clone');
    $(".nav-home .badge").text(replayEntries.length);
    if (replayEntries.length === 0) {
        $('#replays .section-empty').show();
        $('#replays .section-list').hide();
        $('#replays .select-all').prop("disabled", true);
        $('#replay-footer .selected-action').prop("disabled", true);
    } else {
        $('#replays .section-list').show();
        $('#replays .section-empty').hide();
        $('#replays .select-all').prop("disabled", false);
    }

    var renderEntries = $('#rendering .section-list .render-row').not('.clone');
    $(".nav-render .badge").text(renderEntries.length);
    if (renderEntries.length === 0) {
        $('#rendering .section-empty').show();
        $('#rendering .section-list').hide();
        $('#rendering .select-all').prop("disabled", true);
        $("#render-footer .selected-action").prop("disabled", true);
    } else {
        $('#rendering .section-list').show();
        $('#rendering .section-empty').hide();
        $('#rendering .select-all').prop("disabled", false);
    }

    // TODO: Force to use the current panel.
    // Updating.
    $('#replays .section-list').height('auto');
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
        $('#replays .section-list').height(newHeight);
        // Fix table header width.
        $('#replay-headers').width($('#replays .section-list table').actual('width'));
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

    var ids = this.getCheckedEntries("replay");
    if (ids.length > 0) {
        Messaging.send("renderReplays", {
            ids: ids
        }, function(response) {
            // TODO: Handle error adding replays to queue.
            // TODO: Move replays to rendering list.
        });
    } else {
        alert("You have to select at least 1 replay.");
    }
};

/**
 * Delete checked items on the replay list after confirmation.
 */
Menu.prototype._list_Delete = function() {
    var ids = this.getCheckedEntries("replay");

    if (ids.length > 0) {
        if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
            console.log('Requesting deletion of ' + ids);
            Messaging.send("deleteReplays", {
                ids: ids
            });
        }
    }
};

/**
 * Download raw replay data corresponding to checked items.
 */
Menu.prototype._list_RawDownload = function() {
    var ids = this.getCheckedEntries("replay");
    if (ids.length > 0) {
        console.log('Requesting raw replay download for ' + ids + '.');
        Messaging.send("downloadReplays", {
            ids: ids
        });
    }
};

/**
 * Returns callback for entry checkboxes to support the shift-click
 * multi-select behavior. Also updates buttons that are related to
 * selected replays/renders to be enabled/disabled.
 * @param {string} scope - One of "replay" or "render" to limit effects to
 *   one or the other panel.
 * @return {Function} - The function to be used as a callback on entry
 *   checkboxes.
 */
Menu.prototype._entry_Check = function(scope) {
    var rowSelector = scope === "replay" ? ".replayRow" : ".render-row";
    var footerSelector = scope === "replay" ? "#replay-footer" : "#render-footer";
    return function(e) {
        var boxesChecked = $(rowSelector + ':not(.clone) .selected-checkbox:checked').length;
        if(this.checked && e.shiftKey && boxesChecked > 1) {
            var boxes = $(rowSelector + ':not(.clone) .selected-checkbox'),
                closestBox,
                thisBox;
            for(var i = 0; i < boxes.length; i++) {
                if ( this == boxes[i] ) { 
                    thisBox = i; 
                    if (closestBox) break;
                    continue;
                }
                if (boxes[i].checked) closestBox = i;
                if ( thisBox && closestBox ) break;
            }
            var bounds = [closestBox, thisBox].sort(function(a, b){
                return a - b;
            });
            boxes.map(function(num, box) { 
                if(num > bounds[0] && num < bounds[1]) box.checked = true;
            });
            $(footerSelector + " .selected-action").prop("disabled", false);
        } else if (boxesChecked > 0) {
            $(footerSelector + " .selected-action").prop("disabled", false);
        } else if (boxesChecked === 0) {
            $(footerSelector + " .selected-action").prop("disabled", true);
        }
    };
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
                Messaging.send("cleanRenderedReplays");
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
    
    var newRow = $('#replays .section-list .replayRow.clone:first').clone(true);
    newRow.removeClass('clone');

    newRow.data("info", replay);
    newRow.attr("id", "replay-" + id);
    // Set playback link text
    newRow.find('a.playback-link').text(name);
    if (rendered) {
        newRow.addClass('rendered');
        newRow.find('.rendered-check').text('✓');
    } else {
        newRow.find('.download-movie-button').prop('disabled', true);
    }
    newRow.find('.replay-date').text(date.format("ddd MMM D, YYYY h:mm A"));
    newRow.find('.duration').text(duration.format("m:ss"));
    newRow[0].title = titleText;
    $('#replays .section-list tbody').append(newRow);
};

/**
 * Remove the replay for corresponding to the given id.
 * @param  {string} id The id of the replay to remove the row for.
 */
Menu.prototype.removeRow = function(id) {
    $('#replay-' + id).remove();
};

/**
 * Add a replay as being rendered.
 * @param {ReplayInfo} replay - The info for the replay that is being
 *   rendered.
 */
Menu.prototype.addRenderRow = function(replay) {
    var id = replay.id;
    var name = replay.name;
    var date = moment(replay.dateRecorded);
    
    var newRow = $('#rendering .section-list .render-row.clone:first').clone(true);
    newRow.removeClass('clone');

    newRow.data("info", replay);
    newRow.attr("id", "render-" + id);
    // Set name text.
    newRow.find('.render-name').text(name);
    newRow.find('.render-date').text(date.format("ddd MMM D, YYYY h:mm A"));
    newRow.find('.render-status').text("Queued..."); // Default status.
    $('#rendering .section-list tbody').prepend(newRow);
};

Menu.prototype.removeRenderRow = function(id) {
    $('#render-' + id).remove();
};

/**
 * Retrieve currently checked table entries.
 * @param {string} type - The type of checkboxes to get, either
 *   "replay" or "render".
 * @return {Array.<string>} - The replay ids corresponding to the
 *   checked rows.
 */
Menu.prototype.getCheckedEntries = function(type) {
    var checkedEntries = [];
    var menu = this;
    var scope = type === "replay" ? "#replays" : "#rendering";
    $(scope + ' .selected-checkbox').each(function () {
        if (this.checked) {
            checkedEntries.push(menu._getRowInfo(this));
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
    return replayRow.data("id");
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

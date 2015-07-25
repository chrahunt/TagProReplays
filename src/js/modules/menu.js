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
var Table = require('./table');

// Moment calendar customization.
moment.locale('en', {
    calendar: {
        lastDay: '[Yesterday at] LT',
        sameDay: 'LT',
        nextDay: '[Tomorrow at] LT',
        lastWeek: 'lll',
        nextWeek: 'lll',
        sameElse: 'lll'
    }
});

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
 * Shows the menu.
 */
Menu.prototype.open = function() {
    if ($('#menuContainer').length) {
        //this._list_Update();
        $('#menuContainer').modal('show');
        this.replay_table.table.columns.adjust();
        this.render_table.table.columns.adjust();
    }
};

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
        $("#rendering").hide();
        $("#render-footer").hide();
    });

    $(".nav-render").click(function() {
        $(this).addClass("active");
        $(".nav-home").removeClass("active");
        $("#rendering").show();
        $("#render-footer").show();
        $("#replays").hide();
    });

    // Replay import.
    // Visible link invokes the actual file input.
    $('#replay-import').click(function (e) {
        // Empty file input so change listener is invoked even if same
        // file is selected.
        $('#raw-upload').val('');
        $('#raw-upload').click();
        e.preventDefault();
    });
    $('#raw-upload').attr('accept', '.txt,.json');
    $('#raw-upload').prop('multiple', true);
    $('#raw-upload').change(this._list_Import());

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

    // Given replay info, generate title text for rows.
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

    this.replay_table = new Table({
        id: "replay-table",
        header: {
            selector: "#replays .card-header",
            singular: "replay",
            plural: "replays",
            title: "Replays"
        },
        update: function (data, callback) {
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
                        date: moment(replay.dateRecorded),
                        duration: moment.utc(replay.duration).format('mm:ss'),
                        rendered: replay.rendered,
                        id: replay.id,
                        rendering: replay.rendering,
                        DT_RowData: {
                            id: replay.id
                        },
                        replay: replay
                    };
                });
                $(".nav-home .badge").text(response.total);
                callback({
                    data: list,
                    draw: data.draw,
                    recordsTotal: response.total,
                    recordsFiltered: response.filtered
                });
            });
        },
        columns: [
            {
                data: "rendering",
                render: function (data, type, row, meta) {
                    if (data) {
                        return '<span class="glyphicon glyphicon-lock" title="This replay is rendering"></span>';
                    } else {
                        return Table.checkbox;
                    }
                },
                orderable: false,
                width: "24px",
                className: "cb-cell"
            },
            {
                data: "name",
                render: function (data, type, row, meta) {
                    if (row.rendering) {
                        return data;
                    } else {
                        return '<div class="replay-static"><span class="replay-name">' +
                            data + '</span><span class="replay-name-edit pull-right">' +
                            '<i class="material-icons">edit</i></span></div>' +
                            '<div class="replay-edit">' +
                            '<input type="text" class="replay-name-input" value="' + data + '"></div>';
                    }
                },
                className: "row-name fixed-cell"
                // width set via css.
            },
            {
                data: "rendered",
                orderable: false,
                render: function (data) {
                    return data ? '&#10003;' : '';
                },
                width: "65px",
                className: "data-cell"
            },
            {
                data: "duration",
                width: "60px",
                className: "data-cell"
            },
            {
                data: "date",
                width: "180px",
                className: "data-cell",
                render: function (date) {
                    return date.calendar();
                }
            },
            {
                data: null,
                render: function (data, type, row, meta) {
                    return '<div class="controls">' +
                        '<div class="row-download-movie"><span class="glyphicon glyphicon-save"></span></div>' +
                        '<div class="row-preview"><span class="glyphicon glyphicon-film"></span></div>' +
                        '</div>';
                },
                orderable: false,
                width: "60px"
            }
        ],
        order: [[1, 'asc']],
        rowCallback: function (row, data) {
            row.title = getTitleText(data.replay);
        }
    });

    // Buttons that take action on multiple entries.
    $('#replays .card-header .actions .render').click(this._list_Render.bind(this));
    $('#replays .card-header .actions .delete').click(this._list_Delete.bind(this));
    $('#replays .card-header .actions .download-raw').click(this._list_RawDownload.bind(this));

    // Replay row listeners.
    $("#replay-table tbody").on("click", ".row-preview", function() {
        var id = $(this).closest('tr').data("id");
        $('#menuContainer').hide();
        menu.viewer.preview(id);
    });

    // Row movie download.
    $("#replay-table tbody").on("click", ".row-download-movie", function() {
        var id = $(this).closest('tr').data("id");
        console.log('Requesting movie download for replay ' + id + '.');
        Messaging.send("downloadMovie", {
            id: id
        });
    });

    // Row name editing.
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

    // Re-set menu dimensions on window resize.
    $(window).resize(function () {
        menu.replay_table.recalcMaxHeight();
    });
    //$(window).resize(this._setListWidth);

    // Get the order of renders and make render rows.
    /*Messaging.send("getRenderList", function(response) {
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

    // Initially set list UI in case above request doesn't result in
    // any new rows being added.
    this._list_Update();
    */
};

Menu.prototype._initRenderList = function() {
    var self = this;

    this.render_table = new Table({
        id: "render-table",
        header: {
            selector: "#rendering .card-header",
            singular: "task",
            plural: "tasks",
            title: "Render Tasks"
        },
        update: function (data, callback) {
            var args = {
                length: data.length,
                dir: data.order[0].dir,
                start: data.start
            };

            Messaging.send("getRenderList", args, function (response) {
                var list = response.data.map(function (task) {
                    return {
                        name: task.data.name,
                        date: moment(task.data.date).format("ddd MMM D, YYYY h:mm A"),
                        // Task id.
                        id: task.id,
                        DT_RowData: {
                            // Replay id.
                            id: task.replay_id
                        },
                        DT_RowId: "render-" + task.replay_id
                    };
                });
                $(".nav-render .badge").text(response.total);
                console.log("got render list: " + response.total);
                callback({
                    data: list,
                    draw: data.draw,
                    recordsTotal: response.total,
                    recordsFiltered: response.filtered
                });
            });
        },
        columns: [
            {
                data: null,
                defaultContent: Table.checkbox,
                className: 'cb-cell',
                orderable: false
            },
            {
                data: "id",
                visible: false
            },
            {
                data: "name",
                orderable: false
            },
            {
                data: "date",
                orderable: false
            },
            {
                data: null,
                defaultContent: '<span class="render-status">Queued</span>',
                orderable: false
            },
            { // Progress indicator.
                data: null,
                defaultContent: '<div class="render-progress"></div>',
                orderable: false
            },
            {
                data: null,
                defaultContent: '<span class="glyphicon glyphicon-trash"></span>',
                orderable: false
            }
        ],
        order: [[1, 'asc']]
    });

    // Single cancellation buttons.
    $("#rendering .section-list tbody").on("click", ".cancel-render-button", function() {
        var id = $(this).closest('tr').data("id");
        console.log('Requesting render cancellation for replay ' + id + '.');
        Messaging.send("cancelRender", {
            id: id
        });
    });

    // Multi-cancellation buttons.
    $('#rendering .card-header .actions .cancel').click(function() {
        var ids = self.render_table.selected();
        self.render_table.deselect(ids);
        if (ids.length > 0) {
            Messaging.send("cancelRenders", {
                ids: ids
            });
        } else {
            console.warn("At least 1 task must be selected to cancel.");
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
        this.replay_table.reload();
    }.bind(this));

    /**
     * Listen for replays to have been deleted.
     */
    Messaging.listen(["replayDeleted", "replaysDeleted"],
    function(message, sender, sendResponse) {
        console.log('Replays have been deleted.');
        this.replay_table.reload();
    }.bind(this));

    Messaging.listen("replayRenamed",
    function(message, sender, sendResponse) {
        console.log('Received confirmation of replay rename from background script.');
        this.replay_table.reload();
    }.bind(this));

    /**
     * Notification that replays have been set to render.
     * @param {object} message - with property `ids` which is an array
     *   of integer ids.
     */
    Messaging.listen("replayRenderAdded",
    function (message, sender, sendResponse) {
        this.replay_table.reload();
        this.render_table.reload();
    }.bind(this));

    /**
     * Notification that rendering has been cancelled for replays.
     */
    Messaging.listen("replayRenderCancelled",
    function (message, sender, sendResponse) {
        this.replay_table.reload();
        this.render_table.reload();
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
        // Check that render row exists.
        var row = $("#render-" + id);
        // TODO: Better progress bar.
        // TODO: Estimated time remaining.
        if (row.length === 1) {
            var rendering = row.data("rendering");
            if (!rendering) {
                row.find(".render-status").text("Rendering...");
                row.find(".render-progress").html("<div class='progress'>" +
                    "<div class='progress-bar'></div></div>");
                row.data("rendering", true);
            }
            $('#render-' + id + ' .progress-bar').css("width", (message.progress * 100) + "%");
        } // else render table not yet set up.
    }.bind(this));

    /**
     * Alerts the menu that a new replay has been rendered. The UI is
     * updated with the result of the rendering.
     * message has properties failure and name.
     */
    Messaging.listen("replayRenderCompleted",
    function(message, sender, sendResponse) {
        this.replay_table.reload();
        this.render_table.reload();
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
    this._setListWidth();
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

    var ids = this.replay_table.selected();
    this.replay_table.deselect(ids);
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
    var ids = this.replay_table.selected();
    this.replay_table.deselect(ids);

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
    var ids = this.replay_table.selected();
    if (ids.length > 0) {
        console.log('Requesting raw replay download for ' + ids + '.');
        Messaging.send("downloadReplays", {
            ids: ids
        });
    }
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
    function keyListener(e) {
        currentRecordKey = e.which;
        $('#recordKeyChooserInput').text(String.fromCharCode(e.which));
        $('#recordKeyChooserInput').data('record', true);
        $('#record-key-remove').show();
        stopInputting();
    }

    function stopInputting() {
        $('#record-key-input-container').removeClass('focused');
        $(document).off("keypress", keyListener);
    }

    $('#record-key-input-container').click(function (e) {
        $(this).addClass('focused');
        $(document).on("keypress", keyListener);
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

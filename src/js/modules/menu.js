var concat = require('concat-stream');
var DataTable = require('datatables');
var moment = require('moment');
var $ = require('jquery');
require('jquery.actual');
require('jquery-ui');
require('bootstrap');
//require('material');
//require('ripples');
//$.material.init();

var AsyncLoop = require('./async-loop');
var Cookies = require('./cookies');
var FileListStream = require('./html5-filelist-stream');
var Messaging = require('./messaging');
var ReplayImportStream = require('./replay-import-stream');
var Status = require('./status');
var Table = require('./table');
var Textures = require('./textures');
var Viewer = require('./viewer');

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

function Overlay() {

}

Overlay.prototype.show = function() {
    $(".modal-overlay").removeClass("hidden");
};

Overlay.prototype.hide = function() {
    $(".modal-overlay").addClass("hidden");
};

// Progress from 0 to 100
Overlay.prototype.progress = function(n) {
    // body...
};

// Message to display.
Overlay.prototype.message = function(msg) {
    $(".modal-overlay .message").html(msg);
};

Overlay.prototype.title = function(str) {
    $(".modal-overlay .title").text(str);
};

Overlay.prototype.actions = function(lst) {
    $(".modal-overlay .actions").html("");
    lst.forEach(function (action) {
        $(".modal-overlay .actions").append(action);
    });
};

/**
 * Holds the interface to the main page user interface.
 * Methods prepended with an underscore are used internally by the
 * Menu.
 * There are two areas of concern in the user interface, settings
 * and the replay list. A method that begins _list_ is a callback
 * for some list-specific action that a user my invoke.
 */

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
    $('#tpr-container').load(url, this.init.bind(this));
    
    // Initialize viewer for replay preview.
    this.viewer = new Viewer();
    this.overlay = new Overlay();
};

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
 * @private
 */
Menu.prototype.init = function() {
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
 * Initialize state and functionality related to the replay list.
 */
Menu.prototype._initReplayList = function() {
    var self = this;

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
                    return data ? '<i class="material-icons">done</i>' : '';
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
                data: "rendered",
                render: function (data, type, row, meta) {
                    var disabled = !data;
                    var content = '<div class="actions">';
                    if (disabled) {
                        content += '<div class="row-download-movie disabled" title="render replay first!"><i class="material-icons">file_download</i></div>';
                    } else {
                        content += '<div class="row-download-movie" title="download movie"><i class="material-icons">file_download</i></div>';
                    }
                    content += '<div class="row-preview" title="preview"><i class="material-icons">play_arrow</i></div>' +
                        '</div>';
                    return content;
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
        self.viewer.preview(id);
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
        self.replay_table.recalcMaxHeight();
    });
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
                        date: moment(task.data.date),
                        id: task.replay_id,
                        DT_RowData: {
                            // Replay id.
                            id: task.replay_id
                        },
                        DT_RowId: "render-" + task.replay_id
                    };
                });
                $(".nav-render .badge").text(response.total);
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
                orderable: false,
                width: "24px"
            },
            {
                data: "id",
                visible: false
            },
            {
                data: "name",
                orderable: false,
                className: "fixed-cell",
                width: "100%"
            },
            {
                data: "date",
                orderable: false,
                className: "data-cell",
                width: "180px",
                render: function (date) {
                    return date.calendar();
                }
            },
            {
                data: null,
                defaultContent: '<span class="render-status">Queued</span>',
                orderable: false,
                className: "data-cell",
                width: "50px"
            },
            { // Progress indicator.
                data: null,
                defaultContent: '<div class="render-progress"></div>',
                orderable: false,
                className: "data-cell",
                width: "100px"
            },
            {
                data: null,
                defaultContent: '<div class="actions"><div class="cancel-render"><i class="material-icons">cancel</i></div></div>',
                orderable: false,
                width: "50px"
            }
        ],
        order: [[1, 'asc']]
    });

    // Single cancellation buttons.
    $("#render-table tbody").on("click", ".cancel-render", function() {
        var id = $(this).closest('tr').data("id");
        self.render_table.deselect(id);
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
    var self = this;

    Messaging.listen(["replayUpdated", "replaysUpdated"],
    function () {
        if (!self.paused) {
            self.replay_table.reload();
        }
    });

    Messaging.listen(["renderUpdated", "rendersUpdated"],
    function () {
        if (!self.paused) {
            self.replay_table.reload();
            self.render_table.reload();
        }
    });

    /**
     * Notification that a replay is in the process of being rendered.
     * Create/update progress bar and ensure editing functionality for
     * the specific replay is disabled.
     */
    Messaging.listen("replayRenderProgress",
    function(message, sender) {
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
    });

    // Import interface management.
    self.importing = {
        errors: [],
        finished: 0,
        total: 0,
        thisMenu: false,
        cancelButtonSet: false,
        cancel: null,
        cancelled: false
    };

    // Update import progress on overlay.
    function updateImport() {
        var text = "Replay " + self.importing.finished + " of " + self.importing.total + ".";
        self.overlay.message(text);
        if (self.importing.errors.length > 0) {
            // TODO: Reflect import errors information by changing overlay style.
            //console.log("There were some importing errors.");
        }
        if (!self.importing.cancelButtonSet && self.importing.thisMenu) {
            self.importing.cancelButtonSet = true;
            var cancel = $("<button>cancel</button>");
            cancel.click(function () {
                if (self.importing.cancel) {
                    self.importing.cancel();
                }
            });
            self.overlay.actions([cancel]);
        }
    }

    Messaging.listen("importProgress",
    function () {
        if (self.importing.cancelled) return;
        console.log("Received import progress.");
        self.importing.finished++;
        updateImport();
    });

    Messaging.listen("importError",
    function (message) {
        if (self.importing.cancelled) return;
        self.importing.errors.push(message);
        self.importing.finished++;
        updateImport();
    });

    function makeTextFile(text) {
        var b = new Blob([text], { type: "text/plain" });
        return URL.createObjectURL(b);
    }

    // Initialize import overlay.
    Status.on("importing", function (old) {
        self.paused = true;
        self.overlay.show();
        self.overlay.title("Importing Replays...");
        updateImport();
    });
    function resetImport() {
        self.importing.finished = 0;
        self.importing.errors = [];
        self.importing.thisMenu = false;
        self.importing.total = 0;
        self.importing.cancel = null;
        self.importing.cancelButtonSet = false;
        self.importing.cancelled = false;
    }

    // Reset overlay, show error if needed.
    Status.on("importing->idle", function () {
        self.paused = false;
        if (self.importing.thisMenu) {
            if (self.importing.cancelled) {
                self.overlay.title("Import cancelled");
            } else {
                self.overlay.title("Replays Imported!");
            }
            if (self.importing.errors.length > 0) {
                // Gather errors into text file.
                var text = self.importing.errors.map(function (err) {
                    return err.name + " - " + err.reason;
                }).reduce(function (text, msg) {
                    return text + "\n" + msg;
                });
                var url = makeTextFile(text);
                self.overlay.message("There were some errors. You can download them " + 
                    "<a href=\"" + url + "\" download=\"import-errors.txt\">here</a>. Once downloaded, send them " +
                    "via the error reporting information you can find in \"Help\" in the menu.");
                self.importing.errors = [];
            } else {
                if (self.importing.cancelled) {
                    self.overlay.message("Replay import cancelled. Only " +
                        self.importing.finished + " of " + self.importing.total +
                        " replays processed.");
                } else {
                    self.overlay.message("All replays imported successfully.");
                }
            }
            var dismiss = $("<button>dismiss</button>");
            dismiss.click(function () {
                self.overlay.hide();
            });
            self.overlay.actions([dismiss]);
            resetImport();
        } else {
            console.log("This was not the importing menu.");
            self.overlay.hide();
            resetImport();
        }
    });

    Messaging.listen("alert",
    function (message, sender) {
        self.alert(message);
    });

    Status.on("idle", function () {
        self.replay_table.reload();
    });

    // Display json downloading message.
    Status.on("json_downloading", function () {

    });

    // Display finish message.
    Status.on("json_downloading->idle", function () {

    });

    ///////////////
    // Upgrading //
    ///////////////

    // Update import progress on overlay.
    function updateUpgrade() {
        var text = "Replay " + self.importing.finished + " of " + self.importing.total + ".";
        self.overlay.message(text);
        if (self.importing.errors.length > 0) {
            // TODO: Reflect import errors information by changing overlay style.
            //console.log("There were some importing errors.");
        }
        if (!self.importing.cancelButtonSet && self.importing.thisMenu) {
            self.importing.cancelButtonSet = true;
            var cancel = $("<button>cancel</button>");
            cancel.click(function () {
                if (self.importing.cancel) {
                    self.importing.cancel();
                }
            });
            self.overlay.actions([cancel]);
        }
    }

    // Display upgrading page with progress.
    Status.on("upgrading", function () {

    });

    // Display upgrading result page.
    Status.on("upgrading->idle", function () {

    });

    // Display error overlay.
    Status.on("upgrade_error", function () {
        self.overlay.title("Upgrade error");
        self.overlay.message("error upgrading database, pls report.");
        self.overlay.show();
    });

    Messaging.listen("upgradeProgress",
    function (message) {
        var progress = message.progress;
        var total = message.total;

    });

    // Display error overlay.
    Status.on("db_error", function () {

    });
    Status.force();
};

Menu.prototype.alert = function(opts) {
    if (!opts.hide) {
        if (opts.blocking) {
            $("#replays .card-header").addClass("hidden");
        }
        $("#replays .header-alert").removeClass("hidden");
        var msg = opts.message;
        if (msg) {
            $("#replays .header-alert .message").text(msg);
        }
    } else {
        if (opts.blocking) {
            $("#replays .card-header").removeClass("hidden");
        }
        $("#replays .header-alert").addClass("hidden");
    }
};

/**
 * Returns a function to be set as a listener on the replay import
 * button.
 * @private
 * @return {Function} - The function to be set as a listener on the
 *   replay import button.
 */
Menu.prototype._list_Import = function() {
    var menu = this;

    return function () {
        var files = $(this).prop('files');
        if (files.length === 0) return;
        var mb = 25;
        var sizeLimit = 1024 * 1024 * mb;
        /*files = files.filter(function (file) {
            if (file.size > sizeLimit) {
                menu.importing.errors.push({
                    name: file.name,
                    reason: "file too big, max file size is " + mb + "MB."
                });
                menu.importing.finished++;
                return false;
            } else {
                return true;
            }
        });*/
        menu.importing.thisMenu = true;
        menu.importing.total = files.length;
        Messaging.send("startImport", function (result) {
            if (!result.failed) {
                menu.paused = true;
                console.group("Importing %d replays.", files.length);
                console.time("Replay import");
                var fls = FileListStream(files);
                var send = ReplayImportStream({
                    highWaterMark: sizeLimit
                });
                fls.pipe(send);
                // For cancelling import streams.
                menu.importing.cancel = function () {
                    fls.unpipe();
                    send.stop();
                    menu.importing.cancelled = true;
                    Messaging.send("cancelImport");
                };
                send.on('finish', function () {
                    console.timeEnd("Replay import");
                    console.groupEnd();
                    if (!menu.importing.cancelled) {
                        Messaging.send("endImport");
                    }
                });
                fls.on("end", function () {
                    console.log("File list stream ended.");
                });
            }
        });
    };
};

/**
 * Render checked items on the replay list.
 * @private
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
        });
    } else {
        alert("You have to select at least 1 replay.");
    }
};

/**
 * Delete checked items on the replay list after confirmation.
 * @private
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
 * @private
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

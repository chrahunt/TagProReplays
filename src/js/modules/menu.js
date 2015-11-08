var concat = require('concat-stream');
var DataTable = require('datatables');
var moment = require('moment');
var Mprogress = require('mprogress');
var $ = require('jquery');
require('jquery.actual');
require('jquery-ui');
require('bootstrap');
//require('material');
//require('ripples');
//$.material.init();

var FileListStream = require('./html5-filelist-stream');
var Messaging = require('./messaging');
var ReplayImportStream = require('./replay-import-stream');
var Status = require('./status');
var Table = require('./table');
var Textures = require('./textures');
var Viewer = require('./viewer');

// Moment calendar customization for date display.
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

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

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

    // Takes selector for nav item and panel.
    function togglePanel(nav, panel) {
        $(".nav-item:not(" + nav + ")").removeClass("active");
        $(nav).addClass("active");
        $(panel).show();
        $(".section-panel:not(" + panel + ")").hide();
    }
    // Menu navigation.
    $(".nav-home").click(function() {
        togglePanel(".nav-home", "#replays");
    });

    $(".nav-render").click(function() {
        togglePanel(".nav-render", "#rendering");
    });

    $(".nav-failed").click(function() {
        togglePanel(".nav-failed", "#failed-replays");
    });

    this.overlay = new Overlay("#menuContainer .modal-overlay");

    // Run initialization for other parts of the menu.
    this._initUpgrade();
    this._initSettings();
    this._initReplayList();
    this._initRenderList();
    this._initImport();
    this._initFailedReplayList();
    Status.force();
};

/**
 * Initialize UI listeners and background page message handlers for
 * replay file import.
 */
Menu.prototype._initImport = function() {
    var self = this;

    // Importing state.
    var initialState = {
        errors: [],
        finished: 0,
        total: 0,
        thisMenu: false,
        cancel: null,
        cancelled: false
    };

    var state = clone(initialState);

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
    $('#raw-upload').change(function () {
        var files = $(this).prop('files');
        if (files.length === 0) return;
        var mb = 25;
        var sizeLimit = 1024 * 1024 * mb;
        // File size filter.
        /*files = files.filter(function (file) {
            if (file.size > sizeLimit) {
                self.importing.errors.push({
                    name: file.name,
                    reason: "file too big, max file size is " + mb + "MB."
                });
                self.importing.finished++;
                return false;
            } else {
                return true;
            }
        });*/
        state.thisMenu = true;
        state.total = files.length;
        Messaging.send("startImport", function (result) {
            if (!result.failed) {
                self.paused = true;
                console.group("Importing %d replays.", files.length);
                console.time("Replay import");
                var fls = FileListStream(files);
                var send = ReplayImportStream({
                    highWaterMark: sizeLimit
                });
                fls.pipe(send);
                // For cancelling import streams.
                state.cancel = function () {
                    fls.unpipe();
                    send.stop();
                    state.cancelled = true;
                    Messaging.send("cancelImport");
                };
                send.on('finish', function () {
                    console.timeEnd("Replay import");
                    console.groupEnd();
                    if (!state.cancelled) {
                        Messaging.send("endImport");
                    }
                });
                fls.on("end", function () {
                    console.log("File list stream ended.");
                });
            }
        });
    });

    // Update overlay with import progress.
    function updateOverlay() {
        var update = {};
        if (state.thisMenu) {
            update.message = "On replay " + state.finished + " of " + state.total + ".";
            update.progress = state.finished / state.total;
        } else {
            update.message = "Replay " + state.finished + " imported.";
        }
        
        // TODO: Reflect import errors information by changing overlay style/message
        if (state.errors.length > 0) {
            //console.log("There were some importing errors.");
        }
        self.overlay.update(update);
    }

    Messaging.listen("importProgress",
    function () {
        if (state.cancelled) return;
        console.log("Received import progress.");
        state.finished++;
        updateOverlay();
    });

    Messaging.listen("importError",
    function (message) {
        if (state.cancelled) return;
        state.errors.push(message);
        state.finished++;
        updateOverlay();
    });

    // Initialize import overlay.
    Status.on("importing", function (old) {
        self.paused = true;
        var options = {
            title: "Replay Import",
            progress: true,
            actions: [{
                text: "cancel",
                action: function() {
                    if (state.cancel) {
                        state.cancel();
                    }
                }
            }]
        };
        if (state.thisMenu) {
            options.description = "Importing your replays, don't navigate away from this page until the process is complete!";
        } else {
            options.description = "Importing your replays in another tab.";
        }
        self.overlay.set(options);
        self.overlay.show();
        updateOverlay();
    });

    // Given text, return a file URL.
    function makeTextFile(text) {
        var b = new Blob([text], { type: "text/plain" });
        return URL.createObjectURL(b);
    }

    // Reset overlay, show error if needed.
    Status.on("importing->idle", function () {
        self.paused = false;
        if (state.thisMenu) {
            var update = {
                progress: false
            };
            update.description = state.cancelled ? "Import cancelled"
                                                 : "Replays Imported!";
            if (state.errors.length > 0) {
                // Gather errors into text file.
                var text = state.errors.map(function (err) {
                    return err.name + " - " + err.reason;
                }).reduce(function (text, msg) {
                    return text + "\n" + msg;
                });
                var url = makeTextFile(text);
                update.message = "There were some errors. You can download them " + 
                    "<a href=\"" + url + "\" download=\"import-errors.txt\">here</a>. Once downloaded, send them " +
                    "via the error reporting information you can find in \"Help\" in the menu.";
            } else {
                if (state.cancelled) {
                    update.message = "Replay import cancelled. Only " +
                        state.finished + " of " + state.total +
                        " replays processed.";
                } else {
                    update.message = "All replays imported successfully.";
                }
            }
            update.actions = [{
                text: "dismiss",
                action: function() {
                    self.overlay.hide();
                }
            }];
            self.overlay.update(update);
            state = clone(initialState);
        } else {
            console.log("This was not the importing menu.");
            self.overlay.hide();
            state = clone(initialState);
        }
    });
};

/**
 * Initialize upgrade-handling behavior and database error display.
 */
Menu.prototype._initUpgrade = function() {
    var self = this;

    // Display upgrading page with progress.
    Status.on("upgrading", function () {
        self.overlay.set({
            title: "Upgrading Database",
            description: "The database is being upgraded, please do not close Chrome while this is being carried out.",
            progress: true,
            message: "Initializing..."
        });
        self.overlay.show();
    });

    // Display upgrading result page.
    Status.on("upgrading->idle", function () {
        self.overlay.update({
            description: "The database has been upgraded!",
            actions: [{
                text: "dismiss",
                action: function () {
                    self.overlay.hide();
                }
            }]
        });
    });

    function getContact(error, subject) {
        var man = chrome.runtime.getManifest();
        var ver = man.hasOwnProperty("version_name") ? man.version_name
                                                     : man.version;
        var github = "<a href=\"https://github.com/chrahunt/TagProReplays/issues\">here</a>";
        var reddit = "<a href=\"https://www.reddit.com/message/compose?to=snaps_&subject=" +
            encodeURIComponent(subject + " (" + ver + ")") + "\">here</a>";
        var contact = error + ", please report the error " + github + " and include the version number " + ver + " or send a message " +
            reddit + " with any details and for further instruction.";
        return contact;
    }
    // Display error overlay.
    Status.on("upgrade_error", function () {
        self.overlay.set({
            title: "Database Upgrade Error",
            progress: false,
            message: getContact("Error upgrading database", "TPR Upgrade Error")
        });
        // In case it isn't showing already.
        self.overlay.show();
    });

    Messaging.listen("upgradeProgress",
    function (message) {
        self.overlay.update({
            progress: message.progress / message.total,
            message: "Converted replay " + message.progress + " of " + message.total
        });
    });

    // Display error overlay.
    Status.on("db_error", function () {
        self.overlay.set({
            title: "Database Error",
            description: getContact("A database error was encountered, please try to enable/disable the extension and see if the issue persists. If it continues", "TPR Database Error"),
            progress: false
        });
        // In case it isn't showing already.
        self.overlay.show();
    });
};

/**
 * Sets up panel and table for replays.
 * @private
 */
Menu.prototype._initReplayList = function() {
    var self = this;

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
            { // Checkbox.
                className: "cb-cell",
                data: "rendering",
                orderable: false,
                render: function (data, type, row, meta) {
                    return data ? '<span class="glyphicon glyphicon-lock" title="This replay is rendering"></span>'
                                : Table.checkbox;
                },
                width: "24px"
            },
            { // Name.
                className: "row-name fixed-cell",
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
                }
                // 'width' set via css.
            },
            { // Rendered.
                className: "data-cell",
                data: "rendered",
                orderable: false,
                render: function (data) {
                    return data ? '<i class="material-icons">done</i>'
                                : '';
                },
                width: "65px",
            },
            { // Duration.
                className: "data-cell",
                data: "duration",
                width: "60px"
            },
            { // Date recorded.
                className: "data-cell",
                data: "date",
                render: function (date) {
                    return date.calendar();
                },
                width: "180px"
            },
            { // Controls.
                data: "rendered",
                orderable: false,
                render: function (data, type, row, meta) {
                    var disabled = !data;
                    var content = '<div class="actions">';
                    // download
                    content += disabled ? '<div class="row-download-movie disabled" title="render replay first!">'
                                        : '<div class="row-download-movie" title="download movie">';
                    content += '<i class="material-icons">file_download</i></div>';
                    // preview
                    content += '<div class="row-preview" title="preview"><i class="material-icons">play_arrow</i></div>';
                    content += '</div>';
                    return content;
                },
                width: "60px"
            }
        ],
        order: [[1, 'asc']],
        // Set title text on row with additional replay information.
        rowCallback: function (row, data) {
            var replay = data.replay;
            var title = '';
            title += "Map: " + replay.mapName + "\n";
            title += "FPS: " + replay.fps + "\n";
            var red = [];
            var blue = [];
            $.each(replay.players, function(id, player) {
                var name = id === replay.player ? player.name + " (*)"
                                                : player.name;
                if (player.team === 1) {
                    red.push(name);
                } else {
                    blue.push(name);
                }
            });
            title += replay.teamNames[1] + ":\n\t" + red.join('\n\t') + "\n";
            title += replay.teamNames[2] + ":\n\t" + blue.join('\n\t') + "\n";
            row.title = title;
        }
    });

    // Table header controls.
    // Rendering replays.
    $('#replays .card-header .actions .render').click(function () {
        var ids = self.replay_table.selected();
        self.replay_table.deselect(ids);
        if (ids.length > 0) {
            Messaging.send("renderReplays", {
                ids: ids
            }, function(response) {
                // TODO: Handle error adding replays to queue.
            });
        } else {
            alert("You have to select at least 1 replay.");
        }
    });

    // Deleting replays.
    $('#replays .card-header .actions .delete').click(function () {
        var ids = self.replay_table.selected();
        self.replay_table.deselect(ids);

        if (ids.length > 0) {
            if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
                console.log('Requesting deletion of ' + ids);
                Messaging.send("deleteReplays", {
                    ids: ids
                });
            }
        }
    });

    // Downloading raw replays.
    $('#replays .card-header .actions .download-raw').click(function () {
        var ids = self.replay_table.selected();
        if (ids.length > 0) {
            console.log('Requesting raw replay download for ' + ids + '.');
            Messaging.send("downloadReplays", { ids: ids }, function (response) {
                if (response.failed) {
                    alert("Download failed: " + response.reason);
                }
            });
        }
    });

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
                if (text !== "") {
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

        // Listen for enter key to
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

    Status.on("idle", function () {
        self.replay_table.reload();
    });

    // Listen for updates.
    Messaging.listen(["replayUpdated", "replaysUpdated", "renderUpdated", "rendersUpdated"],
    function () {
        if (!self.paused) {
            self.replay_table.reload();
        }
    });

    // Download information.
    var download = {
        error: null
    };

    Messaging.listen("zipProgress",
    function (message) {
        self.overlay.update({
            progress: message.current / message.total,
            message: "Adding replay " + message.current + " of " + message.total + "."
        });
    });

    Messaging.listen("intermediateZipDownload",
    function () {
        self.overlay.update({
            message: "Zip file reached capacity, downloading..."
        });
    });

    Messaging.listen("finalZipDownload",
    function () {
        self.overlay.update({
            message: "Downloading final zip file..."
        });
    });

    Messaging.listen("downloadError",
    function (message) {
        download.error = message.reason;
    });

    // Display json downloading message.
    Status.on("json_downloading", function () {
        self.overlay.set({
            title: 'Downloading Raw Data',
            description: 'Zip files are being generated containing your raw data.',
            message: 'Initializing zip file generation...',
            progress: true
        });
        self.overlay.show();
    });

    // Display finish message.
    Status.on("json_downloading->idle", function () {
        var error = download.error;
        download.error = null;
        if (error) {
            var reason = error;
            // Change overlay to display error.
            // add dismiss
            self.overlay.set({
                description: "There was an error downloading your replays: " + error + ".",
                actions: [{
                    text: "dismiss",
                    action: function () {
                        self.overlay.hide();
                    }
                }]
            });
        } else {
            self.overlay.hide();
        }
    });
};

/**
 * Sets up panel and table for failed replays, ones that were unable to
 * be upgraded. Removes nav item and panel if none exist.
 * @private
 */
Menu.prototype._initFailedReplayList = function() {
    var self = this;

    // Init table.
    this.failed_replay_table = new Table({
        id: "failed-replay-table",
        header: {
            selector: "#failed-replays .card-header",
            singular: "failed replay",
            plural: "failed replays",
            title: "Failed Replays"
        },
        update: function (data, callback) {
            var args = {
                length: data.length,
                start: data.start
            };
            Messaging.send("getFailedReplayList", args, function (response) {
                var list = response.data.map(function (info) {
                    return {
                        id: info.id,
                        name: info.name,
                        DT_RowData: {
                            id: info.id
                        }
                    };
                });
                if (response.total === 0) {
                    // Remove table.
                    self.failed_replay_table.table.destroy(true);
                } else {
                    $(".nav-failed .badge").text(response.total);
                    callback({
                        data: list,
                        draw: data.draw,
                        recordsTotal: response.total,
                        recordsFiltered: response.filtered
                    });
                }
            });
        },
        columns: [
            { // checkbox
                className: 'cb-cell',
                data: null,
                defaultContent: Table.checkbox,
                orderable: false,
                width: "24px"
            },
            { // id, hidden
                data: "id",
                visible: false
            },
            { // name
                className: "fixed-cell",
                data: "name",
                orderable: false,
                width: "100%"
            }
        ],
        // Order by id.
        order: [[1, 'asc']]
    });

    // Download listener.
    $('#failed-replays .card-header .actions .download').click(function () {
        var ids = self.failed_replay_table.selected();
        if (ids.length > 0) {
            console.log('Requesting raw json download for ' + ids + '.');
            Messaging.send("downloadFailedReplays", {
                ids: ids
            }, function (response) {
                if (response.failed) {
                    alert("Failed replay download failed: " + response.reason);
                }
            });
        }
    });

    $('#failed-replays .card-header .actions .delete').click(function () {
        var ids = self.failed_replay_table.selected();
        self.failed_replay_table.deselect(ids);

        if (ids.length > 0) {
            if (confirm('Are you sure you want to delete these failed replays? This cannot be undone.')) {
                console.log('Requesting deletion of ' + ids);
                Messaging.send("deleteFailedReplays", {
                    ids: ids
                });
            }
        }
    });

    function update() {
        self.failed_replay_table.reload();
    }
    Status.on("idle", update);

    // Clean up after table gets destroyed.
    this.failed_replay_table.table.on("destroy", function () {
        Status.removeListener("idle", update);
        if ($(".nav-failed").hasClass("active")) {
            $(".nav-home").click();
        }
        // Remove nav.
        $(".nav-failed").remove();
    });

    Messaging.listen("failedReplaysUpdated", function () {
        self.failed_replay_table.reload();
    });

    // Download-relevant listeners.
    var download = {
        error: null
    };

    Messaging.listen("failed.zipProgress",
    function (message) {
        self.overlay.update({
            progress: message.current / message.total,
            message: "Adding failed replay " + message.current + " of " + message.total + "."
        });
    });

    Messaging.listen("failed.intermediateZipDownload",
    function () {
        self.overlay.update({
            message: "Zip file reached capacity, downloading..."
        });
    });

    Messaging.listen("failed.finalZipDownload",
    function () {
        self.overlay.update({
            message: "Downloading final zip file..."
        });
    });

    var downloadError = false;
    Messaging.listen("failed.downloadError",
    function (message) {
        download.error = message.reason;
    });

    // Display json downloading message.
    Status.on("failed.json_downloading", function () {
        self.overlay.set({
            title: 'Downloading Raw Data',
            description: 'Zip files are being generated containing the data from your failed replays.',
            message: 'Initializing zip file generation...',
            progress: true
        });
        self.overlay.show();
    });

    // Display finish message.
    Status.on("failed.json_downloading->idle", function () {
        var error = download.error;
        download.error = null;
        if (error) {
            var reason = error;
            // Change overlay to display error.
            // add dismiss
            self.overlay.set({
                description: "There was an error downloading your replays: " + error + ".",
                message: "",
                actions: [{
                    text: "dismiss",
                    action: function () {
                        self.overlay.hide();
                    }
                }]
            });
        } else {
            self.overlay.set({
                description: "Your failed replays will be downloading shortly (depending on file size). " +
                    "There is either an error with the replay itself or something unexpected was encountered. " +
                    "If you send me a message through one of the options on the Help menu, we can get it figured out!",
                message: "",
                actions: [{
                    text: "dismiss",
                    action: function () {
                        self.overlay.hide();
                    }
                }]
            });
        }
    });
};

/**
 * Sets up panel and table for rendering list.
 * @private
 */
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
            { // Checkbox.
                className: "cb-cell",
                data: null,
                defaultContent: Table.checkbox,
                orderable: false,
                width: "24px"
            },
            { // id, hidden
                data: "id",
                visible: false
            },
            { // name
                className: "fixed-cell",
                data: "name",
                orderable: false,
                width: "100%"
            },
            { // date recorded
                className: "data-cell",
                data: "date",
                orderable: false,
                render: function (date) { return date.calendar(); },
                width: "180px"
            },
            { // status
                className: "data-cell",
                data: null,
                defaultContent: '<span class="render-status">Queued</span>',
                orderable: false,
                width: "50px"
            },
            { // Progress indicator.
                className: "data-cell",
                data: null,
                defaultContent: '<div class="render-progress"></div>',
                orderable: false,
                width: "100px"
            },
            { // Action buttons.
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

    Status.on("idle", function () {
        self.render_table.reload();
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

    Messaging.listen(["renderUpdated", "rendersUpdated"],
    function () {
        self.render_table.reload();
    });
};

/**
 * Initialize state related to the settings panel and texture selector.
 */
Menu.prototype._initSettings = function() {
    var self = this;
    // Set header.
    $('#settings-title').text('TagPro Replays v' + chrome.runtime.getManifest().version);

    // Set form titles.
    var titles = [{ // fps
        elts: ["#fpsTxt", "#fpsInput"],
        text: 'Use this to set how many times per second data are recorded from the tagpro game.\n' +
    'Higher fps will create smoother replays.\n\nIf you experience framerate drops during gameplay,' +
    'or if your replays are sped up, try reducing this value.'
    }, { // duration
        elts: ["#durationText", "#durationInput"],
        text: 'Use this to set how long the replay will be in seconds. Values greater than 60 ' +
    'seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect' +
    'replays that have already been recorded'
    }, { // record
        elts: ["#recordTxt", "#recordCheckbox"],
        text: 'This controls whether the extension is capable of recording replays during a tagpro game.\n\n' +
    'Uncheck to disable the extension.'
    }, { // custom textures
        elts: ["#useTextureTxt", "#useTextureCheckbox"],
        text: 'This controls whether custom texture files will be used in rendered movies.\n\n' +
    'Check to use textures, uncheck to use vanilla.\n\nThis only applies to rendered movies.'
    }, { // record hotkey
        elts: ["#recordKeyTxt", "#recordKeyCheckbox"],
        text: 'This allows you to designate a key that acts exactly like clicking ' +
    'the record button with the mouse.\n\nDon\'t use keys that have other uses in the ' +
    'game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all, ' +
    'because the extension will listen for that key even if you are typing in chat.'
    }, { // splats
        elts: ["#useSplatsTxt", "#useSplatsCheckbox"],
        text: 'This toggles whether to show splats or not.\n\nCheck the box if you ' +
    'want to show splats in the replay'
    }, { // canvas size
        elts: ["#canvasWidthInput", "#canvasHeightInput"],
        text: 'Set the width and height of the .webm movie file. The default is 1280 by 800, ' +
    'but set it to 1280 by 720 for true 720p resolution'
    }];

    titles.forEach(function (title) {
        title.elts.forEach(function (elt) {
            $(elt).prop("title", title.text);
        });
    });

    // Saving settings.
    $('#saveSettingsButton').click(function () {
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

            if (!isNaN(inputs.fps) && inputs.fps !== "") {
                options.fps = +inputs.fps;
            }
            if (!isNaN(inputs.duration) && inputs.duration !== "") {
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
                $('#settingsContainer').modal('hide');
            });
        });
    });

    // Update settings.
    function setSettings(options) {
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
    }

    // Set initial settings values.
    chrome.storage.local.get("options", function(items) {
        if (items.options) {
            setSettings(items.options);
        }
    });

    // Update options fields if options are updated.
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (changes.options && changes.options.newValue) {
            setSettings(changes.options.newValue);
        }
    });

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

// Overlay on menu for blocking operations.
// Takes selector for overlay element.
function Overlay(selector) {
    this.$this = $(selector);
    this.selector = selector;
    this.state = {
        progress: null
    };
    this.progress = null;
}

Overlay.prototype.show = function() {
    this.$this.removeClass("hidden");
};

Overlay.prototype.hide = function() {
    this.$this.addClass("hidden");
};

// Set overlay state.
// info can have title (str), message (html), description (html),
// progress (bool|number), actions (array.<obj>) where obj has text (str) and action (fn)
Overlay.prototype.set = function(info) {
    // text
    if (info.hasOwnProperty("title")) {
        this._title(info.title);
    }
    // html
    if (info.hasOwnProperty("message")) {
        this._message(info.message);
    }
    // html
    if (info.hasOwnProperty("description")) {
        this._description(info.description);
    }
    // bool, int
    if (info.hasOwnProperty("progress")) {
        this._initProgress(info.progress);
    }
    // array<obj> with text (html), action (fn) invoked on click.
    if (info.hasOwnProperty("actions")) {
        this._actions(info.actions);
    }
};

// Update overlay state.
Overlay.prototype.update = function(info) {
    if (info.hasOwnProperty("title")) {
        this._title(info.title);
    }
    if (info.hasOwnProperty("message")) {
        this._message(info.message);
    }
    if (info.hasOwnProperty("description")) {
        this._description(info.description);
    }
    if (info.hasOwnProperty("progress")) {
        this._progress(info.progress);
    }
    if (info.hasOwnProperty("actions")) {
        this._actions(info.actions);
    }
};

// @private
Overlay.prototype._title = function(str) {
    this.$this.find(".title").text(str);
};

// @private
Overlay.prototype._description = function(html) {
    this.$this.find(".description").html(html);
};

// @private
Overlay.prototype._message = function(html) {
    this.$this.find(".message").html(html);
};

// @private
Overlay.prototype._initProgress = function(val) {
    var progressClass = "material-progress";
    if (val) {
        this.$this.find("."+progressClass).removeClass("hidden");
        // Reset if needed.
        if (this.progress)
            this._resetProgress();
        var selector = this.selector + " ." + progressClass;
        // Initialize with determinite value.
        if (typeof val == "number") {
            // Determinite, set total.
            this.state.progress = "determinite";
            this.progress = new Mprogress({
                parent: selector
            });
            this.progress.set(val);
        } else {
            // Indeterminite.
            this.state.progress = "indeterminite";
            this.progress = new Mprogress({
                parent: selector,
                template: 3,
                start: true
            });
        }        
    } else {
        // Hide progress.
        this.$this.find("."+progressClass).addClass("hidden");
    }
};

Overlay.prototype._resetProgress = function() {
    this.progress._remove();
    this.progress = null;
    this.state.progress = null;
};

// @private
Overlay.prototype._progress = function(val) {
    if (val || typeof val == "number") {
        if (typeof val == "number") {
            if (this.state.progress == "determinite") {
                // Update determinite value.
                this.progress.set(val);
            } else {
                // Reset and initialize to determinite value.
                this._initProgress(val);
            }
        } else if (this.state.progress == "determinite") {
            // Reset and initialize to indeterminite.
            this._initProgress(true);
        }
    } else {
        // End progress gracefully.
        if (this.progress) {
            this.progress.end();
            this.progress = null;
            this.state.progress = null;
        }
    }
};

// @private
Overlay.prototype._actions = function(actions) {
    var $actions = this.$this.find('.actions');
    $actions.html("");
    actions.forEach(function (action) {
        var $action = $("<button>");
        $action.text(action.text);
        $action.click(action.action);
        $actions.append($action);
    });
};

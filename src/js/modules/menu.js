var moment = require('moment');
var page = require('page');
var Mustache = require('mustache');
var $ = require('jquery');
require('jquery.actual');
require('jquery-ui');
require('bootstrap');
require('bootstrap-material-design');

var sanitize = require('sanitize-filename');
var saveAs = require('file-saver');

var Data = require('./data');
var Messaging = require('./messaging');
var NotificationList = require('./notification-list');
var Overlay = require('./overlay');
var Replays = require('./replays');
var Status = require('./status');
var Table = require('./table');
var Templates = require('./templates');
var Textures = require('./textures');
var Viewer = require('./viewer');
var Constraints = require('./constraints');
var Util = require('./util');
var log = require('./logger')('menu');

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

var viewer = new Viewer();

// UI-specific code
// Handling multiple modals
// http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
$(function () {
    $('.modal').on('hidden.bs.modal', function (e) {
        $(this).removeClass('fv-modal-stack');
        $('#tpr-container').data('open_modals',
            $('#tpr-container').data('open_modals') - 1);
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

        $('#tpr-container').data('open_modals',
            $('#tpr-container').data('open_modals') + 1);

        $(this).css('z-index',
            1040 + (10 * $('#tpr-container').data('open_modals')));

        $('.modal-backdrop').not('.fv-modal-stack').css(
            'z-index',
            1039 + (10 * $('#tpr-container').data('open_modals'))
        );

        $('.modal-backdrop').not('fv-modal-stack')
            .addClass('fv-modal-stack');
    });
});


// Takes selector for nav item and panel.
function cardSwitch(name) {
    var nav_class = `.nav-${name}`;
    $(`.nav li:not(${nav_class})`).removeClass("active");
    $(nav_class).addClass("active");
    var card_id = `#${name}`;
    $(card_id).show();
    $(`.card:not(${card_id})`).hide();
}

// ============================================================================
// Routing
// ============================================================================

page('/', () => {
    log.info("Page: main page.");
    page('/replays');
});

page('/replays', () => {
    log.info("Page: replays.");
    cardSwitch("replays");
});

page('/renders', () => {
    log.info("Page: renders.");
    cardSwitch("renders");
});

page('/failed', () => {
    log.info("Page: failed.");
    cardSwitch("failed");
});

page('/settings', () => {
    log.info("Page: settings.");
    //togglePanel(".nav-failed", "#failed-replays");
});

page('*', () => {
    log.warn("Page: not found!");
    page('/');
});

page.base("/main.html#!");

page.start();

var overlay = new Overlay("#menuContainer .modal-overlay");

// Force status to call listeners set in other functions.
Status.force();

// ============================================================================
// Replay import.
// ============================================================================
var paused = false;

// Importing state.
var initialState = {
    errors: [],
    finished: 0,
    total: 0,
    cancel: null,
    cancelled: false,
    disabled: false
};

var state = Util.clone(initialState);

// Visible link invokes the actual file input.
$('#replay-import').click(function (e) {
    if (!state.disabled) {
        // Empty file input so change listener is invoked even if the
        // same file is selected.
        $('#raw-upload').val('');
        $('#raw-upload').click();
    }
    e.preventDefault();
});
$('#raw-upload').attr('accept', '.txt,.json');
$('#raw-upload').prop('multiple', true);
$('#raw-upload').change(function () {
    var files = $(this).prop('files');
    if (files.length === 0) return;
    Replays.import(files).then(useActivity)
        .catch((err) => {
        // File size bad.
        // Too many files.
        // Failures.
        // TODO: Move to dialog.
        if (err == "db_full") {
            alert("Importing that number of replays would fill " +
                "up the database. Try selecting fewer replays, " +
                "or download and remove replays to free up space.");
        } else if (err == "busy") {
            alert("The background page is busy, try again later.");
        } else if (err == "internal") {
            // TODO: Add link.
            alert("Internal error, see information here for reporting.");
        } else {
            console.error("Uncaught error in import.");
            console.error(err);
        }
    });
    state.total = files.length;
});
// set listeners on activity.
function useActivity(activity) {
    paused = true;
    activity.on("done", (cancelled) => {
        paused = false;
        var update = {
            progress: false,
            description: cancelled ? "Import cancelled"
                                    : "Import finished",
            actions: [{
                text: "dismiss",
                action: function() {
                    overlay.hide();
                }
            }]
        };
        if (warnings.length) {
            // Gather errors into text file.
            var text = state.errors.map(function (err) {
                return err.name + " - " + err.reason;
            }).reduce(function (text, msg) {
                return text + "\n" + msg;
            });
            var url = Util.textToDataUrl(text);
            update.message = Mustache.render(
                Templates.replay_list.import.error_result, {
                url: url
            });
        } else if (cancelled) {
            update.message = "Replay import cancelled. Only " +
                state.finished + " of " + state.total +
                " replays processed.";
        } else {
            update.message = "All replays imported successfully.";
        }

        overlay.update(update);
    });

    activity.on("progress", (progress) => {
        overlay.update({
            message: `On replay ${progress.current} of ` +
                `${progress.total}.`,
            progress: progress.current / progress.total
        });
        // TODO: handle any intermediate error cases?
    });
    var warnings = [];

    activity.on("warning", (info) => {
        warnings.push(info);
        // TODO: display some warning notification?
    });

    // Initialize overlay.
    overlay.set({
        title: "Replay Import",
        progress: true,
        description: "Importing your replays, don't navigate " +
            "away from this page until the process is complete!", 
        actions: [{
            text: "cancel",
            action: () => {
                activity.cancel();
            }
        }]
    });
    overlay.show();
}

// Update UI-visible capabilities.
Status.on("full", function () {
    state.disabled = true;
    $("#replay-import").css({
        color: "#aaa",
        cursor: "default"
    });
    $("#replay-import").attr("title", "delete some replays first");
});

Status.on("active", function () {
    state.disabled = false;
    $("#replay-import").css({
        color: "",
        cursor: ""
    });
    $("#replay-import").attr("title", "");
});

// ============================================================================
// Upgrade behavior.
// ============================================================================

// Display upgrading page with progress.
Status.on("upgrading", function () {
    overlay.set({
        title: "Upgrading Database",
        description: "The database is being upgraded, please do not close Chrome while this is being carried out.",
        progress: true,
        message: "Initializing..."
    });
    overlay.show();
});

// Display upgrading result page.
Status.on("upgrading->active", function () {
    overlay.update({
        description: "The database has been upgraded!",
        actions: [{
            text: "dismiss",
            action: function () {
                overlay.hide();
            }
        }]
    });
});

// TODO: to template
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
// TODO: Transition to new state.
Status.on("error.upgrade", function () {
    overlay.set({
        title: "Database Upgrade Error",
        progress: false,
        message: getContact("Error upgrading database", "TPR Upgrade Error")
    });
    // In case it isn't showing already.
    overlay.show();
});

Messaging.listen("upgradeProgress",
function (message) {
    overlay.update({
        progress: message.progress / message.total,
        message: "Converted replay " + message.progress + " of " + message.total
    });
});

// Display error overlay.
// TODO: Transition to new state.
Status.on("error.db", function () {
    overlay.set({
        title: "Database Error",
        description: getContact("A database error was encountered, please try to enable/disable the extension and see if the issue persists. If it continues", "TPR Database Error"),
        progress: false
    });
    // In case it isn't showing already.
    overlay.show();
});

var replay_table = new Table({
    id: "replay-table",
    // Card header.
    header: {
        selector: "#replays .card-header",
        singular: "replay",
        plural: "replays",
        title: "Replays"
    },
    ajax: function (data) {
        return Replays.query(data).then((result) => {
            var list = result.data.map(function (replay) {
                return {
                    name: replay.name,
                    date: moment(replay.dateRecorded),
                    duration: moment.utc(replay.duration)
                                    .format('mm:ss'),
                    rendered: replay.rendered,
                    id: replay.id,
                    rendering: replay.rendering,
                    replay: replay
                };
            });
            // TODO: Move this.
            $(".nav-home .badge").text(result.total);
            return {
                data: list,
                total: result.total
            };
        }).catch((err) => {
            console.error("Could not retrieve list: %O", err);
            // Rethrow.
            throw err;
        });
    },
    columns: [
        { // Checkbox.
            type: "checkbox",
            data: "rendering",
            render: function (data, type, row, meta) {
                return data ? '<span class="glyphicon glyphicon-lock" title="This replay is rendering"></span>'
                            : Templates.table.checkbox;
            }
        },
        { // Editable name.
            type: "editable",
            className: "row-name fixed-cell",
            data: "name",
            // Callback for editable field.
            callback: (id, text) => {
                console.log(`Renaming replay ${id} to ${text}.`);
                if (text === "") {
                    return Promise.reject(
                        new Error("Name must not be empty."));
                } else {
                    return Replays.get(id).rename(text);
                }
            },
            // TODO: actually implement.
            enabled: function (data, type, row, meta) {
                return !row.rendering;
            }
        },
        { // Rendered.
            className: "data-cell",
            data: "rendered",
            orderable: false,
            render: function (data) {
                return data ? '<i class="material-icons">done</i>'
                            : '';
            }
        },
        { // Duration.
            className: "data-cell",
            data: "duration"
        },
        { // Date recorded.
            className: "data-cell",
            data: "date",
            render: function (date) {
                return date.calendar();
            }
        },
        { // Row actions.
            type: "actions",
            data: "rendered",
            orderable: false,
            actions: [{
                name: "download",
                icon: "file_download",
                // need dynamic title.
                title: "",
                callback: (id) => {
                    // TODO: Move to replay management.
                    console.log('Requesting movie download for replay ' + id + '.');
                    Data.getMovie(id).then(function (file) {
                        var movie = new Blob([file.data], { type: 'video/webm' });
                        var filename = sanitize(file.name);
                        if (filename === "") {
                            filename = "replay";
                        }
                        saveAs(movie, filename + ".webm");
                    }).catch(function (err) {
                        console.error("Error retrieving movie for download: %o.", err);
                    });
                }
            }, {
                name: "preview",
                icon: "play_arrow",
                title: "preview",
                callback: (id) => {
                    // hide menu? some kind of transition.
                    viewer.preview(id);
                }
            }],
            render: function (data, type, row, meta) {
                return Mustache.render(Templates.replay_list.controls, {
                    disabled: !data
                });
            }
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

////////////////////////////
// Table header controls. //
////////////////////////////
// Rendering replays.
$('#replays .card-header .actions .render').click(function () {
    var ids = replay_table.selected();
    replay_table.deselect(ids);
    Replays.select(ids).render().catch((err) => {
        // TODO: Handle error.
    });
});

// Deleting replays.
$('#replays .card-header .actions .delete').click(function () {
    var ids = replay_table.selected();
    console.log("Deleting replays.");
    replay_table.deselect(ids);
    Replays.select(ids).remove().then((undo) => {
        // TODO: create undo panel and associate undo with it.
    }).catch((err) => {
        // internal error
        // empty selection.
    });
});

// Downloading raw replays.
$('#replays .card-header .actions .download-raw').click(function () {
    var ids = replay_table.selected();
    Replays.select(ids).download().then((progress) => {
        // TODO: hook into progress for UI update.
    }).catch((err) => {

    });
});

/////////////////////////
// Table row controls. //
/////////////////////////
// Preview replay in-browser.
$("#replay-table tbody").on("click", ".row-preview", function() {
    var id = $(this).closest('tr').data("id");
    $('#menuContainer').hide();
    viewer.preview(id);
});

// Row movie download.
$("#replay-table tbody").on("click", ".row-download-movie", function() {
    var id = $(this).closest('tr').data("id");
    console.log('Requesting movie download for replay ' + id + '.');
    Data.getMovie(id).then(function (file) {
        var movie = new Blob([file.data], { type: 'video/webm' });
        var filename = sanitize(file.name);
        if (filename === "") {
            filename = "replay";
        }
        saveAs(movie, filename + ".webm");
    }).catch(function (err) {
        console.error("Error retrieving movie for download: %o.", err);
    });
});

/////////////////////////////
// Downloading raw replays //
/////////////////////////////
var download = {
    error: null
};

Messaging.listen("zipProgress",
function (message) {
    overlay.update({
        progress: message.current / message.total,
        message: "Adding replay " + message.current + " of " + message.total + "."
    });
});

Messaging.listen("intermediateZipDownload",
function () {
    overlay.update({
        message: "Zip file reached capacity, downloading..."
    });
});

Messaging.listen("finalZipDownload",
function () {
    overlay.update({
        message: "Downloading final zip file..."
    });
});

Messaging.listen("downloadError",
function (message) {
    download.error = message.reason;
});

// Display json downloading message.
Status.on("json_downloading", function () {
    overlay.set({
        title: 'Downloading Raw Data',
        description: 'Zip files are being generated containing your raw data.',
        message: 'Initializing zip file generation...',
        progress: true
    });
    overlay.show();
});

// Display finish message.
Status.on("json_downloading->active", function () {
    var error = download.error;
    download.error = null;
    if (error) {
        var reason = error;
        // Change overlay to display error.
        // add dismiss
        overlay.set({
            description: "There was an error downloading your replays: " + error + ".",
            actions: [{
                text: "dismiss",
                action: function () {
                    overlay.hide();
                }
            }]
        });
    } else {
        overlay.hide();
    }
});

//////////////////////////////////////
// Dynamic CSS and content updates. //
//////////////////////////////////////
// Re-set menu dimensions on window resize.
$(window).resize(function () {
    replay_table.recalcMaxHeight();
});

var replay_notification_list = new NotificationList("#replays .header");
replay_notification_list.addListener(function () {
    replay_table.recalcMaxHeight();
});

// Listen for updates.
Messaging.listen(["replayUpdated", "replaysUpdated", "renderUpdated", "rendersUpdated"],
function () {
    // Don't update if importing.
    if (!paused) {
        replay_table.reload();
        updateFullNotifications();
    }
});

var notifications = {
    full: null,
    warning: null
};

function removeNotification(name) {
    var id = notifications[name];
    if (id && replay_notification_list.exists(id)) {
        replay_notification_list.remove(id);
    }
}

function updateFullNotifications() {
    Messaging.send("getNumReplays", function (info) {
        if (info.replays >= Constraints.max_replays_in_database) {
            if (!replay_notification_list.exists(notifications.full)) {
                notifications.full = replay_notification_list.add("The replay database is full " +
                    "and some actions are disabled. Download and delete replays " +
                    "to free up space!", "danger");
            }
            removeNotification("warning");
        } else if (info.replays > Constraints.max_replays_in_database * 0.8) {
            if (!replay_notification_list.exists(notifications.warning)) {
                notifications.warning = replay_notification_list.add("The replay database is getting full, download and delete replays to prevent issues!", "warning", true);
            }
            removeNotification("full");

        } else {
            if (replay_notification_list.exists(notifications.full)) {
                removeNotification("full");
            }
            if (replay_notification_list.exists(notifications.warning)) {
                removeNotification("warning");
            }
        }
    });
}

// Database size warnings / information.
Status.once("active", function () {
    updateFullNotifications();
});

// ============================================================================
// Failed replay card.
// ============================================================================

// Init table.
var failed_replay_table = new Table({
    id: "failed-replay-table",
    header: {
        selector: "#failed-replays .card-header",
        singular: "failed replay",
        plural: "failed replays",
        title: "Failed Replays"
    },
    ajax: function (data) {
        var args = {
            length: data.length,
            start: data.start
        };
        // TODO: Transition to promise.
        return Promise.resolve({
            data: [],
            total: 0
        });
        Messaging.send("getFailedReplayList", args, function (response) {
            var list = response.data.map(function (info) {
                return {
                    id: info.id,
                    name: info.name
                };
            });
            if (response.total === 0) {
                // Remove table.
                self.failed_replay_table.table.destroy(true);
            } else {
                $(".nav-failed .badge").text(response.total);
                callback({
                    data: list,
                    total: response.tota
                });
            }
        });
    },
    columns: [
        { // checkbox
            type: "checkbox",
            data: null
        },
        { // id, hidden
            data: "id",
            visible: false
        },
        { // name
            className: "fixed-cell",
            data: "name",
            orderable: false
        }
    ],
    // Order by id.
    order: [[1, 'asc']]
});

// Headers should automatically have the associated table.
// Download listener.
$('#failed-replays .card-header .actions .download').click(function () {
    var ids = failed_replay_table.selected();
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
    var ids = failed_replay_table.selected();
    failed_replay_table.deselect(ids);

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
    failed_replay_table.reload();
}
Status.on("active", update);

// Clean up after table gets destroyed.
failed_replay_table.table.on("destroy", function () {
    Status.removeListener("active", update);
    if ($(".nav-failed").hasClass("active")) {
        $(".nav-home").click();
    }
    // Remove nav.
    $(".nav-failed").remove();
});

Messaging.listen("failedReplaysUpdated", function () {
    failed_replay_table.reload();
});

// Download-relevant listeners.
var download = {
    error: null
};

Messaging.listen("failed.zipProgress",
function (message) {
    overlay.update({
        progress: message.current / message.total,
        message: "Adding failed replay " + message.current + " of " + message.total + "."
    });
});

Messaging.listen("failed.intermediateZipDownload",
function () {
    overlay.update({
        message: "Zip file reached capacity, downloading..."
    });
});

Messaging.listen("failed.finalZipDownload",
function () {
    overlay.update({
        message: "Downloading final zip file..."
    });
});

var downloadError = false;
Messaging.listen("failed.downloadError",
function (message) {
    download.error = message.reason;
});

// Display json downloading message.
// TODO: new states for this.
Status.on("failed.json_downloading", function () {
    overlay.set({
        title: 'Downloading Raw Data',
        description: 'Zip files are being generated containing the data from your failed replays.',
        message: 'Initializing zip file generation...',
        progress: true
    });
    overlay.show();
});

// Display finish message.
// TODO: new states for this.
Status.on("failed.json_downloading->idle", function () {
    var error = download.error;
    download.error = null;
    if (error) {
        var reason = error;
        // Change overlay to display error.
        // add dismiss
        overlay.set({
            description: "There was an error downloading your replays: " + error + ".",
            message: "",
            actions: [{
                text: "dismiss",
                action: function () {
                    overlay.hide();
                }
            }]
        });
    } else {
        overlay.set({
            description: "Your failed replays will be downloading shortly (depending on file size). " +
                "There is either an error with the replay itself or something unexpected was encountered. " +
                "If you send me a message through one of the options on the Help menu, we can get it figured out!",
            message: "",
            actions: [{
                text: "dismiss",
                action: function () {
                    overlay.hide();
                }
            }]
        });
    }
});

// ============================================================================
// Render list card.
// ============================================================================
var render_table = new Table({
    id: "render-table",
    header: {
        selector: "#rendering .card-header",
        singular: "task",
        plural: "tasks",
        title: "Render Tasks"
    },
    ajax: function (data, callback) {
        var args = {
            length: data.length,
            dir: data.dir,
            start: data.start
        };
        // TODO: Actual promise implementation.
        return Promise.resolve({
            data: [],
            total: 0
        });

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
            type: "checkbox",
            data: null,
        },
        { // id, hidden
            data: "id",
            visible: false
        },
        { // name
            className: "fixed-cell",
            data: "name",
            orderable: false
        },
        { // date recorded
            className: "data-cell",
            data: "date",
            orderable: false,
            render: function (date) { return date.calendar(); }
        },
        { // status
            className: "data-cell",
            data: null,
            defaultContent: '<span class="render-status">Queued</span>',
            orderable: false
        },
        { // Progress indicator.
            className: "data-cell",
            data: null,
            defaultContent: '<div class="render-progress"></div>',
            orderable: false
        },
        { // Action buttons.
            data: null,
            defaultContent: '<div class="actions"><div class="cancel-render"><i class="material-icons">cancel</i></div></div>',
            orderable: false
        }
    ],
    order: [[1, 'asc']]
});

// Single cancellation buttons.
$("#render-table tbody").on("click", ".cancel-render", function() {
    var id = $(this).closest('tr').data("id");
    render_table.deselect(id);
    console.log('Requesting render cancellation for replay ' + id + '.');
    Messaging.send("cancelRender", {
        id: id
    });
});

// Multi-cancellation buttons.
$('#rendering .card-header .actions .cancel').click(function() {
    var ids = render_table.selected();
    render_table.deselect(ids);
    if (ids.length > 0) {
        Messaging.send("cancelRenders", {
            ids: ids
        });
    }
});

Status.on("active", function () {
    render_table.reload();
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
    render_table.reload();
});

// ============================================================================
// Settings.
// ============================================================================
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

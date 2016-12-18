const $ = require('jquery');
// Set global since bootstrap assumes it.
window.$ = window.jQuery = $;
require('bootstrap');
// Relinquish control back to existing version if needed.
$.noConflict(true);

require('chrome-storage-promise');
const EventEmitter = require('events');
const moment = require('moment');
const reader = require('promise-file-reader');

const logger = require('util/logger')('content');
const Cookies = require('util/cookies');
const {Viewer} = require('modules/previewer');
const Textures = require('modules/textures');
const track = require('util/track');

// Components
const Upload = require('modules/upload');
const ActivityDialog = require('modules/activity-dialog');

// Get URL for setting cookies, assumes a domain of *.hostname.tld:*/etc
var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//)[1];

// Moment calendar customization for date display.
moment.updateLocale('en', {
  calendar: {
    lastDay: '[Yesterday at] LT',
    sameDay: 'LT',
    nextDay: '[Tomorrow at] LT',
    lastWeek: 'lll',
    nextWeek: 'lll',
    sameElse: 'lll'
  }
});

// Inserts Replay button in main page
function createReplayPageButton() {
    if ($('#userscript-home').length) {
        $('#play-now').after('<a class="btn" id="ReplayMenuButton">Replays');
        $('#ReplayMenuButton').append('<span class="sub-text">watch yourself');
    } else {
        $('div.buttons > a[href="/boards"]').after('<a class="button" id="ReplayMenuButton">Replays');
        $('#ReplayMenuButton').append('<span>watch yourself');
    }

    $('#ReplayMenuButton').click(function () {
        // Show menu.
        if ($('#menuContainer').length) {
            $('#menuContainer').modal('show');
        }
    });
}

// Set up multi-modal fix
// http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
function modalFix() {
    // Track backdrops to overcome duplicate bootstrap code causing problems.
    var backdrops = new Map();
    $(function () {
        $('.modal').on('hidden.bs.modal', function (e) {
            $(this).removeClass('fv-modal-stack');
            $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') - 1);
            if (backdrops.has(this)) {
                backdrops.get(this).remove();
                backdrops.delete(this);
            }
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

            var these_backdrops = $('.modal-backdrop').not('.fv-modal-stack');
            backdrops.set(this, these_backdrops);
            these_backdrops.addClass('fv-modal-stack');
        });
    });
}

// Inject menu html into page.
function injectMenu() {
    return new Promise((resolve, reject) => {
        var insert_point;
        if ($('#userscript-home').length) {
            insert_point = $('body');
        } else {
            insert_point = $('article');
        }
        // Create Container for Replay Menu.
        insert_point.append('<div id="tpr-container" class="bootstrap-container jquery-ui-container">');

        // Retrieve html of all items
        $('#tpr-container').load(
            chrome.extension.getURL("html/menus.html"), resolve);
    });
}

// Initialize settings and texture picker.
function initSettings() {
    // Settings container.
    $('#settings-title').text('TagPro Replays v' + chrome.runtime.getManifest().version);
    setFormTitles();
    let settings = [{
        name: 'fps',
        id: 'fpsInput',
        type: 'number'
    }, {
        name: 'duration',
        id: 'durationInput',
        type: 'number'
    }, {
        name: 'record',
        id: 'recordCheckbox',
        type: 'checkbox'
    }, {
        name: 'custom_textures',
        id: 'useTextureCheckbox',
        type: 'checkbox'
    }, {
        name: 'hotkey_enabled',
        id: 'recordKeyChooserInput',
        get: $elt => $elt.data('record'),
        set: ($elt, val) => $elt.data('record', val)
    }, {
        name: 'hotkey',
        id: 'recordKeyChooserInput',
        get: $elt => {
            if ($elt.text() == 'None') return null;
            return $elt.text().charCodeAt(0);
        },
        set: ($elt, val) => {
            if ($elt.data('record')) {
                $elt.text(String.fromCharCode(val));
                $('#record-key-remove').show();
            } else {
                $elt.val('None');
                $('#record-key-remove').hide();
            }
        }
    }, {
        name: 'splats',
        id: 'useSplatsCheckbox',
        type: 'checkbox'
    }, {
        name: 'spin',
        id: 'useSpinCheckbox',
        type: 'checkbox'
    }, {
        name: 'ui',
        id: 'useClockAndScoreCheckbox',
        type: 'checkbox'
    }, {
        name: 'chat',
        id: 'useChatCheckbox',
        type: 'checkbox'
    }, {
        name: 'canvas_width',
        id: 'canvasWidthInput',
        type: 'number'
    }, {
        name: 'canvas_height',
        id: 'canvasHeightInput',
        type: 'number'
    }].map((setting) => {
        // Custom getter/setter.
        if (!setting.type) return setting;
        if (setting.type == 'number') {
            setting.get = $elt => {
                let val = Number($elt.val());
                // We allow no non-zero values.
                if (isNaN(val) || !val) return null;
                return val;
            }
            setting.set = ($elt, val) => $elt.val(val);
        } else if (setting.type == 'checkbox') {
            setting.get = $elt => $elt.prop('checked');
            setting.set = ($elt, val) => $elt.prop('checked', val);
        }
        return setting;
    });

    // Save form fields.
    function saveSettings() {
        let options = {};
        for (let setting of settings) {
            let $elt = $(`#${setting.id}`);
            let result = setting.get($elt);
            if (result !== null) {
                options[setting.name] = result;
            } else {
                logger.warn(`Value not valid for field ${setting.id}.`);
            }
        }
        // Save options.
        chrome.storage.promise.local.get('options').then((items) => {
            if (!items.options) {
                throw new Error('Existing options not found in chrome storage');
            }
            let new_options = Object.assign(items.options, options);
            chrome.storage.promise.local.set({
                options: new_options
            }).then(() => {
                logger.info('Options set.');
            });
        });

        chrome.runtime.sendMessage({
            method: 'cleanRenderedReplays'
        });
        $('#settingsContainer').modal('hide');
    }

    $('#saveSettingsButton').click(saveSettings);

    // Set value of settings when dialog opened, using default values if
    // none have yet been set.
    function setSettings() {
        return chrome.storage.promise.local.get('options').then((items) => {
            logger.info('Options: ', items);
            if (!items.options) {
                throw new Error('Options not found.');
            }
            let options = items.options;
            for (let setting of settings) {
                let $elt = $(`#${setting.id}`);
                setting.set($elt, items.options[setting.name]);
            }
        }).catch((err) => {
            logger.error(err);
            throw err;
        });
    }

    $('#settingsContainer').on('show.bs.modal', setSettings);
    // Set settings so other areas that use the settings directly from the
    // elements will work properly.
    setSettings().then(() => {
        logger.info('Settings set.');
    });

    // Record key input.
    function keyListener(e) {
        $('#recordKeyChooserInput').text(String.fromCharCode(e.which))
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
        if (!$(e.target).parents().addBack().is('#record-key-input-container')) {
            stopInputting();
        }
    });

    $('#textureSaveButton').click(function () {
        // Load image files, if available, from file fields.
        let imageSources = {
            tilesInput:        "tiles",
            portalInput:       "portal",
            speedpadInput:     "speedpad",
            speedpadredInput:  "speedpadred",
            speedpadblueInput: "speedpadblue",
            splatsInput:       "splats"
        };
        let textures = {};
        Promise.all(Object.keys(imageSources).map((id) => {
            let input = document.getElementById(id);
            if (!input) {
                return Promise.reject(`Could not find input with id: ${id}`);
            }
            let file = input.files[0];
            if (!file) return;
            return reader.readAsDataURL(file).then((data) => {
                textures[imageSources[id]] = data;
            });
        })).then(() => {
            return Textures.set(textures);
        }).then(() => {
            $('#textureContainer').modal('hide');
        }).catch((err) => {
            logger.error('Error saving textures: ', err);
        });
    });
}

/**
 * Provides DOM/replay data access and reconciliation.
 * 
 * Automatically handles sorting and some display state related
 * to replays.
 */
class Table {
    constructor(options) {
        // Source has a get function that returns data.
        this.source = options.source;
        // Sort fields is an object mapping sort field name to:
        // - id: id of column header
        // - text: default column header text
        // - sort: function for sorting elements in ascending order
        // it also has a 'default' key which contains the default
        // name and dir of sorting.
        this.sort_fields = options.sort_fields;
        this.data = [];
        // Map from replay id to row element id to prevent overlap.
        this.ids = {};
        this.num_ids = 0;
    }

    // Initialize when the DOM is ready.
    init() {
        // Set up sort headers.
        for (let type in this.sort_fields) {
            if (type == 'default') continue;
            let $elt = $(`#${this.sort_fields[type].id}`);
            $elt.click((e) => {
                let [name, dir] = this._get_sort();
                let new_dir = 'desc';
                if (name == type && dir == 'desc') {
                    new_dir = 'asc';
                }
                this.sort(type, new_dir);
            });
            $elt.css({
                cursor: 'pointer'
            });
        }

        // Template row.
        this.$template_row = $('#replayList .replayRow.clone:first').clone(true);
        this.$template_row.removeClass('clone'); 
    }

    /**
     * Table updates from its source.
     */
    update() {
        $('.replayRow').not('.clone').remove();
        this.source.get().then((data) => {
            logger.info(`Received ${data.length} replays.`);
            for (let replay of data) {
                this._add_replay(replay);
            }
            this._update_ui();
            this._do_sort();
        }).catch((err) => {
            logger.error('Error retrieving replays: ', err);
        });
    }

    /**
     * Add a replay to the table.
     */
    add_replay(replay) {
        this._add_replay(replay);
        this._update_ui();
        this._do_sort();
    }

    /**
     * Remove replays by id.
     */
    remove_replays(ids) {
        if (!Array.isArray(ids)) ids = [ids];
        // Remove from DOM.
        for (let id of ids) {
            this.get_row(id).remove();
        }
        // Remove from internal list.
        let data_ids = this.data.map(item => item.id).filter(
            id => !ids.includes(id));
        this.data = this.data.filter(
            item => data_ids.includes(item.id));
        this._update_ui();
    }

    /**
     * Update a replay and the corresponding table information.
     * @param {*} id
     * @param {Object} updates - updates to be applied to the replay
     */
    update_replay(id, updates) {
        let current_data = this.get_replay_data(id);
        let result = Object.assign(current_data, updates);
        let $row = this.get_row(id);
        $row.data('replay', result);
        if (id !== result.id) {
            $row.attr('id', this._get_id(result.id));
        }
        this._render_row($row);
        this._do_sort();
    }

    /**
     * Whether the table is empty.
     */
    empty() {
        return !this.data.length;
    }

    // Given a DOM element in a row, get the id of the replay it is associated
    // with;
    get_id_from_element(elt) {
        let row = $(elt).closest('tr');
        return row.data('replay').id;
    }

    // Given a replay id, get the corresponding metadata.
    get_replay_data(id) {
        return this.get_row(id).data('replay');
    }

    /**
     * Get ids of all selected replays.
     */
    get_selected() {
        let ids = [];
        $('.selected-checkbox:checked').each((i, elt) => {
            ids.push(this.get_id_from_element(elt));
        });
        return ids;
    }

    get_row(id) {
        return $(`#${this._get_id(id)}`);
    }

    sort(field, direction) {
        this._set_sort(field, direction);
        this._do_sort();
    }

    // Private functions.
    _add_replay(replay) {
        let row = this._make_row(replay);
        this._render_row(row);
        this._add_row(row);
        this.data.push(replay);
    }

    _make_row(replay) {
        let row = this.$template_row.clone(true);
        row.data('replay', replay);
        row.attr('id', this._get_id(replay.id));
        return row;
    }

    _render_row(row) {
        let replay = row.data('replay');
        // Set playback link text
        row.find('a.playback-link').text(replay.name);

        if (replay.rendered) {
            row.find('.rendered-check').text('✓');
            row.find('.download-movie-button').prop('disabled', false);
        } else {
            row.find('.download-movie-button').prop('disabled', true);
        }
        let duration = moment(replay.duration * 1000);
        row.find('.duration').text(duration.format('mm:ss'));
        let recorded = moment(replay.recorded);
        row.find('.replay-date').text(recorded.calendar());
        let titleText = formatMetaDataTitle(replay);
        row.attr('title', titleText);
    }

    _add_row(row) {
        $('#replayList tbody').append(row);
    }

    _do_sort() {
        let [name, dir] = this._get_sort();
        // Column headers.
        let arrow = dir == 'asc' ? '\u25B2'
                                 : '\u25BC';
        let id = this.sort_fields[name].id;
        let text = this.sort_fields[name].text;

        for (let type in this.sort_fields) {
            if (type == 'default') continue;
            let field = this.sort_fields[type];
            let id = field.id;
            let text = field.text;
            if (type == name) {
                text = `${text} ${arrow}`;
            }
            $(`#${id}`).text(text);
        }
        // Sort data.
        this.data.sort(this.sort_fields[name].sort);
        if (dir == 'desc') {
            this.data.reverse();
        }
        // Change DOM.
        this._order_rows();
    }

    // Ensure visible rows are ordered according to order in data
    // member.
    _order_rows() {
        let ordered_ids = this.data.map(item => item.id);
        let $row_container = $('#replayList tbody');
        for (let id of ordered_ids) {
            this.get_row(id).detach().appendTo($row_container);
        }
    }

    _get_sort() {
        if (!sessionStorage.getItem('tpr_sort_field') ||
            !sessionStorage.getItem('tpr_sort_dir')) {
            return [
                this.sort_fields.default.name,
                this.sort_fields.default.dir
            ];
        } else {
            return [
                sessionStorage.getItem('tpr_sort_field'),
                sessionStorage.getItem('tpr_sort_dir')
            ];
        }
    }

    _set_sort(field, direction) {
        sessionStorage.setItem('tpr_sort_field', field);
        sessionStorage.setItem('tpr_sort_dir', direction);
    }

    _update_ui() {
        $('.replay-count').text(`Total replays: ${this.data.length}`);
        if (this.empty()) {
            // Show "No replays" message.
            $('#noReplays').show();
            $('#replayList').hide()
            $('#renderSelectedButton').prop('disabled', true);
            $('#deleteSelectedButton').prop('disabled', true);
            $('#downloadRawButton').prop('disabled', true);
            $('#selectAllCheckbox').prop('disabled', true);
            $('#selectAllCheckbox').prop('checked', false);
        } else {
            // Hide "No replays".
            $('#noReplays').hide();
            // Display list of replays.
            $('#replayList').show();
            // Enable buttons for interacting with multiple selections.
            $('#renderSelectedButton').prop('disabled', false);
            $('#deleteSelectedButton').prop('disabled', false);
            $('#downloadRawButton').prop('disabled', false);
            $('#selectAllCheckbox').prop('disabled', false);
        }
    }

    // Get id for item suitable for element id attribute.
    // This is necessary since we use arbitrary strings for
    // replay keys but don't want to overlap with another id
    // of the name we map to.
    _get_id(item_id) {
        if (!this.ids[item_id]) {
            // HTML5 says no spaces in ids.
            let valid_id = item_id.replace(' ', '_');
            this.ids[item_id] = `replay-${this.num_ids++}-${valid_id}`;
        }
        return this.ids[item_id];
    }
}

let replay_table = new Table({
    source: {
        get: () => {
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    method: 'replay.list'
                }, (result) => {
                    if (result.error) {
                        reject(result.message);
                    } else {
                        resolve(result.replays);
                    }
                });
            });
        }
    },
    sort_fields: {
        default: {
            name: 'recorded',
            dir: 'desc'
        },
        name: {
            id: 'nameHeader',
            text: 'Name',
            sort: (a, b) => a.name.localeCompare(b.name)
        },
        recorded: {
            id: 'dateHeader',
            text: 'Date',
            sort: (a, b) => a.recorded - b.recorded
        },
        duration: {
            id: 'durationHeader',
            text: 'Duration',
            sort: (a, b) => a.duration - b.duration
        },
        rendered: {
            id: 'renderedHeader',
            text: 'Rendered',
            sort: (a, b) => a.rendered - b.rendered
        }
    }
});

let viewer = new Viewer();
let activity = new EventEmitter();
// Initialize the menu.
function initMenu() {
    logger.info("Menu loaded.");
    modalFix();
    initSettings();
    replay_table.init();
    viewer.init();
    let activity_dialog = new ActivityDialog($('#activity-container'));

    let menu_opened = false;
    // Update list of replays when menu is opened.
    $('#menuContainer').on('show.bs.modal', function () {
        if (!menu_opened) {
            menu_opened = true;
            track("Menu Opened");
        }
        replay_table.update();
    });

    // allow 'select all' checkbox to work
    $('#selectAllCheckbox')[0].onchange=function(e) {
        $('.replayRow:not(.clone) .selected-checkbox').each(function() {
            this.checked = e.target.checked 
        });
    }

    // these buttons allow rendering/deleting multiple replays
    $('#renderSelectedButton').click(renderSelected);
    $('#deleteSelectedButton').click(deleteSelected);
    $('#downloadRawButton').click(downloadRawData);

    /**
     * Callback for Render button. Sends replays to background page
     * consecutively on completion of previous replay.
     */
    function renderSelected() {
        let ids = replay_table.get_selected();
        if (!ids.length) return;
        if (!confirm('Are you sure you want to render these replays?'
            + ' The extension will be unavailable until the movies are rendered.')) {
            return;
        }
        logger.info('Starting rendering of replays.');
        for (let id of ids) {
            let $row = replay_table.get_row(id);
            $row.find('.rendered-check').text('Queued');
        }
        let i = 0;
        render_loop();
        function render_loop() {
            if (i === ids.length) {
                logger.info('Rendering complete.');
                return;
            }
            let id = ids[i];
            let $row = replay_table.get_row(id);
            $row.find('.rendered-check').html('<progress class="progressbar">');
            chrome.runtime.sendMessage({
                method: 'replay.render',
                id: id,
            }, (result) => {
                logger.info(`Received render confirmation for replay: ${i}`);
                if (result.failed) {
                    logger.info(`Rendering of ${i} failed, reason: ${result.reason}`);
                    if (result.severity == 'fatal') {
                        alert(`Rendering failed: ${result.reason}`);
                        return;
                    } else {
                        // Some transient error, we can continue to send replays.
                        $row.find('.rendered-check').html('<span style="color:red">ERROR');
                    }
                } else {
                    replay_table.update_replay(id, {
                        rendered: true
                    });
                }
                i++;
                render_loop();
            });
        }
    }

    // function to delete multiple files at once
    function deleteSelected() {
        let ids = replay_table.get_selected();
        if (!ids.length) return;
        if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
            logger.info(`Requesting deletion of: ${ids}`);
            chrome.runtime.sendMessage({
                method: 'replay.delete',
                ids: ids
            }, (result) => {
                if (result.failed) {
                    logger.error(`Error deleting replays: ${result.reason}`);
                }
            });
        }
    }


    /**
     * Callback for replay download button.
     * 
     * Raw data is zipped on the background page,
     * this just sends the request and then manages
     * the progress modal.
     */
    function downloadRawData() {
        let ids = replay_table.get_selected();
        if (!ids.length) return;
        logger.info(`Requesting download for: ${ids}`);
        // Initialize activity dialog.
        activity_dialog.set({
            dismissable: false,
            progress: true
        });
        activity_dialog.header('Replay Export');
        activity_dialog.text('Preparing download');
        activity_dialog.progress(0);
        activity_dialog.show();
        // Zipping messages override 
        let zipping = 0;
        // Update activity dialog progress.
        function update_dialog(activity) {
            let {action, value} = activity;
            if (action == 'progress') {
                activity_dialog.progress(value);
                if (!zipping) {
                    activity_dialog.text('Adding files to zip.');
                }
            } else if (action == 'state') {
                // Zip updates.
                // Stop zipping.
                if (value.startsWith('!')) {
                    zipping--;
                    if (!zipping) {
                        activity_dialog.text('Downloading zip...');
                    }
                } else {
                    zipping++;
                    if (value == 'zip:intermediate') {
                        activity_dialog.text('Generating intermediate zip file.');
                    } else if (value == 'zip:final') {
                        activity_dialog.text('Generating final zip.');
                    }
                }
            }
        }
        activity.on('export', update_dialog);
        chrome.runtime.sendMessage({
            method: 'replay.download',
            ids: ids
        }, (result) => {
            activity.removeListener('export', update_dialog);
            activity_dialog.update({
                dismissable: true
            });
            if (result.failed) {
                activity_dialog.text(`Replay export failed, reason: ${result.reason}`);
            } else {
                activity_dialog.text('Replays exported.');
            }
        });
    }

    // Replay data row listeners.
    $('#replayList').on('click', '.playback-link', (e) => {
        let id = replay_table.get_id_from_element(e.target);
        logger.info(`Playback link clicked for ${id}`);
        let info = replay_table.get_replay_data(id);
        $('#menuContainer').hide();
        viewer.load(info);
    });

    $('#replayList').on('click', '.download-movie-button', (e) => {
        let id = replay_table.get_id_from_element(e.target);
        logger.info(`Movie download button clicked for ${id}`);
        chrome.runtime.sendMessage({
            method: 'movie.download',
            id: id
        }, (result) => {
            if (result.failed) {
                alert(`Download failed. Most likely you haven't rendered that movie yet.\nReason: ${result.reason}`);
            } else {
                logger.debug('Movie download completed.');
            }
        });
    });

    $('#replayList').on('click', '.rename-button', (e) => {
        let id = replay_table.get_id_from_element(e.target);
        let replay = replay_table.get_replay_data(id);
        logger.info(`Rename button clicked for ${id}`);
        let name = replay.name;
        let newName = prompt(`Please enter a new name for ${name}`, name);
        newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '');
        if (newName) {
            logger.info(`Requesting rename for ${id} to ${newName}.`);
            chrome.runtime.sendMessage({
                method: 'replay.rename',
                id: id,
                new_name: newName
            }, (result) => {
                if (result.failed) {
                    alert(`Replay renaming failed: ${result.reason}`);
                }
            });
        }
    });

    $('#replayList').on('click', '.selected-checkbox', (e) => {
        let self = e.target;
        if (self.checked && e.shiftKey &&
            $('.replayRow:not(.clone) .selected-checkbox:checked').length > 1) {
            let boxes = $('.replayRow:not(.clone) .selected-checkbox'),
                closestBox = null,
                thisBox = null;
            for (let i = 0; i < boxes.length; i++) {
                if (self == boxes[i]) { 
                    thisBox = i; 
                    if (closestBox !== null) break;
                    continue;
                }
                if (boxes[i].checked) closestBox = i;
                if (thisBox !== null && closestBox !== null) break;
            }
            var bounds = [closestBox, thisBox].sort((a, b) => a - b);
            boxes.map((num, box) => {
                box.checked = bounds[0] <= num && num <= bounds[1];
            });
        }
    });

    function setReplayListHeight() {
        let new_height = 185;
        if ($(window).height() > 500) {
            new_height = $(window).height() - 315;
        }
        $('#replayList').css({
            'max-height': new_height
        });
    }
    
    $(window).resize(setReplayListHeight);
    setReplayListHeight();

    // Raw data import.
    let resume;
    $('#import-alert').on('hidden.bs.modal', () => {
        if (resume) {
            resume();
            resume = null;
        }
    });

    function showImportAlert(filename, reason) {
        return new Promise((resolve, reject) => {
            resume = resolve;
            $('#import-alert .filename').text(filename);
            $('#import-alert .reason').text(reason);
            $('#import-alert').modal({
                backdrop: false
            });
        });
    }

    let import_start, import_end, total_size, total;
    function report_stats() {
        let duration = import_end - import_start;
        logger.info(`Import Statistics:\nStart: ${import_start}\nEnd: ${import_end}\nDuration: ${duration}\nTotal files: ${total}\nSize: ${total_size}`);
    }
    function readImportedFile(files, i) {
        if (!i) {
            // Reset stats.
            total = files.length;
            total_size = 0;
            import_start = performance.now();
        }
        if (i == files.length) {
            import_end = performance.now();
            report_stats();
            return;
        }
        let file = files[i++];
        total_size += file.size;
        return reader.readAsText(file).then((text) => {
            chrome.runtime.sendMessage({
                method: 'replay.import',
                name: file.name,
                data: text
            }, function (response) {
                if (response.failed) {
                    // Failed to import. Wait until confirmation.
                    showImportAlert(file.name, response.reason).then(() => {
                        readImportedFile(files, i);
                    });
                } else {
                    logger.info(`Replay ${name} imported.`);
                    readImportedFile(files, i);
                }
            });
        });
    };
    
    let upload = new Upload('raw-upload-button');
    upload.on('files', (files) => {
        readImportedFile(files, 0);
    });
} // end initMenu

// Function to set UI titles.
function setFormTitles() {
    fpsTitle = 'Use this to set how many times per second data are recorded from the tagpro game.\n' +
    'Higher fps will create smoother replays.\n\nIf you experience framerate drops during gameplay,' +
    ' or if your replays are sped up, try reducing this value.';
    $('#fpsTxt').prop('title', fpsTitle);
    $('#fpsInput').prop('title', fpsTitle);

    durationTitle = 'Use this to set how long the replay will be in seconds. Values greater than 60' +
    ' seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect' +
    ' replays that have already been recorded';
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

    recordKeyTitle = 'This allows you to designate a key that acts exactly like clicking' +
    ' the record button with the mouse.\n\nDon\'t use keys that have other uses in the' +
    ' game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all,' +
    ' because the extension will listen for that key even if you are typing in chat.';
    $('#recordKeyTxt').prop('title', recordKeyTitle);
    $('#recordKeyCheckbox').prop('title', recordKeyTitle);

    useSplatsTitle = 'This toggles whether to show splats or not.\n\nCheck the box if you' +
    ' want to show splats in the replay';
    $('#useSplatsTxt').prop('title', useSplatsTitle);
    $('#useSplatsCheckbox').prop('title', useSplatsTitle);
    
    canvasWidthAndHeightTitle = 'Set the width and height of the .webm movie file. The default is 1280 by 800,' +
    ' but set it to 1280 by 720 for true 720p resolution';
    $('#canvasWidthInput').prop('title', canvasWidthAndHeightTitle);
    $('#canvasHeightInput').prop('title', canvasWidthAndHeightTitle);
}

function openReplayMenu() {
    if ($('#menuContainer').length) {
        $('#menuContainer').modal('show');
    }
}

// This is an easy method wrapper to dispatch events
function emit(event, data) {
    var e = new CustomEvent(event, {detail: data});
    window.dispatchEvent(e);
}

// function to format metadata to put into title text
function formatMetaDataTitle(replay) {
    let title = `Map: ${replay.map}\n`;
    title    += `FPS: ${replay.fps}\n`;
    title    += `Red Team:\n\t${replay.red_team.join('\n\t')}\n`;
    title    += `Blue Team:\n\t${replay.blue_team.join('\n\t')}\n`;
    return title;
}

// then set up listeners for info from background script
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    let {method} = message;
    logger.info(`Received message: ${method}`);

    if (method == 'replay.added') {
        replay_table.add_replay(message.replay);

    } else if (method == 'replay.deleted') {
        replay_table.remove_replays(message.ids);

    } else if (method == 'replay.updated') {
        replay_table.update_replay(message.id, message.replay);

    } else if (method == "render.update") {
        let {id, progress} = message;
        let $row = replay_table.get_row(id);
        let progress_bar = $row.find('.progressbar')[0];
        progress_bar.value = progress;

    } else if (method == 'export.update') {
        let {data} = message;
        activity.emit('export', data);

    } else {
        logger.error(`Message type not recognized: ${method}`);
    }
});

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function (e) {
        listener(e.detail);
    });
}

// set up listener for info from injected script
// if we receive data, send it along to the background script for storage
// Listens for recorded replay from recording script.
// info is an object with:
// @property {string} data  JSON formatted data
// @property {string?} name  optional name
listen('replay.save', function (info) {
    logger.info('Received recording, sending to background page.');
    chrome.runtime.sendMessage({
        method: 'replay.save_record',
        data: info.data,
        name: info.name
    }, (result) => {
        emit('replay.saved', {
            failed: result.failed
        });
    });
});

// Set options for the recording script.
function set_record_options(options) {
    Cookies.set('tpr_fps', options.fps, cookieDomain);
    Cookies.set('tpr_duration', options.duration, cookieDomain);
    Cookies.set('tpr_record', options.record, cookieDomain);
    Cookies.set('tpr_hotkey_enabled', options.hotkey_enabled, cookieDomain);
    Cookies.set('tpr_hotkey', options.hotkey, cookieDomain);
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.options) {
        if (changes.options.newValue) {
            logger.info('Updating options for record script.');
            set_record_options(changes.options.newValue);
        }
    }
});

chrome.storage.promise.local.get('options').then((items) => {
    if (!items.options) {
        throw new Error('No options set.');
    }
    set_record_options(items.options);
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

// if we're on the main tagpro server screen, run the createReplayPageButton function
if (document.URL.search(/[a-z]+\/#?$/) >= 0) {
    // make the body scrollable
    $('body')[0].style.overflowY = "scroll"
    // make the button
    createReplayPageButton();
    injectMenu().then(initMenu);
    // Include custom bootstrap.css scoped to #tpr-container
    injectStyleSheet("css/bootstrap.css");
    injectStyleSheet("css/menu.css");
}

// if we're in a game, as evidenced by there being a port number, inject the replayRecording.js script
if (document.URL.search(/\.\w+:/) >= 0) {
    var scripts = ["js/recording.js"];
    scripts.forEach(injectScript);
}
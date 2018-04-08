const $ = require('jquery');

const logger = require('util/logger')('table');

/**
 * Component that provides DOM/replay data access and reconciliation.
 * 
 * Automatically handles sorting and some display state related
 * to replays.
 * 
 * When the DOM is ready, call Table#init
 */
class Table {
  /**
   * Options has 
   * @param {Options} options
   */
  constructor(options) {
    this.options = options;
    // collection is the interface to the represented data.
    this.collection = this.options.collection;
    // Sort fields is an object mapping sort field name to:
    // - id: id of column header
    // - text: default column header text
    // - sort: function for sorting elements in ascending order
    // it also has a 'default' key which contains the default
    // name and dir of sorting.
    this.sort_fields = this.options.sort_fields;
    // Map from replay id to row element id to prevent overlap.
    this.ids = {};
    this.num_ids = 0;
    // track whether user is currently searching.
    this.inSearch = false;
  }

  /**
   * Adds a callback for actions that act on a collection
   * of Replays.
   * 
   * Callback will receive a selection of the managed Replays.
   * @param {string} selector - selector for the element to
   *   listen for clicks on.
   * @param {Function} callback
   */
  add_collection_action(selector, callback) {
    $(selector).click(() => {
      let ids = this.get_selected();
      if (!ids.length) return;
      let selection = this.collection.select(ids);
      callback(selection);
    });
  }

  /**
   * Adds a callback for replay-specific actions.
   * 
   * Callback will take a Replay.
   * 
   * @param {string} selector - selector for the row element to
   *   listen for clicks on.
   * @param {Function} callback
   */
  add_row_action(selector, callback) {
    this.$list.on('click', selector, (e) => {
      let id = this.get_id_from_element(e.target);
      let replay = this.collection.get(id);
      callback(replay);
    });
  }

  /**
   * Initializes the table when the DOM is ready.
   */
  init() {
    // Set up sort headers.
    for (let type in this.sort_fields) {
      if (type == 'default') continue;
      let $elt = $(`#${this.sort_fields[type].id}`);
      $elt.click(() => {
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

    this.$list = $('#replayList');
    // Template row.
    this.$template_row = $('#replayList .replayRow.clone:first').clone(true);
    this.$template_row.removeClass('clone'); 

    // Select all checkbox.
    $('#selectAllCheckbox')[0].onchange=function(e) {
      $('.replayRow:not(.clone) .selected-checkbox').each(function() {
        this.checked = e.target.checked 
      });
    }

    // Row checkboxes.
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
  }

  /**
   * Force the table to update its data from the source
   * provided in initialization.
   */
  update() {
    $('.replayRow').not('.clone').remove();
    this.collection.fetch().then((data) => {
      logger.info(`Received ${data.length} replays.`);
      data.each((replay) => {
        this._add_replay(replay);
      });
      this._update_ui();
      this._do_sort();
    }).catch((err) => {
      logger.error('Error retrieving replays: ', err);
    });
  }

  /**
   * Add a replay to the table.
   * @param {Replay} replay
   */
  add_replay(replay) {
    this._add_replay(replay);
    this._update_ui();
    this._do_sort();
  }

  /**
   * Remove replays by id.
   * @param {Array<string>}
   */
  remove_replays(ids) {
    if (!Array.isArray(ids)) ids = [ids];
    // Remove from DOM.
    for (let id of ids) {
      this.get_row(id).remove();
    }
    this._update_ui();
  }

  /**
   * Update a replay and the corresponding table information.
   * @param {*} id
   * @param {Replay} replay
   */
  update_replay(id, replay) {
    let $row = this.get_row(id);
    $row.data('replay', replay);
    if (id !== replay.id) {
      $row.attr('id', this._get_id(replay.id));
    }
    this._render_row($row, replay);
    this._do_sort();
  }

  /**
   * Whether the table is empty.
   * @returns {boolean}
   */
  empty() {
    return !this.collection.length;
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
   * @returns {Array<string>}
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

  /**
   * Sort the table on a given field.
   * @private
   */
  sort(field, direction) {
    this._set_sort(field, direction);
    this._do_sort();
  }

  // Private functions.
  _add_replay(replay) {
    let $row = this.$template_row.clone(true);
    $row.data('replay', replay);
    $row.attr('id', this._get_id(replay.id));
    this._render_row($row, replay);
    $('#replayList tbody').append($row);
  }

  /**
   * Delegate to the provided render function.
   * @private
   */
  _render_row($row, replay) {
    this.options.render($row, replay);
  }

  _do_sort() {
    let [name, dir] = this._get_sort();
    // Column headers.
    let arrow = dir == 'asc' ? '\u25B2'
                             : '\u25BC';
    // Reset headers to original value, except the one we select.
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
    this.collection.sort(this.sort_fields[name].sort, dir == 'asc');
    // Change DOM.
    this._order_rows();
  }

  // Ensure visible rows are ordered according to order in data
  // member.
  _order_rows() {
    let ordered_ids = this.collection.map(item => item.id);
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
    $('.replay-count').text(`Total replays: ${this.collection.total()}`);
    if (this.empty()) {
      // Show "No replays" message.
      this.inSearch ? $('#tpr-no-search-results').show() : $('#noReplays').show();
      $('#replayList').hide()
      $('#renderSelectedButton').prop('disabled', true);
      $('#deleteSelectedButton').prop('disabled', true);
      $('#downloadRawButton').prop('disabled', true);
      $('#selectAllCheckbox').prop('disabled', true);
      $('#selectAllCheckbox').prop('checked', false);
    } else {
      // Hide "No replays".
      $('#tpr-no-search-results').hide()
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

  /**
   * Given an id for an element, return an id suitable
   * for use in the table. This is necessary to handle
   * arbitrary string ids, but don't want to overlap when we convert
   * to a format suitable for DOM elements.
   */
  _get_id(item_id) {
    if (!this.ids[item_id]) {
      // HTML5 says no spaces in ids.
      let valid_id = item_id.replace(' ', '_');
      this.ids[item_id] = `replay-${this.num_ids++}-${valid_id}`;
    }
    return this.ids[item_id];
  }
}
module.exports = Table;

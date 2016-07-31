var $ = require('jquery');
require('datatables.net')(global, $);
var Mustache = require('mustache');
var KeyCode = require('keycode-js');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var Templates = require('./templates');
var wrap = require('./util').wrap;

var logger = require('./logger')('table');

function callback_intercept(handler, interceptor) {
  return function () {
    var args = [...arguments];
    handler.apply(null, ...args.slice(0, -1), function () {
      interceptor.apply(null, ...arguments, ...args.slice(-1));
    });
  };
}

function intercept(after, interceptor) {
  return function () {
    interceptor(...arguments);
    if (after) {
      after(...arguments);
    }
  }
}

/**
 * Options
 * source - function that takes a query object of the form:
 * - length {int} - number of records requested.
 * - sort  {string} - name of the column to sort by, value of data
 *     param for that column.
 * - dir   {enum} - 'asc' or 'desc'
 * - start {int}
 *
 * and returns a promise that resolves to a value
 * { data: Array<obj>, total: int}
 * at a minimum records should have an id. This is
 * what callbacks are invoked with.
 */

/**
 * Table with selection behaviors.
 * Data should set a row id for selection.
 */
function Table(options) {
  logger.info(`Initializing table for ${options.id}`);
  this.id = options.id;
  this.$ = $(`#${this.id}`);
  this.$table = this.$.find('table');
  this.options = options;
  this.all_selected = [];
  /// DataTable initialization.
  // Pass-thru, defined in options or not at all.
  var passthru = {
    columnDefs: options.columnDefs,
    order: options.order,
  };
  // Static options.
  var static = {
    serverSide: true,
    searching: false,
    stateSave: -1,
    deferLoading: 0,

    // style
    processing: true,
    //scrollY: 'auto',
    pagingType: "simple",
    autoWidth: false,
    /*
    table
    <div class="footer">
    <div class="flex"></div>
    length input control
    Table info summary
    pagination control
    </div>
    */
    dom: 't<"card-footer"<"flex">lip>',
    language: {
      paginate: {
        previous: Templates.icons.previous,
        next: Templates.icons.next
      },
      info: "_START_-_END_ of _TOTAL_",
      infoEmpty: "",
      // TODO: Editable.
      lengthMenu: "Rows per page: _MENU_",
      emptyTable: "No replays. Go record some!"
    }
  };

  var self = this;
  // Intercepted options.
  var intercepted = {
    ajax: function ajax_wrapper(data, callback) {
      // Handle case where user is on a page that has no records,
      // but records exist. Occurs after deleting all items on a
      // page.
      var args = {
        length: data.length,
        // name of data field.
        sort: data.columns[data.order[0].column].data,
        // 'desc' or 'asc'
        dir: data.order[0].dir,
        start: data.start
      };
      options.ajax(args).then((result) => {
        // Mapping to DT format.
        var mapped = {
          data: result.data,
          recordsTotal: result.total,
          // Handle DT-specific parameters so caller doesn't
          // have to.
          draw: data.draw,
          // No actual filtering yet.
          recordsFiltered: result.total
        };
        for (let record of mapped.data) {
          // Ensure all records have id.
          if (typeof record.id !== "number" &&
            typeof record.id !== "string") {
            throw new Error("Record does not have valid " +
              "id.");
          }
          // Set id so it can be retrieved in rows.
          if (typeof record.DT_RowData == "object") {
            record.DT_RowData.id = record.id;
          } else {
            record.DT_RowData = { id: record.id };
          }
        }

        if (mapped.recordsTotal > 0 &&
          mapped.data.length === 0) {
          // Go back a page.
          var current = self.table.page();
          if (current > 0) {
            self.table.page(current - 1);
            // Get new page information.
            var info = self.table.page.info();
            data.start = info.start;
            data.length = info.length;
            ajax_wrapper(data, callback);
          } else {
            callback(mapped);
          }
        } else {
          callback(mapped);
        }
      });
    },
    rowCallback: intercept(options.rowCallback, (row, data) => {
      // Re-select items that were previously not selected.
      if (this.all_selected.includes(data.id)) {
        $(row).addClass('selected')
          .find('paper-checkbox')
          .prop('checked', true);
      }
    }),
    drawCallback: (settings) => {
      // Update checked items.
      updateWhenChecked();
      this.resize();
    }
  };
  // Additional column types.
  var extensions = [
    Editable,
    Checkbox,
    Actions
  ];
  var init_options = {
    columns: process_columns(options.columns)
  };
  function process_columns(cols) {
    var new_cols = cols.map((col) => {
      for (let Extension of extensions) {
        if (Extension.applies(col)) {
          let extension = new Extension(self, col);
          return extension.column();
        }
      }
      return col;
    });
    // Ensure all sortable fields have a data field.
    var index = new_cols.findIndex((col, i) => {
      return col.orderable && !col.data;
    });
    if (index !== -1) {
      throw new Error(`Column ${index} of ${self.id} is ` +
        `orderable, but has no data field set.`);
    }
    return new_cols;
  }
  Object.assign(init_options, intercepted, static, passthru);
  this.table = this.$table.DataTable(init_options);

  /// Processing indicator.
  this.$table.find('thead tr').after(
    Mustache.render(Templates.table.processing, {
      cols: init_options.columns.length
    }));

  this.table.on("processing.dt", (e, settings, processing) => {
    logger.trace(`Processing: ${processing}`);
    var $process = this.$.find('.processing paper-progress');
    if (processing) {
      $process.addClass('active');
    } else {
      $process.removeClass('active');
    }
  });

  /// Checkboxes.
  // TODO: configurable based on checkbox column.
  // Add select-all checkbox to header.
  $(this.table.column(0).header())
    .html(Templates.table.select_all_checkbox)
    .addClass('cb-cell');

  // "Select all" checkbox.
  this.$table.find('th paper-checkbox').change(function () {
    self.$table.find('tbody paper-checkbox')
      .prop("checked", this.checked)
      .trigger("change");
    updateWhenChecked();
  });

  // Track selected rows across all pages.
  this.setRowChangeListener("paper-checkbox", function (id) {
    var tr = $(this).closest("tr");
    var position = self.all_selected.indexOf(id);
    var known_checked = position !== -1;
    if (this.checked && !known_checked) {
      self.all_selected.push(id);
      tr.addClass('selected');
    } else if (!this.checked) {
      self.all_selected.splice(position, 1);
      tr.removeClass('selected');
    }
  });

  // Range selection when shift held.
  this.setClickListener("paper-checkbox", function (e) {
    var numChecked = self.num_checked();
    if (this.checked && e.shiftKey && numChecked > 1) {
      var boxes = self._get_checkboxes(),
        closestBox,
        thisBox;
      for (let i = 0; i < boxes.length; i++) {
        if (this == boxes[i]) {
          thisBox = i;
          if (closestBox) break;
          continue;
        }
        if (boxes[i].checked) closestBox = i;
        if (thisBox && closestBox) break;
      }
      var bounds = [closestBox, thisBox].sort((a, b) => {
        return a - b;
      });
      boxes.slice(bounds[0], bounds[1])
        .prop("checked", true)
        .trigger("change");
    }
    updateWhenChecked();
  });

  // Update table when entry is checked.
  function updateWhenChecked() {
    var rows = self.num_rows();
    var select_all = self._get_select_all();
    if (rows === 0) {
      // Select-all checkbox.
      select_all.prop("disabled", true);
      select_all.prop("checked", false);
      select_all.closest('tr').removeClass('selected');
    } else {
      select_all.prop("disabled", false);

      var numChecked = self.num_checked();
      if (numChecked === rows) {
        select_all.prop("checked", true);
        select_all.closest('tr').addClass('selected');
      } else {
        select_all.prop("checked", false);
        select_all.closest('tr').removeClass('selected');
      }
    }
    self.emit('selection');
  }

  /// Sorting.
  // Sorting icon.
  var orderable_columns = this.table.columns(":not(.sorting_disabled)").header().to$();
  orderable_columns.addClass("orderable");
  orderable_columns.append("<i class='material-icons sort-icon'>arrow_back</i>");

  // Resize when first request is complete.
  this.table.one("draw", () => {
    this.recalcMaxHeight();
  });

  // fix for empty table colspan problem:
  // https://datatables.net/forums/discussion/33203/no-data-datatables-empty-colspan-problem
  this.$table.find('.dataTables_empty')
    .attr('colspan', this.options.columns.length);

  // Delegate eventemitter methods to DataTable.
  /*["on", "one", "off"].forEach((method) => {
    self[method] = self.table[method].bind(self.table);
  });*/
  EventEmitter.call(this);

  // header
  this.header = new CardHeader(this, this.options.header);
}
inherits(Table, EventEmitter);

module.exports = Table;

// Selection behavior.
/**
 * Get ids of entries selected on current page.
 * @return {Array.<integer>} - Array of ids of rows selected.
 */
Table.prototype.selected = function () {
  return this.$table
    .find('td paper-checkbox[checked]')
    .map((i, e) => this.getRecordId(e))
    .get();
};

/**
 * Given ids of rows in the table, ensure that none of them are
 *   selected.
 * @param {(Array.<integer>|integer)} ids - ID or IDs of rows in the
 *   table.
 */
Table.prototype.deselect = function (ids) {
  ids = Array.isArray(ids) ? ids : [ids];
  this.all_selected = this.all_selected.filter(
    (id) => ids.indexOf(id) === -1);
};

// Number of current visible rows.
Table.prototype.num_rows = function () {
  return this.$table.find('td paper-checkbox').length;
};

// Number of visible checked items.
Table.prototype.num_checked = function () {
  return this.$table.find('td paper-checkbox[checked]').length;
};

Table.prototype._get_select_all = function () {
  return this.$table.find('th paper-checkbox');
};

// Get row checkboxes.
Table.prototype._get_checkboxes = function () {
  return this.$table.find('td paper-checkbox');
};


/**
 * Given an element, get the corresponding record id.
 * API for cell extensions.
 */
Table.prototype.getRecordId = function (elt) {
  return $(elt).closest('tr').data('id');
};

Table.prototype.setHeight = function (val) {
  var settings = this.table.settings();
  settings.oScroll.sY = val + "px";
  this.table.draw();
};

Table.prototype.reload = function () {
  // TODO: Handle ajax reload error?
  return new Promise((resolve, reject) => {
    this.table.ajax.reload(() => {
      resolve();
    }, false);
  });
};

// Resize the table height.
Table.prototype.resize = function () {
  var h = $(window).height();
  var margin = 30;
  if ($("#" + this.id).is(":visible")) {
    var scrollBody = $("#" + this.id + "_wrapper .dataTables_scrollBody");
    var modalHeight = $("#menuContainer .modal-dialog").actual("height");
    var totalHeight = modalHeight + margin * 2;
    if (totalHeight > h) {
      var scrollHeight = scrollBody.actual("height");
      scrollBody.css("max-height", scrollHeight - (totalHeight - h));
    }
  }
};

Table.prototype.recalcMaxHeight = function () {
  var scrollBody = $("#" + this.id + "_wrapper .dataTables_scrollBody");
  scrollBody.css("max-height", "initial");
  var modalHeight = $("#menuContainer .modal-dialog").actual("height");
  var margin = 30;
  var h = $(window).height();

  var totalHeight = modalHeight + margin * 2;
  if (totalHeight > h) {
    var scrollHeight = scrollBody.actual("height");
    scrollBody.css("max-height", scrollHeight - (totalHeight - h));
  }
};

// Passes id of record to callback followed by anything else.
Table.prototype.setRowClickListener = function (selector, callback) {
  var self = this;
  this.setClickListener(selector, function () {
    var id = self.getRecordId(this);
    callback.call(this, id, ...arguments);
  });
};

// Passes id of record to callback followed by anything else.
Table.prototype.setRowChangeListener = function (selector, callback) {
  var self = this;
  this.$table.find('tbody').on('change', selector, function () {
    var id = self.getRecordId(this);
    callback.call(this, id, ...arguments);
  });
};

// For functions not interested in id so much.
Table.prototype.setClickListener = function (selector, callback) {
  this.$table.find('tbody').on("click", selector, callback);
};

// ============================================================================
// Additional Cell Types
// ============================================================================
/*
    Cell Types adhere to the following interface:
    - Type(table, column)
    - Type.applies(column) -> bool (static method)
    - Type#render
    - Type#column -> object - get column specification for DT
        initialization.
*/
// Fields take the table as an argument on construction.
// And have an applies method that takes a column def.

// column defines type 'editable'
// and optional functions
// - 'onEdit'
// - 'onInput'
// - 'enabled' (bool|function<data, type, row, meta, bool>)
// - callback - takes id, text, callback or can return boolean or thenable.

// Represents editable content column.
// type: 'editable'
function Editable(table, column) {
  this._table = table;
  var callback = column.callback || (() => true);
  this._callback = wrap(callback);
  this._column = column;
  this._initialized = false;
  // for logging.
  this._name = `${this._table.id} > ${this._column.data}`;
}

// Static method to see if this applies to column.
Editable.applies = function (column) {
  return column.type === "editable";
};

Editable._template =
  `<div class="field-editable">
     <div class="field-editable-static">
       <span class="field-editable-content">{{content}}</span>
       <span class="field-editable-control pull-right">
         <i class="material-icons">edit</i>
       </span>
     </div>
     <div class="field-editable-input-holder">
       <input type="text" class="field-editable-input" value="{{content}}">
     </div>
   </div>`;

// Initializations that need to happen after table exists.
Editable.prototype._init = function () {
  var self = this;
  // Set editable cell behavior callback.
  this._table.setRowClickListener(".field-editable-control",
    function (id) {
      var td = $(this).closest('td');
      td.find(".field-editable-static").hide();
      var input_container = td.find(".field-editable-input-holder");
      input_container.show();
      var input = input_container.find(".field-editable-input");
      var edited = false;

      function feedback(err) {
        // TODO: actual feedback.
        logger.error(`Editable field ${self._name} error`, err);
        dismiss();
      }

      function save(id, text) {
        logger.debug(`Saving editable field ${self._name}`);
        self._callback(id, text)
          .then(() => {
            edited = true;
            dismiss();
          })
          .catch(feedback);
      }

      function enter(evt) {
        // Enter key.
        var handled = false;
        if (evt.which === KeyCode.KEY_RETURN) {
          var text = $(this).val();
          save(id, text);
          handled = true;
        } else if (evt.which === KeyCode.KEY_ESCAPE) {
          dismiss();
          handled = true;
        }
        if (handled) {
          evt.preventDefault();
        }
      }

      function dismiss() {
        td.find(".field-editable-static").show();
        input_container.hide();
        input.off("keypress", enter);
        input.off("blur", dismiss);
        if (edited) {
          self._table.reload();
        }
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
};

Editable.prototype.render = function (data, type, row, meta) {
  if (!this._initialized) {
    this._init();
    this._initialized = true;
  }
  return Mustache.render(Editable._template, {
    content: data
  });
};

// Apply change to column.
Editable.prototype.column = function () {
  return Object.assign({}, this._column, {
    render: this.render.bind(this)
  });
};

// Checkbox column.
function Checkbox(table, column) {
  this._table = table;
  this._column = column;
}

Checkbox.applies = function (col) {
  return col.type === "checkbox";
};

Checkbox._template =
  `<paper-checkbox></paper-checkbox>`;

Checkbox.prototype.render = function (data, type, row, meta) {
  // TODO: Implement enable/disable.
  return Checkbox._template;
};

Checkbox.prototype.column = function () {
  var classnames = "cb-cell";
  if (this._column.className) {
    classnames += ` ${this._column.className}`;
  }
  return Object.assign({}, this._column, {
    className: classnames,
    orderable: false,
    render: this.render.bind(this)
  });
}

/**
 * Column type: "actions"
 * Acts as a container for row-based actions, usually indicated with icon
 * buttons.
 *
 * The column must not be orderable.
 * Column definition must have an array of action specifications.
 * Action specification has the properties:
 * * name
 * * icon
 * * title
 * * callback
 * If a property is a function it will be called with the data
 * for the row.
 */
function Actions(table, column) {
  this._table = table;
  this._column = column;
  this._initialized = false;
  this._cached = "";
}

Actions.applies = function (col) {
  return col.type === "actions";
};

Actions._template =
  `<div class="actions">
     {{#actions}}{{{render}}}{{/actions}}
   </div>`;

// Initialize actions.
Actions.prototype._init = function () {
  this._actions = this._column.actions.map(
    (a) => new RowAction(this._table, a));
};

Actions.prototype.render = function (data, type, row, meta) {
  if (!this._initialized) {
    this._init();
    this._initialized = true;
  }
  // TODO: cache result.
  var actions = this._actions.map((action) => {
    return { render: action.render(data, type, row, meta) };
  });
  return Mustache.render(Actions._template, {
    actions: actions
  });
};

// Column return function.
Actions.prototype.column = function () {
  return Object.assign({}, this._column, {
    render: this.render.bind(this)
  });
};

// Gets added indirectly, must init on rowcontainer
// RowAction accepts a data parameter boolean for enabled/disabled.
// opts has a name, callback, icon, title, enabled
// optional enabled fn for determining if it should be enabled.
function RowAction(table, opts) {
  this._table = table;
  this._initialized = false;
  this._name = opts.name;
  this._callback = wrap(opts.callback);
  this._class = `card-row-action-${this._name}`;
  this._vars = {
    icon: opts.icon,
    title: opts.title,
    class: this._class,
    enabled: opts.enabled
  };
}

RowAction._template =
  `<div class="{{class}}{{^enabled}} disabled{{/enabled}}"
     {{#title}} title="{{title}}"{{/title}}>
     <i class="material-icons">{{icon}}</i>
   </div>`;

// Set listeners on parent.
RowAction.prototype._init = function () {
  this._table.setRowClickListener(`.${this._class}`, (id) => {
    logger.debug(`RowAction ${this._name} clicked for item ${id}.`);
    this._callback(id).catch((err) => {
      logger.error("Error executing action callback: ", err);
    });
  });
};

// Called by Action.
RowAction.prototype.render = function (data, type, row, meta) {
  if (!this._initialized) {
    this._init();
    this._initialized = true;
  }
  var vars = Object.assign({}, this._vars);
  // Resolve any function rows.
  for (let p in vars) {
    if (typeof vars[p] == "function") {
      vars[p] = vars[p](row);
    }
  }
  return Mustache.render(
    RowAction._template, vars);
};

function CardHeader(table, opts) {
  this._table = table;
  this._options = opts;
  this._enabled = false;
  this._init();
}

CardHeader._outer_template =
  `<div class="header"></div>`;
CardHeader._template =
  `<div class="card-header">
     <div>
       <span class="title">{{title}}</span>
     </div>
     <div class="actions{{^enabled}} hidden{{/enabled}}">
       {{#actions}}{{{render}}}{{/actions}}
     </div>
   </div>`;

CardHeader.prototype._init = function () {
  this._actions = this._options.actions.map((action) => {
    return new CardAction(this._table, action);
  });
  this.$ = $(CardHeader._outer_template);
  this._table.$.prepend(this.$);
  this._actions.forEach((action) => {
    action._init(this.$);
  });
  this._rendered_actions = this._actions.map((action) => {
    return { render: action.render() };
  });
  // Listen for some selection event.
  this._table.on("selection", () => {
    var num = this._table.selected().length;
    if (num > 0) {
      this._enabled = true;
      if (num === 1) {
        this._title = `${num} ${this._options.language.singular} selected`
      } else {
        this._title = `${num} ${this._options.language.plural} selected`
      }
    } else {
      this._title = this._options.language.title;
    }
    this._update();
  });
  this._update();
};

CardHeader.prototype._update = function () {
  this.$.html(this.render());
};

CardHeader.prototype.render = function () {
  return Mustache.render(CardHeader._template, {
    actions: this._rendered_actions,
    title: this._title,
    enabled: this._enabled
  });
};

// gets added directly, single-instance
function CardAction(table, opts) {
  this._table = table;
  this._id = ++CardAction._instances;
  this._callback = opts.callback;
  this._vars = {
    icon: opts.icon,
    title: opts.title,
    class: `card-action-${this._id}`
  };
}

CardAction._template =
  `<div class="{{class}}"{{#title}} title="{{title}}"{{/title}}>
     <i class="material-icons">{{icon}}</i>
   </div>`;

CardAction._instances = 0;

// Initialized with parent.
CardAction.prototype._init = function (container) {
  $(container).on("click", `.${this._vars.class}`, () => {
    var ids = this._table.selected();
    this._callback(ids);
    this._table.deselect(ids);
  });
};

// Called by parent when ready to render.
CardAction.prototype.render = function () {
  return Mustache.render(
    CardAction._template, this._vars);
};

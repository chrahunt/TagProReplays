var $ = require('jquery');
require('datatables.net')(global, $);
var Mustache = require('mustache');
var KeyCode = require('keycode-js');

var Templates = require('./templates');
var wrap = require('./util').wrap;

var logger = require('./logger')('table');

function callback_intercept(handler, interceptor) {
    return function() {
        var args = [...arguments];
        handler.apply(null, ...args.slice(0, -1), function() {
            interceptor.apply(null, ...arguments, ...args.slice(-1));
        });
    };
}

function intercept(after, interceptor) {
    return function() {
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
    this.id = options.id;
    this.all_selected = [];
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
        /*
        processing display element
        table
        <div class="footer pull-right">
        length input control
        Table info summary
        pagination control
        */
        dom: 'rt<"footer pull-right"lip>',
        language: {
            paginate: {
                previous: Templates.icons.previous,
                next: Templates.icons.next
            },
            info: "_START_-_END_ of _TOTAL_",
            infoEmpty: "",
            // TODO: Editable.
            lengthMenu: "Rows per page: _MENU_",
            emptyTable: "No replays. Go record some!",
            processing: Templates.table.spinner
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
                    draw: data.draw,
                    recordsTotal: result.total,
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
                        record.DT_RowData = {id: record.id};
                    }
                }
                // Handle DT-specific parameters so caller doesn't
                // have to.
                result.draw = data.draw;
                if (result.recordsTotal > 0 &&
                    result.data.length === 0) {
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
                        callback(result);
                    }
                } else {
                    callback(result);
                }
            });
        },
        rowCallback: intercept(options.rowCallback, (row, data) => {
            // Re-select items that were previously not selected.
            if (self.all_selected.indexOf(data.id) !== -1) {
                $(row).addClass('selected')
                    .find('.selected-checkbox')
                    .prop('checked', true);
            }
        }),
        drawCallback: function (settings) {
            // Update checked items.
            updateWhenChecked();
            self.resize();
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

    this.table = $("#" + this.id).DataTable(init_options);

    // Add select-all checkbox to header.
    $(this.table.column(0).header())
        .html(Templates.table.select_all_checkbox)
        .addClass('cb-cell');

    // "Select all" checkbox.
    $("#" + self.id + "_wrapper .select-all").change(function() {
        $("#" + self.id + " tbody .selected-checkbox")
            .prop("checked", this.checked)
            .trigger("change");
        updateWhenChecked();
    });

    // Track selected rows across all pages.
    $("#" + this.id + " tbody").on("change", ".selected-checkbox", function () {
        var tr = $(this).closest("tr");
        var replayId = tr.data("id");
        var idx = self.all_selected.indexOf(replayId);
        if (this.checked && idx === -1) {
            self.all_selected.push(replayId);
            tr.addClass('selected');
        } else if (!this.checked) {
            self.all_selected.splice(idx, 1);
            tr.removeClass('selected');
        }
    });

    // Selection behavior.
    $("#" + this.id + " tbody").on("click", ".selected-checkbox", function (evt) {
        var elt = $(this);
        var numChecked = $("#" + self.id + " .selected-checkbox:checked").length;
        var tr = elt.closest("tr");
        if (elt.prop('checked') && evt.shiftKey && numChecked > 1) {
            var boxes = $("#" + self.id + " .selected-checkbox"),
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
            boxes.slice(bounds[0], bounds[1])
                .prop("checked", true)
                .trigger("change");
        }
        updateWhenChecked();
    });

    // Update table when entry is checked.
    function updateWhenChecked() {
        var header = $(options.header.selector);
        var rows = $("#" + self.id + " .selected-checkbox").length;
        if (rows === 0) {
            // Select-all checkbox.
            $("#" + self.id + "_wrapper .select-all").prop("disabled", true);
            $("#" + self.id + "_wrapper .select-all").prop("checked", false);
            $("#" + self.id + "_wrapper .select-all")
              .closest('tr').removeClass('selected');

            // Card header.
            header.find(".actions").addClass("hidden");
            header.find(".title").text(options.header.title);
        } else {
            var numChecked = $("#" + self.id + " .selected-checkbox:checked").length;

            // Select-all checkbox.
            $("#" + self.id + "_wrapper .select-all")
              .prop("disabled", false);
            if (numChecked === rows) {
                $("#" + self.id + "_wrapper .select-all").prop("checked", true);
                $("#" + self.id + "_wrapper .select-all").closest('tr').addClass('selected');
            } else {
                $("#" + self.id + "_wrapper .select-all").prop("checked", false);
                $("#" + self.id + "_wrapper .select-all").closest('tr').removeClass('selected');
            }

            // Card header.
            if (numChecked > 0) {
                header.find(".actions").removeClass("hidden");
                if (numChecked === 1) {
                    header.find(".title").text(numChecked + " " + options.header.singular + " selected");
                } else {
                    header.find(".title").text(numChecked + " " + options.header.plural + " selected");
                }
            } else {
                header.find(".actions").addClass("hidden");
                header.find(".title").text(options.header.title);
            }
        }
    }

    // Sorting icon.
    var orderable_columns = this.table.columns(":not(.sorting_disabled)").header().to$();
    orderable_columns.addClass("orderable");
    orderable_columns.append("<i class='material-icons sort-icon'>arrow_back</i>");

    // Resize when first request is complete.
    this.table.one("draw", function () {
        self.recalcMaxHeight();
    });

    // Reset min-height when no records.
    this.table.on("xhr", function (evt, settings, json) {
        var scrollBody = $("#" + this.id + "_wrapper .dataTables_scrollBody");
        var row_height = 48;
        if (json.data.length === 0) {
            scrollBody.css("min-height", row_height);
        } else if (json.data.length < 5) {
            scrollBody.css("min-height", (row_height * json.data.length) + 'px');
        } else {
            scrollBody.css("min-height", (48 * 5) + 'px');
        }
    });
    
    // Delegate eventemitter methods to DataTable.
    ["on", "one", "off"].forEach(function (method) {
        self[method] = self.table[method].bind(self.table);
    });
}

module.exports = Table;

/**
 * Get ids of entries selected on current page.
 * @return {Array.<integer>} - Array of ids of rows selected.
 */
Table.prototype.selected = function() {
    var selected = [];
    $("#" + this.id + ' .selected-checkbox').each(function () {
        if (this.checked) {
            var id = $(this).closest("tr").data("id");
            selected.push(id);
        }
    });
    return selected;
};

/**
 * Given ids of rows in the table, ensure that none of them are
 *   selected.
 * @param {(Array.<integer>|integer)} ids - ID or IDs of rows in the
 *   table.
 */
Table.prototype.deselect = function(ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    this.all_selected = this.all_selected.filter(function (id) {
        return ids.indexOf(id) === -1;
    });
};

/**
 * Given an element, get the corresponding record id.
 * API for cell extensions.
 */
Table.prototype.getRecordId = function(elt) {
    return $(elt).closest('tr').data('id');
};

Table.prototype.setHeight = function(val) {
    var settings = this.table.settings();
    settings.oScroll.sY = val + "px";
    this.table.draw();
};

Table.prototype.reload = function() {
    // TODO: Handle ajax reload error?
    return new Promise(function (resolve, reject) {
        this.table.ajax.reload(function () {
            resolve();
        }, false);
    }.bind(this));
};

// Resize the table height.
Table.prototype.resize = function() {
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

Table.prototype.recalcMaxHeight = function() {
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
Editable.applies = function(column) {
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
Editable.prototype._init = function() {
    var self = this;
    // Set editable cell behavior callback.
    $(`#${this._table.id} tbody`).on("click", ".field-editable-control",
    function() {
        var id = self._table.getRecordId(this);
        var td = $(this).closest('td');
        var tr = $(this).closest('tr');
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

Editable.prototype.render = function(data, type, row, meta) {
    if (!this._initialized) {
        this._init();
        this._initialized = true;
    }
    return Mustache.render(Editable._template, {
        content: data
    });
};

// Apply change to column.
Editable.prototype.column = function() {
    return Object.assign({}, this._column, {
        render: this.render.bind(this)
    });
};


function Checkbox(table, column) {
    this._table = table;
    this._column = column;
}

Checkbox.applies = function(col) {
    return col.type === "checkbox";
};

Checkbox._template =
  `<label>
     <i class="material-icons checked">check_box</i>
     <i class="material-icons unchecked">check_box_outline_blank</i>
     <input type="checkbox" class="selected-checkbox hidden">
   </label>`;

Checkbox.prototype.render = function(data, type, row, meta) {
    // TODO: Implement enable/disable.
    return Checkbox._template;
};

Checkbox.prototype.column = function() {
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

// Container for actions, column should have
function Actions(table, column) {
    this._table = table;
    this._column = column;
    this._initialized = false;
}

Actions.applies = function(col) {
    return col.type === "actions";
};

Actions._template =
  `<div class="actions">
     {{#actions}}{{render}}{{/actions}}
   </div>`;

// Initialize actions.
Actions.prototype._init = function() {

};

Actions.prototype.render = function(data, type, row, meta) {
    if (!this._initialized) {
        this._init();
        this._initialized = true;
    }
    return Mustache.render(Actions._template, {
        actions: this._actions
    });
};

// Column return function.
Actions.prototype.column = function() {
    return Object.assign({}, this._column, {
        render: this.render.bind(this)
    });
};

// Gets added indirectly, must init on rowcontainer
// RowAction accepts a data parameter boolean for enabled/disabled.
// opts has a name, callback, icon, title.
// optional disabled fn for determining if it should be enabled.
function RowAction(opts) {
    this._name = opts.name;
    this._callback = wrap(opts.callback);
    this._class = `card-row-action-${this.name}`; 
    this._vars = {
        icon: opts.icon,
        title: opts.title,
        class: this._class,
        disabled: opts.disabled || (() => true)
    };
}

RowAction._template =
  `<div class="{{class}}{{#disabled}} disabled{{/disabled}}"
     {{#title}} title="{{title}}"{{/title}}>
     <i class="material-icons">{{icon}}</i>
   </div>`;

// Set listeners on parent.
RowAction.prototype.init = function(table, container) {
    this.table = table;
    var self = this;
    $(container).on("click", `.${this.class}`, function() {
        var id = self.table.getRecordId(this);
        self.callback(id).catch((err) => {
            console.error("Error executing action callback: " +
                "%O", err);
        });
    });
};

RowAction.prototype.render = function(data, type, row, meta) {
    var vars = Object.assign({}, this.vars, {
        disabled: data
    })
    return Mustache.render(
        RowAction.template, this.vars);
};

// gets added directly, single-instance
function CardAction(opts) {
    this._id = ++CardAction.instances;
    this._callback = opts.callback;
    this._vars = {
        icon: opts.icon,
        title: opts.title,
        class: `card-action-${this.id}`
    };
}

CardAction._template =
  `<div{{#title}} title="{{title}}"{{/title}}>
     <i class="material-icons">{{icon}}</i>
   </div>`;

CardAction._instances = 0;

// Initialized with parent.
CardAction.prototype.init = function(container) {
    var self = this;
    $(container).on("click", `.${this.vars.class}`, function() {
        var id = self.table.getRecordId(this);
        self.callback(id);
    });
};

// Called by parent when ready to render.
CardAction.prototype.render = function() {
    return Mustache.render(
        CardAction.template, this.vars);
};


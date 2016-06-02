var $ = require('jquery');
var DataTable = require('datatables');

var Templates = require('./templates');

/**
 * Table with selection behaviors.
 * Data should set a row id for selection.
 */
function Table(options) {
    this.id = options.id;
    this.all_selected = [];
    var self = this;

    this.table = $("#" + this.id).DataTable({
        ajax: function ajaxWrapper(data, callback) {
            // Handle case where user is on a page that has no records, but records exist.
            // Occurs after deleting all items on a page.
            options.update.call(null, data, function (result) {
                if (result.recordsTotal > 0 && result.data.length === 0) {
                    // Go back a page.
                    var current = self.table.page();
                    if (current > 0) {
                        self.table.page(current - 1);
                        // Get new page information.
                        var info = self.table.page.info();
                        data.start = info.start;
                        data.length = info.length;
                        ajaxWrapper(data, callback);
                    } else {
                        callback(result);
                    }
                } else {
                    callback(result);
                }
            });
        },
        serverSide: true,
        columns: options.columns,
        columnDefs: options.columnDefs,
        dom: 'rt<"footer pull-right"lip>',
        searching: false,
        order: options.order,
        rowCallback: function (row, data) {
            if (self.all_selected.indexOf(data.id) !== -1) {
                $(row).addClass('selected')
                    .find('.selected-checkbox')
                    .prop('checked', true);
            }
            if (options.rowCallback) {
                options.rowCallback.call(null, row, data);
            }
        },
        drawCallback: function (settings) {
            // Update checked items.
            updateWhenChecked();
            self.resize();
        },
        language: {
            paginate: {
                previous: Templates.icons.previous,
                next: Templates.icons.next
            },
            info: "_START_-_END_ of _TOTAL_",
            infoEmpty: "",
            lengthMenu: "Rows per page: _MENU_",
            emptyTable: "No replays. Go record some!",
            processing: Templates.table.spinner
        },
        stateSave: -1,
        scrollY: 'auto',
        pagingType: "simple",
        processing: true,
        deferLoading: 0
    });

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
            $("#" + self.id + "_wrapper .select-all").closest('tr').removeClass('selected');

            // Card header.
            header.find(".actions").addClass("hidden");
            header.find(".title").text(options.header.title);
        } else {
            var numChecked = $("#" + self.id + " .selected-checkbox:checked").length;

            // Select-all checkbox.
            $("#" + self.id + "_wrapper .select-all").prop("disabled", false);
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

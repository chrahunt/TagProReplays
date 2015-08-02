var $ = require('jquery');
var DataTable = require('datatables');

/**
 * Table with selection behaviors.
 * Data should set a row id for selection.
 */
function Table(options) {
    this.id = options.id;
    this.all_selected = [];
    var table = this;

    this.table = $("#" + this.id).DataTable({
        ajax: function ajaxWrapper(data, callback) {
            // Handle case where user is on a page that has no records, but records exit.
            // Occurs after deleting all items on a page.
            options.update.call(null, data, function (result) {
                if (result.recordsTotal > 0 && result.data.length === 0) {
                    // Go back a page.
                    var current = table.table.page();
                    if (current > 0) {
                        table.table.page(current - 1);
                        // Get new page information.
                        var info = table.table.page.info();
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
            if (table.all_selected.indexOf(data.id) !== -1) {
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
            table.resize();
        },
        language: {
            paginate: {
                previous: '<i class="material-icons">chevron_left</i>',
                next: '<i class="material-icons">chevron_right</span>'
            },
            info: "_START_-_END_ of _TOTAL_",
            infoEmpty: "",
            lengthMenu: "Rows per page: _MENU_",
            emptyTable: "No replays. Go record some!",
            processing: '<div class="material-spinner">' + 
                '<svg class="spinner" width="35px" height="35px" viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">' +
                    '<circle class="path" fill="none" stroke-width="6" stroke-linecap="round" cx="33" cy="33" r="30"></circle>' +
                '</svg>' +
            '</div>'
        },
        stateSave: -1,
        scrollY: 'auto',
        pagingType: "simple",
        processing: true
    });

    // Add select-all checkbox to header.
    $(this.table.column(0).header())
        .html(Table.select_all_checkbox)
        .addClass('cb-cell');

    // "Select all" checkbox.
    $("#" + table.id + "_wrapper .select-all").change(function() {
        $("#" + table.id + " tbody .selected-checkbox")
            .prop("checked", this.checked)
            .trigger("change");
        updateWhenChecked();
    });

    // Track selected rows across all pages.
    $("#" + this.id + " tbody").on("change", ".selected-checkbox", function () {
        var tr = $(this).closest("tr");
        var replayId = tr.data("id");
        var idx = table.all_selected.indexOf(replayId);
        if (this.checked && idx === -1) {
            table.all_selected.push(replayId);
            tr.addClass('selected');
        } else if (!this.checked) {
            table.all_selected.splice(idx, 1);
            tr.removeClass('selected');
        }
    });

    // Selection behavior.
    $("#" + this.id + " tbody").on("click", ".selected-checkbox", function (evt) {
        var elt = $(this);
        var numChecked = $("#" + table.id + " .selected-checkbox:checked").length;
        var tr = elt.closest("tr");
        if (elt.prop('checked') && evt.shiftKey && numChecked > 1) {
            var boxes = $("#" + table.id + " .selected-checkbox"),
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

    var header = $(options.header.selector);
    // Update table when entry is checked.
    function updateWhenChecked() {
        var rows = $("#" + table.id + " .selected-checkbox").length;
        if (rows === 0) {
            // Select-all checkbox.
            $("#" + table.id + "_wrapper .select-all").prop("disabled", true);
            $("#" + table.id + "_wrapper .select-all").prop("checked", false);
            $("#" + table.id + "_wrapper .select-all").closest('tr').removeClass('selected');

            // Card header.
            header.find(".actions").addClass("hidden");
            header.find(".title").text(options.header.title);
        } else {
            var numChecked = $("#" + table.id + " .selected-checkbox:checked").length;

            // Select-all checkbox.
            $("#" + table.id + "_wrapper .select-all").prop("disabled", false);
            if (numChecked === rows) {
                $("#" + table.id + "_wrapper .select-all").prop("checked", true);
                $("#" + table.id + "_wrapper .select-all").closest('tr').addClass('selected');
            } else {
                $("#" + table.id + "_wrapper .select-all").prop("checked", false);
                $("#" + table.id + "_wrapper .select-all").closest('tr').removeClass('selected');
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
        table.recalcMaxHeight();
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
}

module.exports = Table;

// Material checkbox.
Table.checkbox = '<label><i class="material-icons checked">check_box</i>' +
    '<i class="material-icons unchecked">check_box_outline_blank</i>' +
    '<input type="checkbox" class="selected-checkbox hidden"></label>';

// Select-all checkbox.
Table.select_all_checkbox = '<label><i class="material-icons checked">check_box</i>' +
    '<i class="material-icons unchecked">check_box_outline_blank</i>' +
    '<input type="checkbox" class="select-all hidden"></label>';

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

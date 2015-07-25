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
        ajax: options.update,
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
            emptyTable: "No replays. Go record some!"
        },
        stateSave: -1,
        scrollY: 'auto',
        scrollCollapse: true,
        pagingType: "simple"
    });

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

            // Card header.
            header.find(".actions").addClass("hidden");
            header.find(".title").text(options.header.title);
        } else {
            var numChecked = $("#" + table.id + " .selected-checkbox:checked").length;

            // Select-all checkbox.
            $("#" + table.id + "_wrapper .select-all").prop("disabled", false);
            if (numChecked === rows) {
                $("#" + table.id + "_wrapper .select-all").prop("checked", true);
            } else {
                $("#" + table.id + "_wrapper .select-all").prop("checked", false);
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
    console.log(orderable_columns);
    orderable_columns.addClass("orderable");
    orderable_columns.append("<i class='material-icons sort-icon'>arrow_back</i>");
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
    this.table.ajax.reload(null, false);
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

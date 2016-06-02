var $ = require('jquery');

/**
 * Interface for modal overlay used for showing progress/info on menu
 * for blocking operations.
 * @param {string} selector - the selector to be used for the overlay
 *   conatiner element.
 */
function Overlay(selector) {
    this.$this = $(selector);
    this.selector = selector;
    this.state = {
        progress: null
    };
    this.progress = null;
}

module.exports = Overlay;

/**
 * Display the overlay.
 */
Overlay.prototype.show = function() {
    this.$this.removeClass("hidden");
};

/**
 * Hide the overlay.
 */
Overlay.prototype.hide = function() {
    this.$this.addClass("hidden");
};

/**
 * @typedef {object} OverlayState
 * @property {string} title
 * @property {string} description - html description (above progress bar, to
 *   describe why overlay is present)
 * @property {string} message - html message (below any progress bar, to describe current
 *   actions)
 * @property {bool|number} progress - if true, the progress bar is indeterminate,
 *   otherwise it is initialized and set to the passed value (should be a percentage)
 * @property {array<OverlayAction>} actions - available buttons on the overlay
 */
/**
 * @typedef {object} OverlayAction
 * @property {string} text - text content for the button.
 * @property {Function} action - callback for the button.
 */
/**
 * Set the overlay state.
 * @param {OverlayState} info - the information for the overlay.
 */
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

/**
 * Update the overlay state.
 * @param {OverlayState} info
 */
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
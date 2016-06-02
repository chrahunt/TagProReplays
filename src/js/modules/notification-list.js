var $ = require('jquery');

/**
 * Uses container as a notification holder.
 * @param container {string} - selector for the container element.
 */
function NotificationList(container) {
    this.$container = $(container);
    this.notifications = {};
    this.count = 1;
    this.listeners = [];
}

module.exports = NotificationList;

/**
 * Add element to notification list.
 * @param {string} content- the string contents for the container.
 * @param {string} type - the type of notification, one of primary, success, info, warning, danger
 * @param {bool} dismissible - whether the notification should be dismissible
 * @return {number} - the id for the notification, which can be used for later dismissal.
 */
NotificationList.prototype.add = function(content, type, dismissible) {
    var elt = this._getElt(content, type, dismissible);
    this.listeners.forEach(function (fn) {
        fn();
    });
    return elt;
};

// Remove element.
NotificationList.prototype.remove = function(id) {
    if (!this.exists(id)) return;
    this.notifications[id].remove();
    delete this.notifications[id];
    this.listeners.forEach(function (fn) {
        fn();
    });
};

NotificationList.prototype.exists = function(id) {
    return this.notifications.hasOwnProperty(id);
};

// Add listener to be called on element addition/removal.
NotificationList.prototype.addListener = function(fn) {
    this.listeners.push(fn);
};

// Remove listener.
NotificationList.prototype.removeListener = function(fn) {
    var i = this.listeners.indexOf(fn);
    if (i !== -1) {
        this.listeners.splice(i, 1);
    }
};

// types: primary, success, info, warning, danger
NotificationList.prototype._getElt = function(content, type, dismissible) {
    var id = this.count++;
    var html = "<div class=\"notification bg-" + type + "\">";
    html += "<span>" + content + "</span>";
    if (dismissible) {
        html += "<button type=\"button\" class=\"close\"><span>&times;</span></button>";

    }
    html += "</div>";
    var $elt = $(html);
    if (dismissible) {
        var self = this;
        $elt.find("button").click(function () {
            self.remove(id);
        });
    }
    this.notifications[id] = $elt;
    this.$container.append($elt);
    return id;
};
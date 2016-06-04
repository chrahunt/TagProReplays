//var async = require('async');
var machina = require('machina');
var Messaging = require('./messaging');

var fsm = new machina.Fsm({
    initialize: function (options) {},
    namespace: "background",
    initialState: "start",
    states: {
        start: {
            "subsystem-fail": "broken",
            "db-migrate-failed": "broken",
            "db-migrate": "upgrading",
            "db-open": "active",
            "db-error": "broken"
        },
        broken: {
            "retry": "init",
            "reset": "init"
        },
        upgrading: {
            "db-migrate-err": "broken",
            "db-open": "active"
        },
        active: {
            "import-start": "importing",
            "download-start": "downloading"
        },
        importing: {
            "import-end": "active"
        },
        downloading: {
            "download-end": "active"
        }
    },
    /**
     * Try to send event.
     * @returns {Promise} - resolves if transition completes successfully, rejects otherwise.
     */
    try: function () {
        var self = this;
        var event = arguments[0];
        return new Promise(function (resolve, reject) {
            function nh_cb(e) {
                if (e.inputType === event) {
                    self.off("nohandler", nh_cb);
                    self.off("handled", h_cb);
                    reject();
                }
            }
            function h_cb(e) {
                if (e.inputType === event) {
                    self.off("nohandler", nh_cb);
                    self.off("handled", h_cb);
                    resolve();
                }
            }
            self.on("nohandler", nh_cb);
            self.on("handled", tr_cb);
        });
    }
});

// Logging.
fsm.on("transition", function (e) {
    console.log("Transitioning: [%s] -[%s]-> [%s]", e.fromState, e.action, e.toState);
});

// Messaging.
fsm.on("transition", function (e) {
    Messaging.send("_state_transition", {
        from: e.fromState,
        to: e.toState,
        event: e.action
    });
});

Messaging.listen("_get_state",
function(message, sender, sendResponse) {
    console.log("State requested, current state: %s", fsm.state);
    sendResponse({
        state: fsm.state
    });
});

module.exports = fsm;
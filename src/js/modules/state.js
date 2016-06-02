//var async = require('async');
var machina = require('machina');

var Messaging = require('./messaging');
var Data = require('./data');

var fsm = new machina.Fsm({
    // Initialize subsystems.
    initialize: function (options) {
        var self = this;
        // TODO: Also wait for rendermanager, data
        /*ready().then(function () {
            self.handle("ready");
        }).catch(function (err) {
            // TODO: persist somewhere.
            console.error("Error in initialization: " + err);
            self.handle("broken");
        });*/
        /*async.each([Textures, validate, Data], function (dep, callback) {
            dep.ready.catch(function (err) {
                callback(err);
            }).then(function () {
                callback(null);
            });
        }, function (err) {
            if (!err) {
                self.handle("ready");
            } else {
                console.error("Initialization failed!");
                // TODO: broken.
                self.handle("broken");
            }
        })*/
    },
    namespace: "background",
    initialState: "start",
    states: {
        start: {
            "ready": function () {
                this.transition("init");
            }
        },
        init: {
            _onEnter: function () {
                // TODO: Check for previous db failure.
                Data.init();
            },
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
     * Try event.
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
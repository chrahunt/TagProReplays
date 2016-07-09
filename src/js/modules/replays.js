var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Data = require('./data');
var Messaging = require('./messaging');

Data.init().then(() => {
    console.log("Data initialized.");
});

function Replays() {
  EventEmitter.call(this);
  // Listen for db changes
  // 
}
util.inherits(Replays, EventEmitter);

module.exports = new Replays();

// select multiple replays.
Replays.prototype.select = function(ids) {
  // Throw can't find
  // Else return selection which can have actions done.
  return new Selection(ids);
};

// select 1 replay.
Replays.prototype.get = function(id) {
  return new Replay(id);
};

// ============================================================================
// info
// ============================================================================
// replays + failed
// public api, only active, unmarked
Replays.prototype.count = function() {
  console.log("Replays#count");
};

Replays.prototype.query = function() {
  console.log("Replays#query");
  return Data.getReplayInfoList(args).then((data) => {
    return {
      data: data[1],
      total: data[0],
      filtered: data[0]
    };
  });
};

// ============================================================================
// events
// ============================================================================
// only update when not importing.
this.emit("update");
this.emit("full");

function Selection(ids) {
  this.ids = ids;
}

// ============================================================================
// activities
// ============================================================================
// replays
Selection.prototype.render = function() {
  // Check if rendering/rendered
  // return progress
  return new Promise((resolve, reject) => {
    Messaging.send("renderReplays", {
      ids: this.ids
    }, function (response) {
      // TODO: reject if bad.
      // empty
      // other error
      // already rendering.
      resolve();
    });
  });
};

// replays + failed
Selection.prototype.remove = function() {
  console.log("Selection#remove");
  // check if rendering
  // remove/cancel render if so
  // mark for removal
  // return an undoer
  this._remove();

};

// internal, actual removal.
Selection.prototype._remove = function() {
  Messaging.send("deleteReplays", {
    ids: this.ids
  });
};

// replays + failed
// remove x oldest marked items
Selection.prototype._clean = function() {
  
};

// replays
Replays.prototype.add = function() {
  // check constraints
  // clean up removed
  // add
};

Replays.prototype.import = function(files) {
  // Take files
  // return progress
  // cancel if it would put us over.
};

// replays + failed
Selection.prototype.download = function() {
  console.log("Selection#download");
  return new Promise((resolve, reject) => {
    // TODO: need an a progress id.
    Messaging.send("downloadReplays", { ids: this.ids }, function (response) {
      if (response.failed) {
        reject(response.reason);
      } else {
        resolve(new Progress());
      }
    });
  });
  // return progress
};

// ============================================================================
// Single replay
// ============================================================================
function Replay(id) {
  this.id = id;
}

Replay.prototype.rename = function(new_name) {
  console.log("Replay#rename");
  // validate name is nonempty?
  //
  return Data.renameReplay(this.id, new_name);
};

Replay.prototype.data = function() {

};

function crop() {

}

function save() {
  // Check for render, remove if rendered.

}

function saveAs() {

}

//////////
// ongoing action
//////////

function Activity() {

}

// progress callback
function progress() {

}

// then
function done() {

}

// catch
function error() {

}

function Progress() {
  // inherits eventemitter
  // events:
  // - done
  // - progress
  // - err

}

function Undo() {
  // inherits eventemitter
  // events:
  // - undone
  // - confirmed
}
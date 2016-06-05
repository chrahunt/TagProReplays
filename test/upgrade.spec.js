var Data = require('modules/data');
var Subsystems = require('modules/subsystem');
var convert = require('modules/convert');
var jsonfile = require('jsonfile');
var $ = require('jquery');
var async = require('async');

var files = {
  1: [
    "HOW_TO_WIN_AT_EVENT_HORIZONDATE1429567229815.txt"
  ]
};

function get_replays(version, callback) {
  console.log("Getting version " + version + " replays.");
  async.map(files[version], function (path, callback) {
    $.ajax({
      url: "/fixtures/replays_" + version + "/" + path,
      dataType: "text" 
    }).done(function (data) {
      callback(null, {
        name: path,
        data: data
      });
    }).fail(function (err) {
      callback("Error getting " + path);
    });
  }, function (err, result) {
    if (err) {
      console.log("Error getting version " + version + " replays.");
      callback(err);
    } else {
      console.log("Retrieved " + result.length + " version " + version + " replays.");
      callback(null, result);
    }
  });
}

// Setup function for db v_1
function setup_1(spec) {
  console.log("Setting up for version 1.");

  var openRequest = indexedDB.open("ReplayDatabase");
  openRequest.onupgradeneeded = function (e) {
    var db = e.target.result;
    if (!db.objectStoreNames.contains("positions")) {
      db.createObjectStore("positions", {autoIncrement: true});
    }
    if (!db.objectStoreNames.contains("savedMovies")) {
      db.createObjectStore("savedMovies", {autoIncrement: true});
    }
  };
  return new Promise(function (resolve, reject) {
    openRequest.onsuccess = function (e) {
      console.log("Database opened.");
      
      var db = e.target.result;
      db.onerror = function (e) {
        throw new Error("Database error: ", e);
      };
      // Get and add replays to db.
      get_replays(spec.version, function (err, data) {
        var t = db.transaction(["positions"], "readwrite");
        t.onerror = function () {
          console.log("Transaction error.");
        };
        
        t.onsuccess = function () {
          console.log("Transaction succeeded.");
        };
        var os = t.objectStore("positions");
        console.log("Adding replays.");
        async.eachSeries(data, function (data, callback) {
          var name = data.name;
          var content = data.data;
          console.log("Adding replay " + name + ".");
          var request = os.put(content, name);
          request.onsuccess = function () {
            console.log("Successfully added replay " + name + ".");
            callback();
          };
          request.onerror = function () {
            callback("Error adding " + name);
          };
        }, function (err) {
          if (err) {
            console.log("Error adding replays.");
            reject(err);
          } else {
            console.log("Finished adding replays.");
            db.close();
            resolve();
          }
        });
      });
    };
  });
}

describe('db', function () {
  this.timeout(5000);
  before('setup subsystems', function () {
    Subsystems.add("convert", convert.ready);
    return Subsystems.init();
  });
  
  afterEach(function () {
    // Delete database.
    // Remove all Data listeners.
  });
  
  it('should handle upgrades', function (done) {
    setup_1({
      version: 1,
      replays: 10,
      errors: false
    }).then(function () {
      console.log("Initializing Data");
      Data.init();
    });
    Data.events.on("db:upgrade", function () {
      console.log("db:upgrade");
    });
    Data.events.on("db:open", function () {
      console.log("db:open");
      // check that upgrade occurred
      // check that upgrades occurred correctly.
      done();
    });
    Data.events.on("db:err", function (reason) {
      done(Error("DB Error: " + reason));
    });
  });
});

Data.events.on("db:open", function () {
  console.log("DB opened.");
});

Data.events.on("db:err", function (err) {
  console.log("Error opening db");
});

Data.events.on("db:err:upgrade", function (err) {
  console.log("Error upgrading db");
});

Data.events.on("db:upgrade", function () {
  console.log("Upgrading db");
});

Data.events.on("db:upgrade:progress", function () {
  console.log("Got progress.");
});

/*function got() {
  console.log("got it");
}

var urls = [
  "/schemas/1/definitions.json",
  "/schemas/1/data.json",
  "/schemas/1/player.json",
  "/schemas/2/replay.json",
  "/schemas/2/player.json",
  "/schemas/2/db_info.json",
  "/schemas/2/data.json"
];;

urls.forEach((url) => {
  var r = new XMLHttpRequest();
  r.addEventListener("load", got);
  r.open("GET", url);
  r.send();
});
*/
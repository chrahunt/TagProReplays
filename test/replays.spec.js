/* global describe:false, it:false */
// Testing replay interaction.
var Data = require('modules/data');
var Subsystems = require('modules/subsystem');
var convert = require('modules/convert');

var $ = require('jquery');
var async = require('async');
var Dexie = require('dexie');

var logger = require('modules/logger')('replays.spec');

Dexie.debug = false;
var files = {
  1: [
    "replays1430867339575.txt"
  ]
};

function get_replays(version) {
  logger.info(`Getting version ${version} replays.`);
  return new Promise((resolve, reject) => {
    async.map(files[version], (path, callback) => {
      $.ajax({
        url: "/fixtures/replays_" + version + "/" + path,
        dataType: "text"
      }).done((data) => {
        callback(null, {
          name: path,
          data: data
        });
      }).fail((err) => {
        callback(`Error getting ${path}: ${err}`);
      });
    }, (err, result) => {
      if (err) {
        logger.error(`Error getting version ${version} replays.`);
        reject(err);
      } else {
        logger.info(`Retrieved ${result.length} version ${version} replays`);
        resolve(result);
      }
    });
  });
}

// Setup function for db v_1
function setup_1(spec) {
  logger.info("Setting up for version 1.");
  return Data.init(spec.db_version, false).then(function () {
    return get_replays(spec.replay_version);
  }).then(function (data) {
    console.log("Adding replays.");
    var db = Data.db;
    return db.transaction("rw", db.positions, function () {
      console.log("Starting transaction.");
      return new Dexie.Promise(function (resolve, reject) {
        async.eachSeries(data, function (data, callback) {
          var name = data.name;
          var content = data.data;
          console.log("Adding replay " + name + ".");
          db.positions.add(content, name).then(function () {
            console.log("Successfully added replay " + name + ".");
            callback();
          }).catch(function (err) {
            console.error("Error adding " + name + ", sending error back up.");
            callback(err);
          });
        }, function (err) {
          if (err) {
            console.log("Error adding replays.");
            reject(err);
          } else {
            console.log("Finished adding replays.");
            //db.close();
            resolve();
          }
        });
      });
    });
  });
}

describe('replays', () => {
  it("should import replays correctly", (done) => {

  });
  // Add replay.
  // Rename replay.
  // Delete replay.
  // Render replay.
  // Crop replay.
  // Import replays.
});

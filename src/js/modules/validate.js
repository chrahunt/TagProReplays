var $ = require('jquery');
var imjv = require('is-my-json-valid');

var Barrier = require('./barrier');

/**
 * Holds information for validating a replay. Replay validation is done
 * in two steps:
 * * Validation against the schema - ensures requirements on the
 *   structure and presence of properties are met.
 * * Content validation - verifies semantic integrity, e.g. presence of
 *   properties with specific values and presence of non-required
 *   properties that are required in specific cases.
 * The exported function takes the version to be checked against, the
 * data to check, and any options to be passed to the validator.
 */
/**
 * Manage creation of schema validators and cache for calls.
 */
var ReplayValidator = function(logger) {
  this.logger = logger || console;
  this.validators = {};
};

// Get version for data.
ReplayValidator.prototype.getVersion = function(data) {
  if (!data.hasOwnProperty("version")) {
    return "1";
  } else {
    return data.version;
  }
};

/**
 * @callback ValidationCallback
 * @param {Error} err - Truthy if an error occurred or the replay was
 *   invalid.
 * @param {string} [version] - If the replay is valid, what version it
 *   was validated against.
 */
/**
 * Validate data.
 * @param {*} data - The data to validate, typically going to be the
 *   replay object in question.
 * @param {ValidationCallback} callback - The callback for the result
 *   of validation.
 */
ReplayValidator.prototype.validate = function(data, callback) {
  // Get replay version.
  var version = this.getVersion(data);

  if (!this.validators.hasOwnProperty(version)) {
    callback(new Error("Invalid version, or no validator with that version exists."));
  }
  var validator = this.validators[version];
  if (!validator.ready) {
    setTimeout(function() {
      this.validate(data, callback);
    }.bind(this), 50);
  } else {
    // Schema validation.
    var valid = validator.checkSchema(data, this.logger);
    if (!valid) {
      callback(new Error("Couldn't validate against schema."));
    } else {
      // Requirements validation.
      valid = validator.checker(data, this.logger);
      if (!valid) {
        callback(new Error("Couldn't validate against requirements."));
      } else {
        callback(null, version);
      }
    }
  }
};

// TODO: Specify validator object format.
/**
 * Add a validator to the object.
 * @param {(string|integer)} version - The version the validator applies to.
 * @param {[type]} data [description]
 */
ReplayValidator.prototype.addVersion = function(version, data) {
  var validators = this.validators;
  validators[version] = {
    checker: data.checker,
    ready: false
  };
  // Get schema validator asynchronously.
  data.schemaValidator(function(validate) {
    validators[version].checkSchema = validate;
    validators[version].ready = true;
  });
};

var validator = new ReplayValidator();

function loadSchema(path, main, deps, callback) {
  if (typeof deps == "function") {
    callback = deps;
    deps = [];
  }
  path = chrome.extension.getURL(path);
  var validator = imjv,
      loaded = {},
      mainData,
      loadBarrier = new Barrier();
  // Set remote references after all relevant schemas have been
  // loaded.
  loadBarrier.onComplete(function() {
    var imjvValidate = validator(mainData, {schemas: loaded});
    var validate = function(data, logger) {
      var valid = imjvValidate(data);
      if (!valid) {
        logger.log(imjvValidate.errors);
        return false;
      }
      return true;
    };
    callback(validate);
  });
  // Create validator.
  var names = deps;
  names.forEach(function(name) {
    var id = loadBarrier.start();
    $.getJSON(path + '/' + name, function(data) {
      if (name == main) {
        mainData = data;
      }
      loaded[name] = data;
      loadBarrier.stop(id);
    });
  });
}

validator.addVersion("1", {
  // Returns schema validation function which takes data and a logger
  // and outputs a boolean indicating whether the provided data passes
  // or fails.
  schemaValidator: function(callback) {
    loadSchema("schemas/1", "data.json",
      ["data.json", "player.json", "definitions.json"], callback);
  },
  // Function that checks data against other requirements. Takes the data
  // and a logger.
  checker: function(data, logger) {
    // Validate other aspects of replay.
    // At least one player must exist.
    var playerKeys = Object.keys(data).filter(function(key) {
      return key.search('player') === 0;
    });

    // At least one player must have "me" value.
    if (playerKeys.length === 0) {
      logger.log("No valid players!");
      return false;
    }

    var playerExists = playerKeys.some(function(key) {
      return data[key].me == "me";
    });

    if (!playerExists) {
      logger.log("No player is main player.");
      return false;
    }
    return true;
  }
});

validator.addVersion("2", {
  schemaValidator: function(callback) {
    loadSchema("schemas/2", "replay.json",
      ['data.json', 'db_info.json', 'definitions.json', 'info.json', 'player.json', 'replay.json'], callback);
  },
  checker: function(data, logger) {
    // No players that were not present should be in the data.
    function playerExists(player) {
      return player.name.some(function(name) {
        return name !== null;
      });
    }
    var playerError = false;
    for (var id in data.players) {
      var player = data.players[id];
      playerError = !playerExists(player);
      if (playerError) {
        break;
      }
    }

    if (playerError) {
      logger.log("Unnecessary player object present.");
      return false;
    }

    // TODO: Ensure that all frame arrays are the same length.
    return true;
  }
});

/**
 * Validate a replay against requirements.
 * @param {object} data - The replay data to be tested.
 * @param {Function} callback - The function to receive the result of the validation.
 */
module.exports = function(data, callback) {
  validator.validate(data, callback);
};

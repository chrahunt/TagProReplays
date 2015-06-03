var $ = require('jquery');
var imjv = require('is-my-json-valid');

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
  this.validatorData = [];
  this.loaded = false;
};

/**
 * Initialize the validator. Required before any 
 */
ReplayValidator.prototype.init = function() {
  var self = this;
  this.loaded = Promise.all(self.validatorData.map(function (data) {
    return data.getSchemaValidator().then(function (validate) {
      data.schemaValidator = validate;
      return data;
    });
  })).then(function (data) {
    data.forEach(function (version) {
      self.validators[version.version] = {
        checkSchema: function(data, logger) {
          var valid = this.schemaValidator(data);
          if (!valid) {
            logger.log(this.schemaValidator.errors);
            return false;
          }
          return true;
        },
        schemaValidator: version.schemaValidator,
        checkContent: version.checkContent
      };
    });
  });
};

ReplayValidator.prototype.ready = function() {
  if (!this.loaded) {
    return Promise.reject(new Error("Validator not initialized."));
  } else {
    return this.loaded;
  }
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
 * Validate data.
 * @param {*} data - The data to validate, typically going to be the
 *   replay object in question.
 * @return {Promise} - Resolves to the replay version if valid,
 *   or rejects on error.
 */
ReplayValidator.prototype.validate = function(data) {
  var self = this;
  return new Promise(function (resolve, reject) {
    var version = self.getVersion(data);
    if (!self.loaded) {
      reject("Validator not ready.");
    } else if (!self.validators.hasOwnProperty(version)) {
      reject("Invalid version, or no validator with that version exists.");
    } else {
      var validator = self.validators[version];
      // Schema validation.
      var valid = validator.checkSchema(data, self.logger);
      if (!valid) {
        reject("Couldn't validate against schema.");
      } else {
        // Requirements validation.
        valid = validator.checkContent(data, self.logger);
        if (!valid) {
          reject("Couldn't validate against requirements.");
        } else {
          resolve(version);
        }
      }
    }
  });
};

// TODO: Specify validator object format.
/**
 * Add a validator to the object.
 * @param {(string|integer)} version - The version the validator applies to.
 * @param {[type]} data [description]
 */
ReplayValidator.prototype.addVersion = function(version, data) {
  this.validatorData.push({
    version: version,
    getSchemaValidator: data.schemaValidator,
    checkContent: data.contentValidator
  });
};

var validator = new ReplayValidator();

/**
 * Load JSON from URL.
 * @param {string} path - The path to load the JSON from.
 * @return {Promise} - Resolves to the parsed JSON, or rejects on error.
 */
function getJSON(path) {
  return new Promise(function (resolve, reject) {
    $.getJSON(path, function(data) {
        resolve(data);
    });
  });
}

/**
 * @typedef SchemaOptions
 * @typedef {object}
 * @property {string} path - The relative path to the schema files.
 * @property {string} main - The name of the main file in the array of dependencies
 *   that acts as the top-level schema.
 * @property {Array.<string>} [deps] - An array of the dependency schemas to be loaded.
 */
/**
 * Retrieve the schema.
 * @param {SchemaOptions} opts - Options giving the schema location and its dependencies.
 * @return {Promise} - Promise that resolves to constructed is-my-json-valid validate
 *   function for the schema.
 */
function getSchema(opts) {
  if (!opts.hasOwnProperty("deps")) opts.deps = [];
  var files = [opts.main].concat(opts.deps);
  var schemas = {};
  var main = null;

  return Promise.all(files.map(function (file) {
    return getJSON(opts.path + '/' + file).then(function (data) {
      if (file === opts.main) {
        main = data;
      } else {
        schemas[file] = data;
      }
    });
  })).then(function () {
    return imjv(main, { schemas: schemas });
  });
}

validator.addVersion("1", {
  // Returns schema validation function which takes data and a logger
  // and outputs a boolean indicating whether the provided data passes
  // or fails.
  schemaValidator: function() {
    return getSchema({
      path: "schemas/1",
      main: "data.json",
      deps: ["data.json", "player.json", "definitions.json"]
    });
  },
  // Function that checks data against other requirements. Takes the data
  // and a logger.
  contentValidator: function(data, logger) {
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
  schemaValidator: function() {
    return getSchema({
      path: "schemas/2",
      main: "replay.json",
      deps: ['data.json', 'db_info.json', 'definitions.json', 'info.json', 'player.json', 'replay.json']
    });
  },
  contentValidator: function(data, logger) {
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

validator.init();

/**
 * Validate a replay against requirements.
 * See ReplayValidator.validate.
 */
module.exports = function(data) {
  return validator.validate(data);
};

/**
 * Function that resolves when the validator is ready for synchronous
 * validation.
 * @return {Promise} - Resolves when the validator is ready.
 */
module.exports.ready = validator.ready.bind(validator);

const Ajv = require('ajv');

// Schema loading strategy, override in tests.
exports.load_schema = (target) => {
  let path = chrome.runtime.getURL(target);
  return fetch(path).then((res) => {
    return res.json();
  });
};

const schemas = {
  '1': {
    base: 'schemas/1',
    main: 'main.json',
    deps: ['definitions.json', 'player.json']
  }
};

const semantic_validator = {
  '1': function(replay) {
    this.errors = null;
    // Check that there is at least one player.
    let players = Object.keys(replay).filter(k => k.startsWith('player'));
    if (!players.length) {
      this.errors = 'No players are in the replays.';
      return false;
    }

    // Check that there is only one main player.
    let main_players = players.filter(p => replay[p].me === 'me').length;
    if (main_players !== 1) {
      this.errors =
        `Only 1 main player can be in the replay, ${main_players} found.`;
      return false;
    }

    // Check that all frame-based arrays are the same length.
    const replay_props = ['score'];
    const player_props = ['auth', 'bomb', 'dead', 'degree',
      'draw', 'flag', 'flair', 'grip', 'tagpro', 'team', 'x', 'y'];
    const optional_player_props = ['angle', 'name'];

    let len = replay.clock.length;
    for (let prop of replay_props) {
      let prop_len = replay[prop].length;
      if (prop_len !== len) {
        this.errors =
          `replay.${prop} has a different length (${prop_len}) than the clock (${len})`;
        return false;
      }
    }

    for (let i = 0; i < replay.floorTiles.length; i++) {
      let tile = replay.floorTiles[i];
      let val_len = tile.value.length;
      if (val_len !== len) {
        this.errors =
          `replay.floorTiles[${i}].value has a different length (${val_len}) than the clock (${len})`;
        return false;
      }
    }

    for (let key of players) {
      let player = replay[key];
      for (let prop of player_props) {
        let prop_len = player[prop].length;
        if (prop_len !== len) {
          this.errors =
            `replay.${key}.${prop} has a different length (${prop_len}) than the clock (${len})`;
          return false;
        }
      }
      for (let prop of optional_player_props) {
        let val = player[prop];
        // Optional arrays.
        if (!Array.isArray(val)) continue;
        let prop_len = val.length;
        if (prop_len !== len) {
          this.errors =
            `replay.${key}.${prop} has a different length (${prop_len}) than the clock (${len})`;
          return false;
        }
      }
    }

    return true;
  }
};

function getReplayVersion(replay) {
  // Pre-version replays.
  if (!replay.version) {
    return '1';
  }
  return replay.version;
}

function loadSchema(version) {
  if (!schemas[version])
    return Promise.reject(new Error(`Schemas for version ${version} not found`));
  let version_schema = schemas[version];
  let result = {
    main: null,
    deps: {}
  };
  let grabs = [];
  // Turn it into main: data, deps: {name: data}
  grabs.push(exports.load_schema(`${version_schema.base}/${version_schema.main}`).then((grabbed) => {
    result.main = grabbed;
  }));
  grabs.push(...version_schema.deps.map((name) => {
    return exports.load_schema(`${version_schema.base}/${name}`).then((grabbed) => {
      result.deps[name] = grabbed;
    });
  }));
  return Promise.all(grabs).then(() => {
    return result;
  });
}

class Validator {
  constructor(schemas) {
    this.validators = {};
  }

  /**
   * Returns a Promise that resolves to an object with information on the
   * success or failure of validation. The returned object has keys:
   * - {boolean} failed
   * - {string} code
   * - {string} reason
   * 
   * If there is a problem loading the validator then the Promise will
   * reject.
   */
  validate(replay) {
    let version = getReplayVersion(replay);
    if (!version) {
      return Promise.resolve({
        failed: true,
        code: 'missing version'
      });
    }

    if (this.validators[version]) {
      let validator = this.validators[version];
      let valid = validator.validate(version, replay);
      if (!valid) {
        return Promise.resolve({
          failed: true,
          code: 'schema validation failure',
          reason: validator.errorsText()
        });
      }
      if (version in semantic_validator) {
        let valid = semantic_validator[version](replay);
        if (!valid) {
          return Promise.resolve({
            failed: true,
            code: 'semantic validation failure',
            reason: semantic_validator.errors
          });
        }
      }
      return Promise.resolve({
        failed: false
      });
    }

    return loadSchema(version).then((schemas) => {
      let ajv = new Ajv();
      ajv.addSchema(schemas.main, version);
      for (let name in schemas.deps) {
        ajv.addSchema(schemas.deps[name], name);
      }
      this.validators[version] = ajv;
      return this.validate(replay);
    });
  }
};
let validator = new Validator();
exports.validate = validator.validate.bind(validator);

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const validate = require('modules/validate');

chai.use(chaiAsPromised);
const expect = chai.expect;

// Override schemas to use file path.
validate.load_schema = (target) => {
  return fetch(target).then((res) => res.json());
};

function getReplay(version, name) {
  let path = `fixtures/validate/${version}/${name}.json`;
  return fetch(path).then((res) => {
    return res.text();
  });
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('Version 1 replay validation', function() {
  function test_succeeded(result) {
    expect(result).to.have.all.keys('replay', 'version');
    expect(result.version).to.equal('1');
  }

  function happy_path(name) {
    return getReplay(1, name)
    .then((file) => {
      return validate.validate(JSON.parse(file)).then(test_succeeded);
    });
  }

  it('should validate a replay', function() {
    return happy_path('replays1414027897934');
  });

  describe('should accept old-format powerup identifiers', function() {
    it('for tagpro', function() {
      return happy_path('old-tagproDATE1481331402058');
    });

    it('for rolling bomb', function() {
      return happy_path('old-bombDATE1481331557109');
    });
  });

  describe('should accept new-format powerup identifiers', function() {
    it('for tagpro', function() {
      return happy_path('new-tagproDATE1481329503370');
    });

    it('for rolling bomb', function() {
      return happy_path('new-bombDATE1481330124869');
    });
  });

  it('should accept a replay with old-format chats', function() {
    return happy_path('replays1414027897934');
  });

  let template;
  // Set up template for negative test cases.
  before(function() {
    return getReplay(1, 'new-chatsDATE1481243504420').then((file) => {
      template = JSON.parse(file);
    });
  });

  it('should accept a replay with group id', function() {
    return happy_path('newcompte-chatsDATE1481243504420');
  });

  it('should accept a replay with new-format chats', function() {
    return validate.validate(template).then(test_succeeded);
  });

  it('should reject a replay with no recording player', function() {
    let replay = clone(template);
    let players = Object.keys(replay).filter(k => k.startsWith('player'));
    for (let player of players) {
      replay[player].me = 'other';
    }
    return expect(validate.validate(replay))
      .to.eventually.be.rejectedWith(Error, /player/);
  });

  describe('checks for the attribute', function() {
    let required = ['chat', 'splats', 'bombs', 'spawns', 'map', 'wallMap',
      'floorTiles', 'score', 'clock'];
    for (let attr of required) {
      it(attr, function() {
        let replay = clone(template);
        delete replay[attr];
        return expect(validate.validate(replay))
          .to.eventually.be.rejectedWith(Error, new RegExp(attr));
      });
    }
  });

  describe('checks players for the attribute', function() {
    let required = ['auth', 'name', 'x', 'y'];
    for (let attr of required) {
      it(attr, function() {
        let replay = clone(template);
        let player = Object.keys(template).find(v => v.startsWith('player'));
        delete replay[player][attr];
        return expect(validate.validate(replay))
          .to.eventually.be.rejectedWith(Error, new RegExp(attr));
      });
    }
  });

  it('should reject a replay without any players', function() {
    let replay = clone(template);
    for (let key in replay) {
      if (key.startsWith('player')) {
        delete replay[key];
      }
    }
    return expect(validate.validate(replay))
      .to.eventually.be.rejectedWith(Error, /player/);
  });

  describe('checks frame arrays in the main replay data', function() {
    it('for game score', function() {
      let replay = clone(template);
      replay.score.pop();
      return expect(validate.validate(replay))
        .to.eventually.be.rejectedWith(Error, /length/);
    });

    it('for floor tiles', function() {
      let replay = clone(template);
      replay.floorTiles[0].value.pop();
      return expect(validate.validate(replay))
        .to.eventually.be.rejectedWith(Error, /length/);
    });
  });

  describe('checks the frame array length of player property', function() {
    let players;
    let player_id;
    let id = 0;
    before(function() {
      players = Object.keys(template).filter(k => k.startsWith('player'));
    });
    beforeEach(function() {
      player_id = players[id];
      id = (id + 1) % players.length;
    });
    const player_props = ['auth', 'bomb', 'dead', 'degree', 'draw', 'flag',
      'flair', 'grip', 'tagpro', 'team', 'x', 'y'];
    // Optionally present.
    const optional_player_props = ['angle'];
    // Optionally arrays.
    const optional_array_player_props = ['name'];
    for (let prop of player_props) {
      it(prop, function() {
        let replay = clone(template);
        replay[player_id][prop].pop();
        return expect(validate.validate(replay))
          .to.eventually.be.rejectedWith(Error, /length/);
      });
    }

    for (let prop of optional_player_props) {
      it(`${prop} not existing`, function() {
        let replay = clone(template);
        delete replay[player_id][prop];
        return validate.validate(replay).then(test_succeeded);
      });

      it(`${prop} as an array`, function() {
        let replay = clone(template);
        replay[player_id][prop] = [];
        return expect(validate.validate(replay))
          .to.eventually.be.rejectedWith(Error, /length/);
      });
    }

    for (let prop of optional_array_player_props) {
      it(`${prop} as a non-array`, function() {
        let replay = clone(template);
        replay[player_id][prop] = "test";
        return validate.validate(replay).then(test_succeeded);
      });

      it(`${prop} as an array`, function() {
        let replay = clone(template);
        replay[player_id][prop] = [];
        return expect(validate.validate(replay))
          .to.eventually.be.rejectedWith(Error, /length/);
      });
    }
  });

  it('should accept a replay with up to three values in gameEndsAt', function() {
    return happy_path('tpr-191');
  });

  it('should accept replays with objects');
});

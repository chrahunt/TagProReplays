const expect = require('chai').expect;
const validate = require('../src/js/modules/validate');
const fs = require('fs');

// Override schemas to use file path.
validate.load_schema = (target) => {
  let file = fs.readFileSync(`src/${target}`, { encoding: 'utf-8' });
  return parseJSON(file);
}

function parseJSON(json) {
  return new Promise((resolve, reject) => {
    try {
      let result = JSON.parse(json);
      resolve(result);
    } catch(e) {
      reject(e);
    }
  });
}

function getReplay(version, name) {
  return `test/fixtures/validate/${version}/${name}.json`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('Version 1 replay validation', function() {
  it('should validate a replay', function() {
    let path = getReplay(1, 'replays1414027897934');
    let file = fs.readFileSync(path, { encoding: 'utf-8' });
    return validate.validate(JSON.parse(file)).then((result) => {
      expect(result).to.not.have.any.keys('code', 'reason');
      expect(result.failed).to.be.false;
    });
  });

  describe('should accept old-format powerup identifiers', function() {
    it('for tagpro', function() {
      let path = getReplay(1, 'old-tagproDATE1481331402058');
      let file = fs.readFileSync(path, { encoding: 'utf-8' });
      return validate.validate(JSON.parse(file)).then((result) => {
        expect(result).to.not.have.any.keys('code', 'reason');
        expect(result.failed).to.be.false;
      });
    });

    it('for rolling bomb', function() {
      let path = getReplay(1, 'old-bombDATE1481331557109');
      let file = fs.readFileSync(path, { encoding: 'utf-8' });
      return validate.validate(JSON.parse(file)).then((result) => {
        expect(result).to.not.have.any.keys('code', 'reason');
        expect(result.failed).to.be.false;
      });
    });
  });

  describe('should accept new-format powerup identifiers', function() {
    it('for tagpro', function() {
      let path = getReplay(1, 'new-tagproDATE1481329503370');
      let file = fs.readFileSync(path, { encoding: 'utf-8' });
      return validate.validate(JSON.parse(file)).then((result) => {
        expect(result).to.not.have.any.keys('code', 'reason');
        expect(result.failed).to.be.false;
      });
    });

    it('for rolling bomb', function() {
      let path = getReplay(1, 'new-bombDATE1481330124869');
      let file = fs.readFileSync(path, { encoding: 'utf-8' });
      return validate.validate(JSON.parse(file)).then((result) => {
        expect(result).to.not.have.any.keys('code', 'reason');
        expect(result.failed).to.be.false;
      });
    });
  });

  it('should accept a replay with old-format chats', function() {
    let path = getReplay(1, 'replays1414027897934');
    let file = fs.readFileSync(path, { encoding: 'utf-8' });
    return validate.validate(JSON.parse(file)).then((result) => {
      expect(result).to.not.have.any.keys('code', 'reason');
      expect(result.failed).to.be.false;
    });
  });

  let path = getReplay(1, 'new-chatsDATE1481243504420');
  let file = fs.readFileSync(path, { encoding: 'utf-8' });
  let template = JSON.parse(file);
  it('should accept a replay with new-format chats', function() {
    return validate.validate(template).then((result) => {
      expect(result).to.not.have.any.keys('code', 'reason');
      expect(result.failed).to.be.false;
    });
  });

  it('should reject a replay with no recording player', function() {
    let replay = clone(template);
    let players = Object.keys(replay).filter(k => k.startsWith('player'));
    for (let player of players) {
      replay[player].me = 'other';
    }
    return validate.validate(replay).then((result) => {
      expect(result).to.have.all.keys('code', 'failed', 'reason');
      expect(result.failed).to.be.true;
      expect(result.reason).to.contain('player');
    });
  });

  describe('checks for the attribute', function() {
    let required = ['chat', 'splats', 'bombs', 'spawns', 'map', 'wallMap',
      'floorTiles', 'score', 'clock'];
    for (let attr of required) {
      let replay = clone(template);
      delete replay[attr];
      it(attr, function() {
        return validate.validate(replay).then((result) => {
          expect(result).to.have.all.keys('code', 'failed', 'reason');
          expect(result.failed).to.be.true;
          expect(result.reason).to.contain(attr);
        });
      });
    }
  });

  describe('checks players for the attribute', function() {
    let required = ['auth', 'name', 'x', 'y'];
    let player = Object.keys(template).find(v => v.startsWith('player'));
    for (let attr of required) {
      let replay = clone(template);
      delete replay[player][attr];
      it(attr, function() {
        return validate.validate(replay).then((result) => {
          expect(result).to.have.all.keys('code', 'failed', 'reason');
          expect(result.failed).to.be.true;
          expect(result.reason).to.contain(attr);
        });
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
    return validate.validate(replay).then((result) => {
      expect(result).to.have.all.keys('code', 'failed', 'reason');
      expect(result.failed).to.be.true;
      expect(result.reason).to.contain('player');
    });
  });

  describe('checks frame arrays in the main replay data', function() {
    it('for game score', function() {
      let replay = clone(template);
      replay.score.pop();
      return validate.validate(replay).then((result) => {
        expect(result).to.have.all.keys('code', 'failed', 'reason');
        expect(result.failed).to.be.true;
        expect(result.reason).to.contain('length');
      });
    });

    it('for floor tiles', function() {
      let replay = clone(template);
      replay.floorTiles[0].value.pop();
      return validate.validate(replay).then((result) => {
        expect(result).to.have.all.keys('code', 'failed', 'reason');
        expect(result.failed).to.be.true;
        expect(result.reason).to.contain('length');
      });
    });
  });

  describe('checks the frame array length of player property', function() {
    let players = Object.keys(template).filter(k => k.startsWith('player'));
    const player_props = ['auth', 'bomb', 'dead', 'degree', 'draw', 'flag',
      'flair', 'grip', 'tagpro', 'team', 'x', 'y'];
    // Optionally present.
    const optional_player_props = ['angle'];
    // Optionally arrays.
    const optional_array_player_props = ['name'];
    let id = 0;
    for (let prop of player_props) {
      let key = players[id];
      id = (id + 1) % players.length;
      it(prop, function() {
        let replay = clone(template);
        replay[key][prop].pop();
        return validate.validate(replay).then((result) => {
          expect(result).to.have.all.keys('code', 'failed', 'reason');
          expect(result.failed).to.be.true;
          expect(result.reason).to.contain('length');
        });
      });
    }

    for (let prop of optional_player_props) {
      let key = players[id];
      id = (id + 1) % players.length;
      it(`${prop} not existing`, function() {
        let replay = clone(template);
        delete replay[key][prop];
        return validate.validate(replay).then((result) => {
          expect(result).to.have.all.keys('failed');
          expect(result.failed).to.be.false;
        });
      });

      it(`${prop} as an array`, function() {
        let replay = clone(template);
        replay[key][prop] = [];
        return validate.validate(replay).then((result) => {
          expect(result).to.have.all.keys('code', 'failed', 'reason');
          expect(result.failed).to.be.true;
          expect(result.reason).to.contain('length');
        });
      });
    }

    for (let prop of optional_array_player_props) {
      let key = players[id];
      id = (id + 1) % players.length;
      it(`${prop} as a non-array`, function() {
        let replay = clone(template);
        replay[key][prop] = "test";
        return validate.validate(replay).then((result) => {
          expect(result).to.have.all.keys('failed');
          expect(result.failed).to.be.false;
        });
      });

      it(`${prop} as an array`, function() {
        let replay = clone(template);
        replay[key][prop] = [];
        return validate.validate(replay).then((result) => {
          expect(result).to.have.all.keys('code', 'failed', 'reason');
          expect(result.failed).to.be.true;
          expect(result.reason).to.contain('length');
        });
      });
    }
  });
});

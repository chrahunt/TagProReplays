const filter = require('modules/filter');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const expect = chai.expect;

// load example metadata
function load_metadata(metadata_file) {
  let path = `fixtures/filter/${metadata_file}.json`;
  return fetch(path).then((res) => res.json());
}

load_metadata("example_metadata").then((metadata) => {
  

  describe('filter test', () => {

    it('should return all results with empty query', () => {
      let results = filter(metadata, "");
      expect(results).to.eventually.have.lengthOf(22);
    });

    // map tests
    it('should filter by single map', () => {    
      let results = filter(metadata, "map:Gumbo");
      expect(results).to.eventually.have.lengthOf(4);
    });

    it('should partial match map insensitive to case', () => {
      let results = filter(metadata, "map:gum");
      expect(results).to.eventually.have.lengthOf(4);
    });

    it('should filter by multiple maps', () => {
      let results = filter(metadata, "map:Gumbo map:Pilot");
      expect(results).to.eventually.have.lengthOf(5);  
    })

    // player tests
    it('should filter by single player', () => {
      let results = filter(metadata, "player:ballparts");
      expect(results).to.eventually.have.lengthOf(9);
    });

    it('should partial match player insensitive to case', () => {
      let results = filter(metadata, "player:BALLP");
      expect(results).to.eventually.have.lengthOf(9);
    });

    it('should filter by multiple players', () => {
      let results = filter(metadata, "player:ballparts player:Some");
      expect(results).to.eventually.have.lengthOf(7);
    });

    // name tests
    it('should filter by single name term', () => {
      let results = filter(metadata, "name:replay");
      expect(results).to.eventually.have.lengthOf(15);
    });

    it('should partial match name insensitive to case', () => {
      let results = filter(metadata, "name:NUMB");
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should filter by multiple name terms', () => {
      let results = filter(metadata, "name:number name:button name:pup");
      expect(results).to.eventually.have.lengthOf(5);
    });

    // free text tests
    it('should filter by single non-keyword terms', () => {
      let results = filter(metadata, "IRON");
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should partial match text insensitive to case', () => {
      let results = filter(metadata, "iro");
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should filter by multiple non-keyword terms', () => {
      let results = filter(metadata, "IRON FILTER");
      expect(results).to.eventually.have.lengthOf(2);
    });

    // exclusion tests
    it('should exclude single keyword terms', () => {
      let results1 = filter(metadata, "-map:Gumbo");
      expect(results1).to.eventually.have.lengthOf(18);

      let results2 = filter(metadata, "-player:ballparts");
      expect(results2).to.eventually.have.lengthOf(13);

      let results3 = filter(metadata, "-name:replay");
      expect(results3).to.eventually.have.lengthOf(7);
    });

    it('should exclude multiple keyword terms', () => {
      let results = filter(metadata, '-map:Platypus -player:ballparts');
      expect(results).to.eventually.have.lengthOf(11);
    });

    it('should exclude single non-keyword terms', () => {
      let results = filter(metadata, "-IRON");
      expect(results).to.eventually.have.lengthOf(19);
    });

    it('should exclude multiple non-keyword terms', () => {
      let results = filter(metadata, "-IRON -ballparts");
      expect(results).to.eventually.have.lengthOf(11);
    });

    // combinations/other
    it('should deal with quotes properly', () => {
      let results = filter(metadata, '"Some Ball 4"');
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should combine include and exclude terms', () => {
      let results = filter(metadata, "player:ballparts -map:Smirk");
      expect(results).to.eventually.have.lengthOf(6);
    });

  });
});




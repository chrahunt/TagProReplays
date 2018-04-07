const Filter = require('modules/filter');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const expect = chai.expect;

// load example metadata
function load_metadata(metadata_file) {
  let path = `fixtures/filter/${metadata_file}.json`;
  return fetch(path).then((res) => res.json());
};

load_metadata("example_metadata").then((metadata) => {
  

  describe('filter test', () => {

    it('should return all results with empty query', () => {
      let results = new Filter(metadata, "").filter();
      expect(results).to.eventually.have.lengthOf(22);
    });

    // map tests
    it('should filter by single map', () => {    
      let results = new Filter(metadata, "map:Gumbo").filter();
      expect(results).to.eventually.have.lengthOf(4);
    });

    it('should partial match map insensitive to case', () => {
      let results = new Filter(metadata, "map:gum").filter();
      expect(results).to.eventually.have.lengthOf(4);
    });

    it('should filter by multiple maps', () => {
      let results = new Filter(metadata, "map:Gumbo map:Pilot").filter();
      expect(results).to.eventually.have.lengthOf(5);  
    })

    // player tests
    it('should filter by single player', () => {
      let results = new Filter(metadata, "player:ballparts").filter();
      expect(results).to.eventually.have.lengthOf(9);
    });

    it('should partial match player insensitive to case', () => {
      let results = new Filter(metadata, "player:BALLP").filter();
      expect(results).to.eventually.have.lengthOf(9);
    });

    it('should filter by multiple players', () => {
      let results = new Filter(metadata, "player:ballparts player:Some").filter();
      expect(results).to.eventually.have.lengthOf(7);
    });

    // name tests
    it('should filter by single name term', () => {
      let results = new Filter(metadata, "name:replay").filter();
      expect(results).to.eventually.have.lengthOf(15);
    });

    it('should partial match name insensitive to case', () => {
      let results = new Filter(metadata, "name:NUMB").filter();
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should filter by multiple name terms', () => {
      let results = new Filter(metadata, "name:number name:button name:pup").filter();
      expect(results).to.eventually.have.lengthOf(5);
    });

    // free text tests
    it('should filter by single non-keyword terms', () => {
      let results = new Filter(metadata, "IRON").filter();
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should partial match text insensitive to case', () => {
      let results = new Filter(metadata, "iro").filter();
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should filter by multiple non-keyword terms', () => {
      let results = new Filter(metadata, "IRON FILTER").filter();
      expect(results).to.eventually.have.lengthOf(2);
    });

    // exclusion tests
    it('should exclude single keyword terms', () => {
      let results1 = new Filter(metadata, "-map:Gumbo").filter();
      expect(results1).to.eventually.have.lengthOf(18);

      let results2 = new Filter(metadata, "-player:ballparts").filter();
      expect(results2).to.eventually.have.lengthOf(13);

      let results3 = new Filter(metadata, "-name:replay").filter();
      expect(results3).to.eventually.have.lengthOf(7);
    });

    it('should exclude multiple keyword terms', () => {
      let results = new Filter(metadata, '-map:Platypus -player:ballparts').filter();
      expect(results).to.eventually.have.lengthOf(11);
    });

    it('should exclude single non-keyword terms', () => {
      let results = new Filter(metadata, "-IRON").filter();
      expect(results).to.eventually.have.lengthOf(19);
    });

    it('should exclude multiple non-keyword terms', () => {
      let results = new Filter(metadata, "-IRON -ballparts").filter();
      expect(results).to.eventually.have.lengthOf(11);
    });

    // combinations/other
    it('should deal with quotes properly', () => {
      let results = new Filter(metadata, '"Some Ball 4"').filter();
      expect(results).to.eventually.have.lengthOf(3);
    });

    it('should combine include and exclude terms', () => {
      let results = new Filter(metadata, "player:ballparts -map:Smirk").filter();
      expect(results).to.eventually.have.lengthOf(6);
    });

  });
});




const filter = require('modules/filter');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const expect = chai.expect;

function load_data(data_file) {
  let path = `fixtures/filter/${data_file}.json`;
  return fetch(path).then((res) => res.json());
}

load_data('example_metadata').then(metadata => {
  load_data('test_data_file').then(testData => {

    describe('filter test', () => {
      testData.forEach(test => {
        it(`should ${test.name}`, () => {
          filter(metadata, test.query)
            .then(results => {
              let resultsIDs = results.map(result => result.id);
              expect(resultsIDs).to.eql(test.expected);
            });
        });
      });
    });
  });
});

const filter = require('modules/filter');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const expect = chai.expect;

// load example metadata
function load_data(data_file) {
  let path = `fixtures/filter/${data_file}.json`;
  return fetch(path).then((res) => res.json());
}

const metadataPromise = load_data('example_metadata');
const testDataPromise = load_data('test_data_file');

Promise.all([metadataPromise, testDataPromise], (dataArray) => {
  const metadata = dataArray[0];
  const testData = dataArray[1];

  describe('filter test', () => {

    testData.forEach(test => {
      it(`should ${test.name}`, () => {
        filter(metadata, test.query)
          .then(results => {
            let resultsIDs = results.map(result => result.id);
            expect(resultsIDs).to.deep.equal(test.expected);
          });
      });
    });
  });
});


// This script generates test data for the filter module's tests.
// To run, call:
// node create_filter_test_data.js
// 
// results will be printed to stdout

const fs = require('fs');
const filter = require('../src/js/modules/filter');

const inputDataFile = '../test/fixtures/filter/test_data_generation_file.json';
const input = JSON.parse(fs.readFileSync(inputDataFile, 'utf8'));

const metadataFile = '../test/fixtures/filter/example_metadata.json';
const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));

const results = [];

async function getResults(metadata, item) {
  let results = await filter(metadata, item.query);
  item.expected = results.map(result => result.id).sort();
  return item;
}

input.forEach((item, i) => {
  results.push(getResults(metadata, item));
});

Promise.all(results).then(output => console.log(JSON.stringify(output)));

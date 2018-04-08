const parser = require('search-query-parser');


/**
* filters metadata array based on search query
* @param {Array<object>} metadata
* @param {string} query - query string is composed of space-delimited terms, each 
*     of which may be prepended with a {keyword + ":"} to designate a keyword-specific
*     search and/or a hyphen to indicate a NOT search (exclude replays that match that
*     term). These terms are parsed prior to being used to filter. 
* @returns {Promise<Array<object>>}
*/
function filter(metadata, query) {
  const keywords = ['map', 'player', 'name'];
  return new Promise((resolve, reject) => {
    let queryObject = parser.parse(query, {keywords: keywords});
    if (queryObject === '') return resolve(metadata);
  
    queryObject = formatQueryObject(queryObject, keywords);

    let results = metadata.filter(filterReplay.bind(this, queryObject));
    return resolve(results);
  });
}

/**
* flatten individual replay's metadata's team arrays into single 'player' string
* @param {object} replayMetadata
* @returns {object}
*/
function flattenPlayers(replayMetadata) {
  replayMetadata.player = [];
  if (replayMetadata.red_team) replayMetadata.player = replayMetadata.player.concat(replayMetadata.red_team);
  if (replayMetadata.blue_team) replayMetadata.player = replayMetadata.player.concat(replayMetadata.blue_team);
  replayMetadata.player = replayMetadata.player.join(' ');
  return replayMetadata;
}

/**
* function to be used in filter method
* @param {object} queryObject
* @param {object} replayMetadata
* @returns {boolean}
*/
function filterReplay(queryObject, replayMetadata) {
  let flatMetadata = flattenPlayers(replayMetadata);
  let q = queryObject;
  
  // handle excludes
  if (q.exclude) {  
    let excluded = Object.keys(q.exclude).some(item => {
      return q.exclude[item].some(excludedQuery => {
        return flatMetadata[item].toLowerCase().includes(excludedQuery);
      });
    });
    if (excluded) return false;
  }

  // handle maps - handled as OR, so matching any is acceptable
  if (q.map) {
    let matchedMap = q.map.some(mapQuery => {
      return flatMetadata.map.toLowerCase().includes(mapQuery);
    });
    if (!matchedMap) return false;
  }

  // handle players - handled as AND, so must match all
  if (q.player) {
    let matchedPlayer = q.player.every(playerQuery => {
      return flatMetadata.player.toLowerCase().includes(playerQuery);
    });
    if (!matchedPlayer) return false;
  }

  // handle name - handled as OR, so matching any is acceptable
  if (q.name) {
    let matchedName = q.name.some(nameQuery => {
      return flatMetadata.name.toLowerCase().includes(nameQuery);
    });
    if (!matchedName) return false;
  }

  // handle free text - terms will be split by white space, unless within double quotes.
  // this will handle exclusions in free text as well
  // They are then treated as AND, so all must match
  if (q.text) {
    let allText = `${flatMetadata.map} ${flatMetadata.name} ${flatMetadata.player}`.toLowerCase();
    let textTerms = formatText(q.text);

    let excludedText = textTerms.exclude.some(term => {
      return allText.includes(term);
    });
    if (excludedText) return false;

    let matchedText = textTerms.include.every(term => {
      return allText.includes(term);
    });
    if (!matchedText) return false;
  }

  return true;
}

/**
* parses and formats free text terms from a query
* @param {string} text
* @returns {object}
*/
function formatText(text) {

  // quoted search terms preceded by a hyphen
  let quotedNegatives = text.match(/-".*?"/g) || [];
  quotedNegatives = quotedNegatives.map(term => {
    text = text.replace(term, '');
    return term.replace(/"|^-/g, '');
  });

  // other quoted search terms
  let quotedTerms = text.match(/".*?"/g) || [];
  quotedTerms = quotedTerms.map(term => {
    text = text.replace(term, '');
    return term.replace(/"/g, '');
  });

  const tokens = text.match(/\S+/g) || [];


  // non-quoted search terms preceded by hyphen
  // should not identify terms containing hyphens in any but the first position
  const negativeTerms = tokens
    .filter(s => s.startsWith('-'))
    .map(s => s.slice(1))
    .concat(quotedNegatives);

  // non-quoted search terms not preceded by a hyphen
  const terms = tokens
    .filter(s => !s.startsWith('-'))
    .concat(quotedTerms);

  return {include: terms, exclude: negativeTerms};
}

/**
* format single element of an object
* specifically, convert string to array and 
* all strings to lower case.
* @param {*} item
* @returns {Array<string>}
*/
function format(item) {
  if (typeof(item) === 'string') item = [item];
  return item.map((element) => { return element.toLowerCase() });
}

/**
* makes results of parser.parse() easier to use
* specifically, it converts singular strings to one-member arrays
* and converts all strings to lower case.
*
* @param {object} queryObject
* @param {Array<string>} keywords
* @returns {object} formatted query object
*/
function formatQueryObject(queryObject, keywords) {
  let q = queryObject;
  if (typeof(q) === 'string') return {text: q.toLowerCase()};
  if (q.text) q.text = q.text.toLowerCase();

  keywords.forEach((keyword) => {
    if (typeof(q[keyword]) !== 'undefined') 
      q[keyword] = format(q[keyword]);
    if (q.exclude && typeof(q.exclude[keyword]) !== 'undefined')
      q.exclude[keyword] = format(q.exclude[keyword]);
  });

  return q;
}

module.exports = filter;
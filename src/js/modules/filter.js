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
    if (queryObject === "") return resolve(metadata);
  
    if (typeof(queryObject) === "string") queryObject = {text: queryObject};

    let results = metadata.filter(filterReplay.bind(this, queryObject));
    return resolve(results);
  });
}

/**
* flatten individual replay's metadata's team arrays into single 'player' string
* and combine team, map, and name into single space-delimitted string
* @param {object} replayMetadata
* @returns {object}
*/
function flatten(replayMetadata) {
  replayMetadata.player = [];
  if (replayMetadata.red_team) replayMetadata.player = replayMetadata.player.concat(replayMetadata.red_team);
  if (replayMetadata.blue_team) replayMetadata.player = replayMetadata.player.concat(replayMetadata.blue_team);
  replayMetadata.player = replayMetadata.player.join(' ');
  replayMetadata.text = `${replayMetadata.map} ${replayMetadata.name} ${replayMetadata.player}`; // makes searching all text simpler
  return replayMetadata;
}

/**
* function to be used in filter method
* @param {object} queryObject
* @param {object} replayMetadata
* @returns {boolean}
*/
function filterReplay(queryObject, replayMetadata) {
  let flatMetadata = flatten(replayMetadata);
  let q = queryObject;
  
  // handle excludes
  if (q.exclude) {  
    let excluded = Object.keys(q.exclude).some(item => {
      if (typeof(q.exclude[item]) === "string") 
        q.exclude[item] = [q.exclude[item]];
      return q.exclude[item].some(excludedQuery => {
        return flatMetadata[item].toLowerCase().includes(excludedQuery.toLowerCase());
      });
    });
    if (excluded) return false;
  }

  // handle maps - handled as OR, so matching any is acceptable
  if (q.map) {
    if (typeof(q.map) === "string") q.map = [q.map];
    let matchedMap = q.map.some(mapQuery => {
      return flatMetadata.map.toLowerCase().includes(mapQuery.toLowerCase());
    });
    if (!matchedMap) return false;
  }

  // handle players - handled as AND, so must match all
  if (q.player) {
    if (typeof(q.player) === "string") q.player = [q.player];
    let matchedPlayer = q.player.every(playerQuery => {
      return flatMetadata.player.toLowerCase().includes(playerQuery.toLowerCase());
    });
    if (!matchedPlayer) return false;
  }

  // handle name - handled as OR, so matching any is acceptable
  if (q.name) {
    if (typeof(q.name) === "string") q.name = [q.name];
    let matchedName = q.name.some(nameQuery => {
      return flatMetadata.name.toLowerCase().includes(nameQuery.toLowerCase());
    });
    if (!matchedName) return false;
  }

  // handle free text - terms will be split by white space, unless within double quotes.
  // this will handle exclusions in free text as well
  // They are then treated as AND, so all must match
  if (q.text) {
    let textTerms = formatText(q.text);

    let excludedText = textTerms.exclude.some(term => {
      return flatMetadata.text.toLowerCase().includes(term.toLowerCase());
    });
    if (excludedText) return false;

    let matchedText = textTerms.include.every(term => {
      return flatMetadata.text.toLowerCase().includes(term.toLowerCase());
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

  // non-quoted search terms preceded by hyphen
  // should not identify terms containing hyphens in any but the first position
  let negativeTerms = text.match(/^-\S*(?=\s)| -\S*(?=\s)|^-\S*$| -\S*$/g) || [];
  negativeTerms = negativeTerms.map(term => {
    text = text.replace(term, '');
    return term.replace(/\s/g, '').replace(/^-/g, '');
  }).concat(quotedNegatives);

  // non-quoted search terms not preceded by a hyphen
  let terms = quotedTerms.concat(text.match(/\S+/g) || []);

  return {include: terms, exclude: negativeTerms};
}

module.exports = filter;
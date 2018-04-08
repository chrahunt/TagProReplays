const parser = require('search-query-parser');


/**
* metadata from get_all_replays_info()
* query is literal search query string
*/
function filter(metadata, query) {
  const keywords = ['map', 'player', 'name'];
  return new Promise((resolve, reject) => {

    try {
      let queryObject = parser.parse(query, {keywords: keywords});
      if(queryObject === "") resolve(metadata);
    
      if(typeof(queryObject) === "string") queryObject = {text: queryObject};


      let results = metadata.filter(filterReplay.bind(this, queryObject));
      if(!results) reject();
      resolve(results);
    } catch(err) {
      reject(err);
    }
    
  });
}

/**
* flatten individual replay's metadata's team arrays into single 'player' string
*/
function flatten(replayMetadata) {
  replayMetadata.player = [];
  if(replayMetadata.red_team) replayMetadata.player = replayMetadata.player.concat(replayMetadata.red_team);
  if(replayMetadata.blue_team) replayMetadata.player = replayMetadata.player.concat(replayMetadata.blue_team);
  replayMetadata.player = replayMetadata.player.join(' ');
  replayMetadata.text = `${replayMetadata.map} ${replayMetadata.name} ${replayMetadata.player}`; // makes searching all text simpler
  return replayMetadata;
}

/**
* function to be used in filter method
*/
function filterReplay(queryObject, replayMetadata) {
  let flatMetadata = flatten(replayMetadata);
  let matched = true;
  
  // handle excludes
  if(queryObject.exclude) {  
    let excluded = Object.keys(queryObject.exclude).some(item => {
      if(typeof(queryObject.exclude[item]) === "string") 
        queryObject.exclude[item] = [queryObject.exclude[item]];
      return queryObject.exclude[item].some(excludedQuery => {
        return flatMetadata[item].toLowerCase().includes(excludedQuery.toLowerCase());
      });
    });
    if(excluded) return false;
  }

  // handle maps - handled as OR, so matching any is acceptable
  if(queryObject.map) {
    if(typeof(queryObject.map) === "string") queryObject.map = [queryObject.map];
    let matchedMap = queryObject.map.some(mapQuery => {
      return flatMetadata.map.toLowerCase().includes(mapQuery.toLowerCase());
    });
    if(!matchedMap) matched = false;
  }

  // handle players - handled as AND, so must match all
  if(queryObject.player) {
    if(typeof(queryObject.player) === "string") queryObject.player = [queryObject.player];
    let matchedPlayer = queryObject.player.every(playerQuery => {
      return flatMetadata.player.toLowerCase().includes(playerQuery.toLowerCase());
    });
    if(!matchedPlayer) matched = false;
  }

  // handle name - handled as OR, so matching any is acceptable
  if(queryObject.name) {
    if(typeof(queryObject.name) === "string") queryObject.name = [queryObject.name];
    let matchedName = queryObject.name.some(nameQuery => {
      return flatMetadata.name.toLowerCase().includes(nameQuery.toLowerCase());
    });
    if(!matchedName) matched = false;
  }

  // handle free text - terms will be split by white space, unless within double quotes.
  // this will handle exclusions in free text as well
  // They are then treated as AND, so all must match
  if(queryObject.text) {
    let textTerms = formatText(queryObject.text);

    let excludedText = textTerms.exclude.some(term => {
      return flatMetadata.text.toLowerCase().includes(term.toLowerCase());
    });
    if(excludedText) return false;

    let matchedText = textTerms.include.every(term => {
      return flatMetadata.text.toLowerCase().includes(term.toLowerCase());
    });
    if(!matchedText) matched = false;
  }

  return matched;
}

/**
* parses and formats free text terms from a query
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
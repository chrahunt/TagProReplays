const logger = require('util/logger')('filter');
const parser = require('search-query-parser');

class Filter {
	/**
	* metadata from get_all_replays_info()
	* query is literal search query string
	*/
	constructor(metadata, query) {
		this.metadata = metadata;
		this.query = query;
    this.keywords = ['map', 'player', 'name'];
	}

	filter() {
    return new Promise((resolve, reject) => {

      try {
        this.queryObject = parser.parse(this.query, {keywords: this.keywords});
        if(this.queryObject === "") resolve(this.metadata);
      
        if(typeof(this.queryObject) === "string") this.queryObject = {text: this.queryObject};


        let results = this.metadata.filter(this._filterReplay, this);
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
  _flatten(replayMetadata) {
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
  _filterReplay(replayMetadata) {
    let flatMetadata = this._flatten(replayMetadata);
    let matched = true;
    
    // handle excludes
    if(this.queryObject.exclude) {  
      let excluded = Object.keys(this.queryObject.exclude).some(item => {
        if(typeof(this.queryObject.exclude[item]) === "string") 
          this.queryObject.exclude[item] = [this.queryObject.exclude[item]];
        return this.queryObject.exclude[item].some(excludedQuery => {
          return flatMetadata[item].toLowerCase().includes(excludedQuery.toLowerCase());
        });
      });
      if(excluded) return false;
    }

    // handle maps - handled as OR, so matching any is acceptable
    if(this.queryObject.map) {
      if(typeof(this.queryObject.map) === "string") this.queryObject.map = [this.queryObject.map];
      let matchedMap = this.queryObject.map.some(mapQuery => {
        return flatMetadata.map.toLowerCase().includes(mapQuery.toLowerCase());
      });
      if(!matchedMap) matched = false;
    }

    // handle players - handled as AND, so must match all
    if(this.queryObject.player) {
      if(typeof(this.queryObject.player) === "string") this.queryObject.player = [this.queryObject.player];
      let matchedPlayer = this.queryObject.player.every(playerQuery => {
        return flatMetadata.player.toLowerCase().includes(playerQuery.toLowerCase());
      });
      if(!matchedPlayer) matched = false;
    }

    // handle name - handled as OR, so matching any is acceptable
    if(this.queryObject.name) {
      if(typeof(this.queryObject.name) === "string") this.queryObject.name = [this.queryObject.name];
      let matchedName = this.queryObject.name.some(nameQuery => {
        return flatMetadata.name.toLowerCase().includes(nameQuery.toLowerCase());
      });
      if(!matchedName) matched = false;
    }

    // handle free text - terms will be split by white space, unless within double quotes.
    // this will handle exclusions in free text as well
    // They are then treated as AND, so all must match
    if(this.queryObject.text) {
      let textTerms = this._formatText(this.queryObject.text);

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
  _formatText(text) {

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

}

module.exports = Filter;
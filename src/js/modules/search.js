const $ = require('jquery');
const EventEmitter = require('events');

require('../../../node_modules/bootstrap/js/tooltip.js');
require('../../../node_modules/bootstrap/js/popover.js');

var logger = require('util/logger')('search');

/**
 * Search component
 * Events:
 * @event Search#submit
 * @event Search#reset
 */
class Search extends EventEmitter {
  /**
   * Listen on the provided element for search query.
   */
  constructor() {
    super();
    this.input = $('#searchInput');
    this.icon = $('#tpr-search');
    this.resetButton = $('#tpr-search-reset');
    this.inputDiv = $('#tpr-search-div');
    this.titleDiv = $('#tpr-title-div');
    this.iconDiv = $('#tpr-search-icon-div');
    this.info = $('#tpr-search-info');

    const inputHTML = '<span>Use this search to filter your available replays.' +
                      '<br><br>You can use keywords to search by map, by player, or by ' +
                      'replay name, or you can search all at once by leaving the ' +
                      'keyword out.</span><br><span>All searches can include partial matches, and double quotes can be used when your query contains spaces.' +
                      ' Use a hyphen at the beginning of a query to search for replays that <i>do not</i> match that query.</span><br><br>' +
                      '<span>Examples</span>' +
                      '<p><span><b>map:gumbo</b> - returns any replay whose map includes the text "gumbo".</span></p>' +
                      '<p><span><b>map:gumbo map:iron</b> - returns replays whose map includes <i>EITHER</i> "gumbo" or "iron".</span></p>' +
                      '<p><span><b>player:LuckySpammer</b> - returns replays whose list of players contains "LuckySpammer".</span><p>' +
                      '<p><span><b>player:LuckySpammer player:"Some Ball 3"</b> - returns replays whose list of players contains <i>BOTH</i> "LuckySpammer" and "Sombe Ball 3" (note the double quotes needed for terms with spaces).</span><p>' +
                      '<p><span><b>name:snipe</b> - returns replays whose name contains the text "snipe".</span><p>' +
                      '<p><span><b>name:snipe name:boost</b> - returns replays whose name contains <i>EITHER</i> "snipe" or "boost".</span><p>' +
                      '<p><span><b>map:star player:mike</b> - returns replays whose map contains "star" and whose list of players contains "mike".</span><p>' +
                      '<p><span><b>-map:star</b> - Hyphen preceding the query returns all replays that don\'t match. This would return all replays whose map does not contain "star"</span><p>' +
                      '<p><span><b>iron</b> - returns replays that contain "iron" in their map, players, or name fields.</span><p>' +
                      '<p><span><b>-iron</b> - Returns all replays that do not contain "iron" in their maps, players, or names.</span><p>'

    $(this.info).popover({
      content: inputHTML,
      placement: 'auto',
      html: true,
      title: "Instructions"
    });

    $(this.icon).click((e) => {
      logger.debug('Search opened.');
      this.open();
    });
    
    $(this.input).keypress((e) => {
      if (e.key === 'Enter') {
        this.query = this.input.val();
        logger.debug(`Search query entered: ${this.query}.`);
        this.emit('submit');
      }
    });

    $(this.resetButton).click((e) => {
      this.close();
      this.input.val('');
      logger.debug('Search reset.');
      this.emit('reset');
    });
  }

  open() {
    this.iconDiv.hide();
    this.titleDiv.hide();
    this.inputDiv.show();
    this.emit('open');
  }

  close() {
    this.iconDiv.show();
    this.titleDiv.show();
    this.inputDiv.hide();
    this.emit('closed');
  }

}

module.exports = Search;

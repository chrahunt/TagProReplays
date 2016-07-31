var EventEmitter = require('events').EventEmitter;

var Data = require('./data');
var Messaging = require('./messaging');

var logger = require('./logger')('renders');

logger.info('Starting Renders');

class Renders extends EventEmitter {
  constructor() {
    super()
    Messaging.listen('renders.update', () => {
      this.emit('update');
    });
  }

  select(ids) {
    if (!Array.isArray(ids)) ids = [ids];
    return new Selection(ids);
  }

  /**
   * Query for renders to display in table.
   */
  query(args) {
    return Messaging.send('renders.query', args).then((result) => {
      if (result.error) {
        throw result.error;
      } else {
        return result;
      }
    });
  }

  add(ids) {
    return Messaging.send('renders.add', {
      ids: ids
    });
  }
}

module.exports = new Renders();

class Selection extends EventEmitter {
  constructor(ids) {
    super();
    this.ids = ids;
  }

  cancel() {
    return Messaging.send("renders.cancel", {
      ids: this.ids
    });
  }
}

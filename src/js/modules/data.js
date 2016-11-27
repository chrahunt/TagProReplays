const Dexie = require('dexie');

const logger = require('./logger')('data');

const db = new Dexie('ReplayDatabase');
exports.db = db;

// Logging.
let events = ["ready", "populate", "blocked", "versionchange"];
events.forEach((e) => {
  db.on(e, () => {
    logger.info(`Dexie callback: ${e}`);
  });
});

db.version(0.1).stores({
  positions: '++',
  savedMovies: '++'
});

exports.ready = () => {
  return db.open();
};
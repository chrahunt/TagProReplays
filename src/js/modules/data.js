const Dexie = require('dexie');

const logger = require('util/logger')('data');

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

// Algorithms
/**
 * Dexie collection batch processing. 2.0+
 * 
 * Has the following attributes:
 * 1. Only processes `batch_size` simultaneous entries at a time
 * 2. Continue with next batch only after all returned
 *    promises from iteratee have completed.
 * 3. No guarantee about transaction safety if non-Dexie
 *    async operations are carried out.
 * @param {Dexie.Collection} collection
 * @param {Number} batch_size
 * @param {Function} iteratee
 */
exports.batch_process = batch_process;
function batch_process(collection, batch_size, iteratee) {
  let total;

  return collection.count().then((t) => {
    if (!t) {
      return Dexie.Promise.resolve();
    } else {
      total = t;
      return inner_loop(0);
    }
  });

  /**
   * @param {Number} start  starting position
   */
  function inner_loop(start) {
    logger.trace(`Executing inner loop on ${start}`);
    // Index of the end of this sequence of items.
    let n = Math.min(batch_size, total - start);
    // Whether this is the last iteration.
    let last = start + batch_size >= total;
    // Starting index.
    let i = 0;
    // Number of functions finished.
    let dones = 0;
    // Whether we have completed the transaction.
    let looped = false;

    let resolve, reject;
    let p = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    
    return collection.offset(start)
    .limit(n)
    .each(function iteratee_caller(item, cursor) {
      let index = i++;
      var data = {
        key: cursor.key,
        value: item
      };
      Promise.resolve(iteratee(data)).then(function iteratee_callback() {
        dones++;
        logger.trace(`Finished ${index} (${dones})`);
        check();
      });
    }).then(function inner_loop_callback() {
      looped = true;
      // check here in case this finishes after each of the
      // individual transactions.
      // e.g. if everything of the transactions are synchronous.
      check();
    }).then(p).catch(reject);

    function check() {
      // check looped to ensure that the table looping
      // is complete.
      // or is that redundant with checking n?
      if (dones === n && looped) {
        if (!last) {
          // recurse
          inner_loop(start + n);
        } else {
          resolve();
        }
      }
    }
  }
}

/**
 * Iterate over a table given a set of keys.
 * Pauses for any returned promises.
 */
exports.each_key = each_key;
function each_key(table, keys, iteratee) {
  let i = 0;

  function loop() {
    if (i === keys.length) return Promise.resolve();
    let key = keys[i++];
    return table.get(key).then((value) => {
      return {
        key: key,
        value: value
      };
    }).then(iteratee).then(loop);
  }

  return loop();
}

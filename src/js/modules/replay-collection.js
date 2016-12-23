const EventEmitter = require('events');

const {Progress} = require('util/promise-ext');

/**
 * Represents the collection of replays.
 * @event ReplayCollection#added
 * @event ReplayCollection#updated
 * @event ReplayCollection#deleted
 */
class ReplayCollection extends EventEmitter {
  constructor() {
    super();
    this._collection = [];
    this._collection_by_id = new Map();
    // Set update handlers.
    chrome.runtime.onMessage.addListener((message) => {
      let {method} = message;
      if (method == 'replay.added') {
        let {replay} = message;
        replay = new Replay(replay.id, replay);
        this._collection.push(replay);
        this._collection_by_id.set(replay.id, replay);
        this.emit('added', replay);

      } else if (method == 'replay.deleted') {
        let {ids} = message;
        for (let id of ids) {
          this._collection_by_id.delete(id);
        }

        let id_lookup = new Set(ids);
        this._collection = this._collection.filter(
          replay => !id_lookup.has(replay.id));
        this.emit('deleted', ids);

      } else if (method == 'replay.updated') {
        let {id, replay} = message;
        let index = this._collection.findIndex(
          replay => replay.id == id);
        let new_replay = new Replay(replay.id, replay);
        this._collection[index] = new_replay;
        this._collection_by_id.set(new_replay.id, new_replay);
        if (id !== new_replay.id) {
          this._collection_by_id.delete(id);
        }
        this.emit('updated', id, new_replay);
      }
    });
  }

  /**
   * Syncs collection with database.
   * @returns {Promise<Array<Replay>>}
   */
  fetch() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'replay.list'
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.error) {
          reject(new Error(result.message));
        } else {
          this._collection = result.replays.map(
            info => new Replay(info.id, info));
          for (let replay of this._collection) {
            this._collection_by_id.set(replay.id, replay);
          }
          resolve(this);
        }
      });
    });
  }

  /**
   * Iterate over each member.
   * @param {Function} iteratee  function that receives each replay.
   */
  each(iteratee) {
    for (let item of this._collection) {
      iteratee(item);
    }
  }

  /**
   * Delegates to collection.
   * @param {Function} iteratee
   * @returns {Array.<*>}  results of `iteratee`
   */
  map(iteratee) {
    return this._collection.map(iteratee);
  }

  /**
   * Sort the retrieved replays using the given comparator.
   * @param {Function} comparator
   * @param {boolean} asc
   */
  sort(comparator, asc = true) {
    this._collection.sort(comparator);
    if (!asc) {
      this._collection.reverse();
    }
  }

  // soon, only in Chrome 51+
  //[Symbol.iterator]() {}

  /**
   * @returns {Number} count of the total replays.
   */
  total() {
    return this._collection.length;
  }

  /**
   * @returns {Number} current retrieved replays in collection.
   */
  get length() {
    return this._collection.length;
  }

  /**
   * Get replay identified by id.
   * @param {string} id
   */
  get(id) {
    let info = this._collection_by_id.get(id);
    if (!info)
      throw new Error(`No replay with id ${id} found.`);
    return new Replay(id, info);
  }

  /**
   * Select multiple replays by id.
   * @param {Array<string>} ids
   * @returns {ReplaySelection}
   */
  select(ids) {
    return new ReplaySelection(ids, this);
  }

  /**
   * Import replay.
   * @param {object} replay - {name, data}
   * @returns {Promise}
   */
  import(replay) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'replay.import',
        name: replay.name,
        data: replay.data
      }, function (response) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response.failed) {
          // TODO: Consistent error serialization.
          let err = new Error(response.reason);
          if (response.name) {
            err.name = response.name;
          }
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
module.exports = new ReplayCollection();

/**
 * Represents a single replay.
 *
 * Should not be constructed externally.
 */
class Replay {
  /**
   * @param {string} id
   * @param {object} info
   */
  constructor(id, info) {
    this._id = id;
    this._info = info;
    this._dirty = true;
  }

  /**
   * Rename the replay.
   * @param {string} name
   * @returns {Promise}
   */
  rename(name) {
    if (!name) {
      return Promise.reject(new Error('Name must be non-empty'));
    }
    name = name.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '');
    if (!name) {
      return Promise.reject(new Error('Name can only contain characters:'
        + ' a-z, A-Z, 0-9, _, and -.'));
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'replay.rename',
        id: this.id,
        new_name: name
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.failed) {
          reject(new Error(result.reason));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Delete the replay.
   * @returns {Promise}  promise that resolves/rejects on
   *   success/failure.
   */
  delete() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'replay.delete',
        ids: [this.id]
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.failed) {
          reject(new Error(result.reason));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Download the rendered movie for a replay.
   * @returns {Promise}
   */
  download_movie() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'movie.download',
        id: this.id
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.failed) {
          reject(new Error(result.reason));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Download the replay data.
   * @returns {Promise}
   */
  download() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'replay.download',
        id: this.id
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.failed) {
          reject(new Error(result.reason));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the replay data (the actual game state/player positions). This
   * is only needed for previewing the replay.
   *
   * @returns {Promise<ReplayData>}
   */
  get_data() {
    if (!this._dirty) return Promise.resolve(this._data);
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'replay.get',
        id: this.id
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.failed) {
          reject(new Error(result.reason));
        } else {
          this._dirty = false;
          this._data = result.data;
          resolve(this._data);
        }
      });
    });
  }

  /**
   * Render the replay data.
   * @returns {Progress}
   */
  render() {
    return new Progress((resolve, reject, progress) => {
      let port = chrome.runtime.connect({ name: 'replay.render' });
      port.postMessage({ id: this.id });
      // See background page for protocol.
      port.onMessage.addListener((msg) => {
        if (msg.error) {
          let err = deserialize_error(msg.error);
          reject(err);
        } else {
          progress(msg.progress);
        }
      });

      // Finished.
      port.onDisconnect.addListener(() => {
        // If this was due to an error we would have already rejected,
        // and this would do nothing.
        resolve();
      });
    });
  }

  // Property accessors.
  get id() {
    return this._id;
  }

  get name() {
    return this._info.name;
  }

  get recorded() {
    return this._info.recorded;
  }

  get duration() {
    return this._info.duration;
  }

  get rendered() {
    return this._info.rendered;
  }

  get info() {
    return this._info;
  }
}

/**
 * Holds multi-replay actions and iteration if
 * there's no bulk replay function.
 */
class ReplaySelection {
  /**
   * @param {Array<string>}
   * @param {ReplayCollection}
   */
  constructor(ids, collection) {
    this._ids = ids;
    this._collection = collection;
  }

  /**
   * Remove the replays.
   * @returns {Promise}  resolves or rejects on success/failure.
   */
  delete() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        method: 'replay.delete',
        ids: this.ids
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (result.failed) {
          reject(result.reason);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Download the replays.
   * @returns {Progress}
   */
  download() {
    return new Progress((resolve, reject, progress) => {
      let port = chrome.runtime.connect({ name: 'replay.download' });
      port.postMessage({ ids: this._ids });
      // See background page for protocol.
      port.onMessage.addListener((msg) => {
        if (msg.error) {
          let err = new Error(msg.error.message);
          err.name = msg.error.name;
          reject(err);
        } else {
          progress(msg.progress);
        }
      });

      // Finished.
      port.onDisconnect.addListener(() => {
        // If this was due to an error we would have already rejected,
        // and this would do nothing.
        resolve();
      });
    });
  }

  /**
   * Number of selected replays.
   */
  get length() {
    return this._ids.length;
  }

  get ids() {
    return this._ids;
  }

  /**
   * Get replay from specific index.
   * @param {number} i
   * @returns {Replay}
   */
  get(i) {
    let id = this._ids[i];
    return this._collection.get(id);
  }

  /**
   * Iterate over each replay in the selection.
   * @param {Function} iteratee
   */
  each(iteratee) {
    this._ids.forEach(id => iteratee(this._collection.get(id)));
  }

  /**
   * @param {Function} iteratee
   * @returns {Array<*>}
   */
  map(iteratee) {
    return this._ids.map(id => iteratee(this._collection.get(id)));
  }

  /**
   * @param {Function} iteratee
   * @returns {ReplaySelection}
   */
  filter(iteratee) {
    let ids = this._ids.filter(
      id => iteratee(this._collection.get(id)));
    return new ReplaySelection(ids, this._collection);
  }
}

function deserialize_error(err) {
  let error = new Error(err.message);
  if (err.name) {
    error.name = err.name;
  }
  return err;
}

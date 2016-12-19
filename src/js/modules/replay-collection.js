const EventEmitter = require('events');

/**
 * Represents the collection of replays.
 * @event ReplayCollection#added
 * @event ReplayCollection#updated
 * @event ReplayCollection#deleted
 */
class ReplayCollection extends EventEmitter {
  constructor() {
    super();
    this.collection = [];
    this.collection_by_id = new Map();
    // Set update handlers.
    chrome.runtime.onMessage.addListener((message) => {
      let {method} = message;
      if (method == 'replay.added') {
        let {replay} = message;
        replay = new Replay(replay.id, replay);
        this.collection.push(replay);
        this.collection_by_id.set(replay.id, replay);
        this.emit('added', replay);

      } else if (method == 'replay.deleted') {
        let {ids} = message;
        for (let id of ids) {
          this.collection_by_id.delete(id);
        }

        let id_lookup = new Set(ids);
        this.collection = this.collection.filter(
          replay => !id_lookup.has(replay.id));
        this.emit('deleted', ids);

      } else if (method == 'replay.updated') {
        let {id, replay} = message;
        let index = this.collection.findIndex(
          replay => replay.id == id);
        let new_replay = new Replay(replay.id, replay);
        this.collection[index] = new_replay;
        this.collection_by_id.set(new_replay.id, new_replay);
        if (id !== new_replay.id) {
          this.collection_by_id.delete(id);
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
          this.collection = result.replays.map(
            info => new Replay(info.id, info));
          for (let replay of this.collection) {
            this.collection_by_id.set(replay.id, replay);
          }
          resolve(this);
        }
      });
    });
  }

  /**
   * Iterate over each member.
   */
  each(iteratee) {
    for (let item of this.collection) {
      iteratee(item);
    }
  }

  /**
   * Delegates to collection.
   */
  map(iteratee) {
    return this.collection.map(iteratee);
  }

  /**
   * Sort the retrieved replays using the given comparator.
   * @param {Function} comparator
   * @param {boolean} asc
   */
  sort(comparator, asc = true) {
    this.collection.sort(comparator);
    if (!asc) {
      this.collection.reverse();
    }
  }

  // soon, only in Chrome 51+
  //[Symbol.iterator]() {}

  /**
   * @returns {Number} count of the total replays.
   */
  total() {
    return this.collection.length;
  }

  /**
   * @returns {Number} current retrieved replays in collection.
   */
  get length() {
    return this.collection.length;
  }

  /**
   * Get replay identified by id.
   * @param {string} id
   */
  get(id) {
    let info = this.collection_by_id.get(id);
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
   * Make a new Replay.
   * @param {object} info
   * @param {object} data
   */
  new(info, data) {
    return new Promise((resolve, reject) => {

    });
  }
}
module.exports = new ReplayCollection();

/**
 * Should not be constructed externally.
 */
class Replay {
  /**
   * Constructs a replay.
   */
  constructor(id, info) {
    this._id = id;
    this._info = info;
    this._dirty = true;
  }

  /**
   * Rename the replay.
   * @param {string} name
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
          reject(result.reason);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Download the rendered movie for a replay.
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
          reject(new Errpr(result.reason));
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
  constructor(ids, collection) {
    this.ids = ids;
  }

  /**
   * Remove the replays. Returns a promise that resolves or rejects
   * on success/failure.
   * @returns {Promise}
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
}

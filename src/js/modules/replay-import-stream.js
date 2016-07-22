var inherits = require('util').inherits;
var Writable = require('readable-stream').Writable;
var async = require('async');

var json = require('./json');
var validate = require('./validate');

var logger = require('./logger')('replay-import-stream');

inherits(ObjectStream, Writable);

/**
 * @typedef {object} ObjectStreamOptions
 * @property {number} [highWaterMark]
 */
/**
 * Object stream represents a flexible object-mode Writable stream. The
 * flexibility is in allowing extending classes to set their own definition
 * of an object's `size` in the context of determining when it is appropriate
 * to apply backpressure to sending streams. Contrast this with the typical
 * object-mode Writable stream where the number of objects is the only limit.
 * Extending classes should override `__write` (same interface as `_write`) and
 * `_size`.
 * @param {ObjectStreamOptions} [options]
 */
function ObjectStream(options) {
  if (!(this instanceof ObjectStream))
    return new ObjectStream(options);
  if (typeof options == "undefined")
    options = {};
  Writable.call(this, {
    objectMode: true,
    highWaterMark: Infinity // Number of objects is unbounded.
  });
  // Track size of objects.
  this.length = 0;
  // Arbitrary units.
  this.__highWaterMark = options.highWaterMark || 16;
}

/**
 * Override to get buffered data length before calling original `write`.
 * @override
 */
ObjectStream.prototype.write = function (chunk, encoding, cb) {
  logger.debug("ObjectStream#write: Received chunk.");
  var size = this._size(chunk);
  // Size of currently called write value + size of all buffered calls.
  this.length += size;
  // Disregard original return value.
  Writable.prototype.write.apply(this, arguments);
  var ret = this.length < this.__highWaterMark;
  if (!ret) {
    logger.debug("ObjectStream#write: Need drain.");
    this._writableState.needDrain = true;
  }

  return ret;
};

/**
 * Override to get written data length and call subclass override __write.
 * @override
 */
ObjectStream.prototype._write = function (chunk, encoding, cb) {
  var writelen = this._size(chunk);
  // Remove from size of internal buffer.
  this.length -= writelen;
  this.__write(chunk, encoding, cb);
};

/**
 * Subclasses may override. Same signature as _write.
 */
ObjectStream.prototype.__write = function (chunk, encoding, cb) {
  logger.error("ObjectStream#__write not overriden.");
};

/**
 * Subclasses must override. Takes obj and returns integer size.
 * @param {object} obj - an object in the stream.
 * @return {number} - "Size" of the object.
 */
ObjectStream.prototype._size = function (obj) {
  logger.error("ObjectStream#_size not overriden!");
};

inherits(ReplayImportStream, ObjectStream);
module.exports = ReplayImportStream;

/**
 * @typedef {object} ReplayImportOptions
 * @property {integer} [highWaterMark] - Size (in bytes) used to restrict
 *   the maximum number of replays that can be sent at once, and also
 *   restricts the length of the ObjectStore internal buffer. Assume app
 *   may have objects of this size * 2 allocated. Default is equal to
 *   50MB.
 */
/**
 * Stream for importing replays. Pipe a fileliststream into me.
 * Works best with a quick source and a slower insertion (which is
 * currently the case with IndexedDB and reading the files). Pipe streams
 * into this stream with `{end: false}` so the stream has a chance to clear
 * out the buffer, and so the `finish` event actually indicates end of writing.
 */
function ReplayImportStream(options) {
  if (!(this instanceof ReplayImportStream))
    return new ReplayImportStream(options);
  if (typeof options == "undefined")
    options = {};
  this._cache = [];
  this._cachesize = 0;
  // In the process of importing buffered files.
  this._importing = false;
  this._highWaterMark = options.highWaterMark || 1024 * 1024 * 50;
  this._done = false;
  this._cancelled = false;
  ObjectStream.call(this, {
    objectMode: true,
    highWaterMark: this._highWaterMark
  });

  this.ended = false;
  var self = this;

  function setEmpty() {
    self._srcEmpty = true;
  }

  this.on('pipe', (src) => {
    logger.log("ReplayImportStream: piped to.");
    src.on('end', setEmpty);
  });

  this.on('unpipe', (src) => {
    logger.log("ReplayImportStream: unpiped.");
    this._cancelled = true;
    src.removeListener('end', setEmpty);
  });
}

ReplayImportStream.prototype.stop = function () {
  this.ended = true;
};

/**
 * Override for ObjectStream.
 * @override
 * @param {FileInfo} value - Replay file information.
 * @param {string} encoding - disregarded.
 * @param {Function} done - Called with
 * @return {[type]} [description]
 */
ReplayImportStream.prototype.__write = function (value, encoding, done) {
  logger.log("ReplayImportStream#__write: Writing chunk.");
  // Disregard data if stream has already been ended.
  if (this.ended) { done(); return; }
  this._lastValue = value;
  var self = this;
  function pending(err) {
    // Done being written to, and no more values buffered.
    if (self._srcEmpty && !self._moreBuffered()) {
      done(err);
      self.end();
    } else {
      // More values or not done.
      done(err);
    }
  }
  this._cache.push(value);
  this._cachesize += this._size(value);
  // Add to cache if cachesize allows it.
  if (this._cachesize < this._highWaterMark) {
    if (this._moreBuffered()) {
      // Fill up the cache.
      done();
    } else if (!this._importing) {
      this._pendingCallback = pending;
      this._send();
    }
  } else if (!this._importing) {
    this._pendingCallback = pending;
    this._send();
  }
  // Emit drain prior to callback check.
  if (this._writableState.needDrain && !this._moreBuffered()) {
    this.emit('drain');
  }
};

/**
 * Override for ObjectStream.
 * @override
 */
ReplayImportStream.prototype._size = function (obj) {
  return obj.size;
};

/**
 * Determine if the given value is the last buffered chunk available.
 * @param {*} value
 * @return {boolean}
 */
ReplayImportStream.prototype._moreBuffered = function () {
  return this._writableState.lastBufferedRequest &&
      this._writableState.lastBufferedRequest.chunk !== this._lastValue;
};

/**
 * Send files to background page.
 * @return {[type]} [description]
 */
ReplayImportStream.prototype._send = function () {
  var self = this;
  this._importing = true;

  var cache = this._cache;
  this._cache = [];
  this._cachesize = 0;
  logger.log(`ReplayImportStream#_send: Saving ${cache.length} replays`);

  Messaging.send('importReplay', cache, (response) => {
    logger.log("ReplayImportStream:callback: Replay import complete.");
    self._importing = false;
    if (self._pendingCallback) {
      logger.log("ReplayImportStream:callback: calling pending callback.");
      var cb = self._pendingCallback;
      self._pendingCallback = null;
      cb();
    }
  });
};

/**
 * Save replays.
 * @private
 */
ReplayImportStream.prototype._save = function (files) {
  async.each(files, (file, callback) => {
    if (!this._cancelled) return;
    json(file.data).then((parsed) => {
      logger.debug(`Validating ${name}.`);
    }).catch((err) => {
      this.emit('error', {
        name: file.name,
        reason: err instanceof SyntaxError ? "could not be parsed"
                                           : "unknown JSON error"
      });
    })
    try {
      var name = file.filename;
      var replay = JSON.parse(file.data);
    } catch (e) {
      var err = {
        name: name
      };
      if (e instanceof SyntaxError) {
        err.reason = "could not be parsed: " + e;
      } else {
        err.reason = "unknown error: " + e;
      }
      Messaging.send("importError", err);
      callback();
      return;
    }
    
    // Validate replay.
    var result = validate(replay);
    if (result.valid) {
      var version = result.version;
      logger.debug(`${file.filename} is a valid v${version} replay.`);
      logger.debug("Applying necessary conversions...");
      var data = {
        data: replay,
        name: name
      };
      try {
        var converted = convert(data);
        var converted_replay_data = converted.data;
        Data.saveReplay(converted_replay_data).then((info) => {
          if (!importing) { callback("cancelled"); return; }
          Messaging.send("importProgress");
          callback();
        }).catch((err) => {
          if (!importing) { callback("cancelled"); return; }
          logger.error("Error saving replay: %o.", err);
          Messaging.send("importError", {
            name: name,
            reason: 'could not be saved: ' + err
          });
          callback();
        });
      } catch (e) {
        logger.error(e);
        Messaging.send("importError", {
          name: name,
          reason: `could not be converted: ${e.message}`
        });
        callback();
      }
    } else {
      logger.error(`${file.filename} could not be validated!`);
      logger.error(err);
      Messaging.send("importError", {
        name: name,
        reason: 'could not be validated: ' + err
      });
      callback();
    }
  }, (err) => {
    if (err === null) {
      logger.debug("Finished importing replay set.");
    } else {
      logger.error("Encountered error importing replays: %O", err);
    }
    // Send new replay notification to any tabs that may have menu open.
    Messaging.send("replaysUpdated");
    sendResponse();
  });
};
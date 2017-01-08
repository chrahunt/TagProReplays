/**
 * @fileoverview For video conversion/creation. Video creation
 * extracts individual frames from a canvas element and compiles
 * them with Whammy.
 */
const logger = require('util/logger')('make-video');
const {Progress, map} = require('util/promise-ext');
const Whammy = require('util/whammy');

/**
 * Class for tracking async sequence of events.
 */
class Stats {
  constructor(name) {
    this.name = name;
    this.events = [];
    this.log('stats:init');
  }

  log(name) {
    this._add_event(name, performance.now());
  }

  summary() {
    let output = "";
    let maxwidth = Math.max(...this.events.map(e => e.name.length));
    let last = 0;
    for (let event of this.events) {
      output += `${this._left_pad(maxwidth, event.name)}: ${round(event.time)}`;
      if (last) {
        let diff = event.time - last;
        output += ` +${round(diff)}`;
      }
      output += "\n";
      last = event.time;
    }
    return output;
  }

  _left_pad(length, string, fillchar = ' ') {
    if (string.length > length) return string;
    return (fillchar.repeat(length) + string).slice(-length);
  }

  _add_event(name, time) {
    if (this.name) {
      name = `${this.name}:${name}`;
    }
    this.events.push({name, time});
  }
}

// Takes unordered input and outputs in specific order.
class OrderedQueue {
  constructor() {
    // Number pushed onto queue.
    this.enqueued = 0;
    this._popped = 0;
    this._buffer = [];
  }

  // Add ordered item.
  add(i, item) {
    this.enqueued++;
    this._buffer.push([i, item]);
    this._buffer.sort((a, b) => a[0] - b[0]);
    //logger.trace(`Pushed onto buffer: ${this._buffer.map(i => i[0])}`);
  }

  // Pull off any ordered items.
  get() {
    let ready = [];
    for (let i = 0; i < this._buffer.length; i++) {
      let item = this._buffer[i];
      let index = item[0];
      //logger.trace(`index: ${index}; popped: ${this._popped}`);
      if (index !== this._popped) break;
      this._popped++;
      ready.push(item);
    }
    if (ready.length) {
      this._buffer = this._buffer.slice(ready.length);
    }
    return ready;
  }

  get length() {
    return this._buffer.length;
  }
}

/**
 * Renders replay.
 * 
 * Interface:
 *   Progress is returned. Call .progress on it and pass a handler for
 *   the progress events, which contain the number of frames processed.
 *   Progress resolves to the completed render.
 * @param {Iterator} source source for frames, should have objects with
 *   properties frame (Blob) and duration (Number)
 * @returns {Progress}
 */
module.exports = renderVideo;
function renderVideo(source) {
  let stats = new Stats();
  return new Progress((resolve, reject, progress) => {
    let encoder = new Whammy.Video();
    let frame_queue = new OrderedQueue();

    stats.log('render start');
    // Batch process frames for rendering.
    return map(source, (operation, index) => {
      return operation.then((data) => {
        //logger.trace(`Pushed frame ${index} into queue.`);
        frame_queue.add(index, data);
        // Push any available ordered frames into the encoder.
        for (let [i, data] of frame_queue.get()) {
          //logger.trace(`Pushing frame ${i} into encoder.`);
          encoder.add(data.frame, data.duration);
        }
        progress(frame_queue.enqueued);
      });
    }, { concurrency: navigator.hardwareConcurrency })
    .then(() => {
      stats.log('render end');
      stats.log('compile start');
      logger.info('Compiling.');
      // Done adding frames.
      return encoder.compile();
    })
    .then((output) => {
      stats.log('compile end');
      logger.info('Compiled.');
      logger.debug(stats.summary());
      resolve(output);
    })
    .catch(reject);
  });
}

/**
 * Round a given number to the provided decimal places.
 * @param {Number} n
 * @param {Number} places
 * @returns {String}
 */
function round(n, places = 3) {
  let s = n.toString();
  let sep = s.indexOf('.');
  if (sep === -1) {
    return s;
  } else {
    return s.slice(0, sep + places);
  }
}

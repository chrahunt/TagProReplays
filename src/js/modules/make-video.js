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
    this.attributes = {};
    this.log('stats:init');
  }

  log(name) {
    this._add_event(name, performance.now().toFixed(3));
  }

  // Add some other attribute.
  add_attr(name, value) {
    this.attributes[name] = value;
  }

  summary() {
    let output = "";
    let maxwidth = Math.max(...this.events.map(e => e.name.length));
    let last = 0;
    for (let event of this.events) {
      output += `${this._left_pad(maxwidth, event.name)}: ${event.time}`;
      if (last) {
        let diff = event.time - last;
        output += ` +${diff}`;
      }
      output += "\n";
      last = event.time;
    }
    return output;
  }

  // Get action data
  get_data() {
    let offsets = this._get_offsets(this.events.map(e => e.time));
    let events =  this.events.map(({name}, i) => [name, offsets[i]]);
    return Object.assign({events}, this.attributes);
  }

  _get_offsets(times) {
    let result = [];
    if (!times.length) return result;
    result.push(0);
    let start = times[0];
    for (let time of times.slice(1)) {
      result.push(time - start);
    }
    return result;
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
 * @returns {Progress} progress that resolves to the rendered video and
 *   rendering stats.
 */
module.exports = renderVideo;
function renderVideo(source) {
  let stats = new Stats();
  stats.add_attr('cores', navigator.hardwareConcurrency);
  // Other attributes added later.
  let frames = 0;
  let duration = 0;
  let operation_start = performance.now();
  return new Progress((resolve, reject, progress) => {
    let encoder = new Whammy.Video();
    let frame_queue = new OrderedQueue();

    stats.log('render start');
    // Batch process frames for rendering.
    return map(source, (operation, index) => {
      return operation.then((data) => {
        frames++;
        duration += data.duration;
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
      stats.add_attr('frames', frames);
      stats.add_attr('replay duration', duration.toFixed(3));
      stats.log('compile start');
      logger.info('Compiling.');
      // Done adding frames.
      return encoder.compile();
    })
    .then((output) => {
      stats.log('compile end');
      logger.info('Compiled.');
      let total_operation_time = performance.now() - operation_start;
      stats.add_attr('total time', total_operation_time.toFixed(3));
      logger.debug(stats.summary());
      resolve({output, stats: stats.get_data()});
    })
    .catch(reject);
  });
}

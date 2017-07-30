/**
 * @fileoverview For video conversion/creation. Video creation
 * extracts individual frames from a canvas element and compiles
 * them with Whammy.
 */
const logger = require('util/logger')('make-video');
const {Progress, toStream} = require('util/promise-ext');
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
    let events =  this.events.map(
      ({name}, i) => [name, offsets[i].toFixed(3)]);
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

module.exports = renderVideo;

/**
 * Renders replay.
 *
 * Interface:
 *   Progress is returned. Call `progress` on it and pass a handler for
 *   the progress events, which contain the number of frames processed.
 *   Progress resolves to the completed render.
 *
 * Progress given only corresponds to webP conversion phase, this is
 * fine for now.
 *
 * @param {Iterator} source source for frames, should have objects with
 *   properties frame (Blob) and duration (Number)
 * @returns {Progress} progress that resolves to the rendered video and
 *   rendering stats.
 */
function renderVideo(source) {
  let stats = new Stats();
  stats.add_attr('cores', navigator.hardwareConcurrency);
  // Other attributes added later.
  let frames = 0;
  let duration = 0;
  let operation_start = performance.now();
  return new Progress((resolve, reject, progress) => {
    let encoder = new Whammy.Video();

    stats.log('render start');
    // Batch process frames for rendering.
    return toStream(source, (data) => {
      frames++;
      duration += data.duration;
      encoder.add(data.frame, data.duration);
      progress(frames);
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

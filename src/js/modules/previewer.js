const $ = require('jquery');
const loadImage = require('image-promise');
const EventEmitter = require('events');
const saveAs = require('file-saver').saveAs;

const Cookies = require('./cookies');
const get_renderer = require('./renderer');
const logger = require('./logger')('renderer');
const track = require('./track');

// Retrieve replay from background page.
function get_replay(id) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      method: 'replay.get',
      id: id
    }, (replay) => {
      if (!replay) {
        reject('Replay not retrieved.');
      } else if (chrome.runtime.lastError) {
        reject(`Chrome error: ${chrome.runtime.lastError.message}`);
      } else {
        resolve(replay);
      }
    });
  });
}

/**
 * Random access Media of a known length
 * on
 * - end
 * - play
 * - pause
 * - frame
 * - load
 */
class Media extends EventEmitter {
  constructor(replay_info, canvas) {
    super();
    this.playing = false;
    this.ready = false;
    this.frame = 0;
    this.frames = 0;
    this.playTimer = 0;
    this.replay = {};
    this.replay_info = {};
    this.canvas = canvas;
    //this.track = this.canvas.captureStream().getTracks()[0];
    //this.stream = new MediaStream();
    //this.stream.addTrack(this.track);
    this.load(replay_info);
  }

  load(replay_info) {
    logger.debug('Media#load()');
    this.replay_info = replay_info;
    get_replay(this.replay_info.id).then((replay) => {
      this.replay = replay;
      this.frames = this.replay.clock.length - 1;
      return chrome.storage.promise.local.get('options');
    }).then((items) => {
      if (!items.options) throw new Error('No options set.');
      return get_renderer(this.canvas, this.replay, items.options);
    }).then((renderer) => {
      this.renderer = renderer;
      this.set(0);
      this.emit('load');
    }).catch((err) => {
      this.emit('error', err);
    });
  }

  /**
   * Play media from current frame to provided end frame
   * or end of stream if no value provided.
   */
  play(end = this.replay.clock.length - 1) {
    if (this.frame >= end) this.frame = 0;
    logger.debug('Media#play()');
    if (this.playing) {
      clearTimeout(this.playTimer);
    }
    this.playing = true;
    this.emit('play');

    let self = this;
    // Source for frames.
    function* frames() {
      let frame = self.frame;
      let frame_time = Date.parse(self.replay.clock[frame]);
      while (frame < end) {
        let next_frame_time = Date.parse(self.replay.clock[frame + 1]);
        let frame_duration = next_frame_time - frame_time;
        yield [frame, frame_duration];
        frame_time = next_frame_time;
        frame++;
      }
      yield [frame, 0];
    }

    let reel = frames();
    this.playTimer = setTimeout(function animate() {
      let {value, done} = reel.next();
      if (done) {
        this.playing = false;
        self.emit('end');
        return;
      }
      let [frame, duration] = value;
      self.renderer.draw(frame);
      self.frame = frame;
      self.emit('frame', self.frame);
      //self.track.requestFrame();
      let average_render_time =
        self.renderer.total_render_time / self.renderer.rendered_frames;
      self.playTimer = setTimeout(animate, duration - average_render_time);
    });
  }

  pause() {
    this.playing = false;
    clearInterval(this.playTimer);
    this.emit('pause');
  }

  set(frame) {
    this.frame = frame;
    if (!this.playing) {
      this.renderer.draw(frame);
      this.emit('frame', this.frame);
    }
  }
}

let player_elements = {
  screen: '#viewer-screen',
  play: '.tpr-button-play',
  pause: '.tpr-button-pause',
  replay: '.tpr-button-replay',
  crop_start: '.tpr-button-crop-start',
  crop_end: '.tpr-button-crop-end',
  crop_play: '.tpr-button-crop-play',
  rename: '.tpr-button-rename',
  delete: '.tpr-button-delete',
  crop: '.tpr-button-crop',
  crop_replace: '.tpr-button-crop-replace',
  render: '.tpr-button-render',
  canvas: '#viewer-canvas',
  background: '#tpr-viewer-container, #tpr-viewer',
  record: '.tpr-button-record'
};

let progress_elements = {
  container: '.tpr-progress-container',
  hover: '.progress-padding',
  scrubber: '.progress-scrubber-container',
  slider: '.progress-slider',
  bar: '.tpr-progress-bar',
  crop_start: '.progress-crop-start',
  crop_end: '.progress-crop-end',
  crop_start_dismiss: '.progress-crop-dismiss-start',
  crop_end_dismiss: '.progress-crop-dismiss-end'
};

/**
 * A little progress/player bar with start/end clip regions.
 * @emits
 * @event set
 * @event clip_end_remove
 * @event clip_start_remove
 */
class little_progress extends EventEmitter {
  constructor(spec) {
    super();
    this.spec = spec;
    this.val = 0;
    this.clip_start_value = 0;
    this.clip_end_value = 1;
    this.forced_expand = false;
    this.hovered = false;

    // Slider bar change.
    $(this.spec.container).click((e) => {
      logger.debug('Slider click');
      let offset = e.offsetX;
      let val = offset / $(e.target).width();
      this.set(val);
      this.emit('set', val);
      e.preventDefault();
    });

    let unhovered_timer;
    $(this.spec.container).hover((e) => {
      this.hovered = true;
      this._update();
      if (unhovered_timer) clearTimeout(unhovered_timer);
    }, (e) => {
      // Delay so state doesn't change immediately.
      let update_delay = 300;
      unhovered_timer = setTimeout(() => {
        unhovered_timer = null;
        this.hovered = false;
        this._update();
      }, update_delay);
    });

    $(this.spec.crop_start_dismiss).click((e) => {
      logger.debug('Crop start dismiss clicked');
      this.clip_start(0);
      this.emit('clip_start_remove');
      return false;
    });

    $(this.spec.crop_end_dismiss).click((e) => {
      logger.debug('Crop end dismiss clicked');
      this.clip_end(1);
      this.emit('clip_end_remove');
      return false;
    });

    $(window).resize(() => {
      this.clip_start(this.clip_start_value);
      this.clip_end(this.clip_end_value);
      this.set(this.val);
    });
  }

  /**
   * Set slider value.
   */
  set(value) {
    this.val = value;
    $(this.spec.slider).css({
      transform: `scaleX(${value})`
    });
    let last_width = $(this.spec.bar).width();
    $(this.spec.scrubber).css({
      transform: `translateX(${last_width * value}px)`
    });
  }

  /**
   * Get slider value.
   * @returns {number} the slider value in the range 0..1
   */
  get() {
    return this.val;
  }

  /**
   * Force display of larger progress bar style.
   */
  expand() {
    this.forced_expand = true;
    this._update();
  }

  /**
   * Allow progress to contract if needed.
   */
  contract() {
    this.forced_expand = false;
    this._update();
  }

  /**
   * @private
   */
  _update() {
    if (this.hovered || this.forced_expand) {
      $(this.spec.bar).addClass('hover');
    } else {
      $(this.spec.bar).removeClass('hover');
    }
  }

  /**
   * Show the clip start.
   * @param {number} value  number in the range 0..1
   */
  clip_start(value) {
    this.clip_start_value = value;
    $(this.spec.crop_start).css({
      width: `${this.clip_start_value * 100}%`
    });
    if (value) {
      let width = $(this.spec.container).width();
      $(this.spec.crop_start_dismiss).css({
        transform: `translateX(${width * this.clip_start_value}px)`
      });
      $(this.spec.crop_start_dismiss).addClass('active');
    } else {
      $(this.spec.crop_start_dismiss).removeClass('active');
    }
  }

  /**
   * @param {number} value  number in the range 0..1 with the proportion
   *   of the media to start end clip region.
   */
  clip_end(value) {
    this.clip_end_value = value;
    let style_value = 1 - this.clip_end_value;
    $(this.spec.crop_end).css({
      width: `${style_value * 100}%`
    });
    if (value !== 1) {
      let width = $(this.spec.container).width();
      $(this.spec.crop_end_dismiss).css({
        transform: `translateX(-${width * style_value}px)`
      });
      $(this.spec.crop_end_dismiss).addClass('active');
    } else {
      $(this.spec.crop_end_dismiss).removeClass('active');
    }
  }
}

class Viewer {
  constructor() {
    this.crop_start = null;
    this.crop_end = null;
    this.capture_type = 'video/webm';
    this.focus = false;
    this.playing = false;
    this.end = false;
    /**
     * @type {MediaRecorder}
     */
    this.recorder = null;
    /**
     * @type {Media}
     */
    this.media = null;
    /**
     * @type {little_progress}
     */
    this.slider = null;
  }

  // Initialize listeners
  init() {
    this.$canvas = $(player_elements.canvas);
    // We need to resize before the slider.
    $(window).resize(() => this._resize());
    // Replay playback controls.
    this.slider = new little_progress(progress_elements);
    let recording = false;
    $(player_elements.screen).click(() => {
      if (this.playing) {
        this.media.pause();
      } else {
        this.media.play();
      }
    });

    $(player_elements.play).click(() => {
      logger.info('Play button clicked.');
      this.media.play();
    });

    $(player_elements.pause).click(() => {
      logger.info('Pause button clicked.');
      this.media.pause();
    });

    $(player_elements.replay).click(() => {
      logger.info('Replay button clicked.');
      this.media.set(0);
      this.media.play();
    });

    $(player_elements.crop_start).click(() => {
      logger.info('Crop start button clicked.');
      this.crop_start = this.last_frame;
      this.slider.clip_start(this.crop_start / this.media.frames);
      if (this.crop_end < this.crop_start) {
        this.crop_end = this.media.frames;
        this.slider.clip_end(1);
      }
    });

    $(player_elements.crop_end).click(() => {
      logger.info('Crop end button clicked.');
      this.crop_end = this.last_frame;
      this.slider.clip_end(this.crop_end / this.media.frames);
      if (this.crop_end < this.crop_start) {
        this.crop_start = 0;
        this.slider.clip_start(0);
      }
    });

    $(player_elements.crop_play).click(() => {
      logger.info('Crop play button clicked.');
      this.media.set(this.crop_start);
      this.media.play(this.crop_end);
    });

    // Replay editing controls.
    function clean_name(name) {
      return name.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '');
    }

    function validate_name(name) {
      let cleaned_name = clean_name(name);
      return cleaned_name !== '';
    }

    let self = this;
    function dismiss() {
      self.media.pause();
      self.hide();
      $('#menuContainer').show();
    }

    $(player_elements.rename).click(() => {
      let id = this.replay_info.id;
      logger.info(`Rename button clicked for ${id}`);
      let name = this.replay_info.name;
      let new_name = prompt(`Please enter a new name for ${name}`, name);
      if (new_name === null) return;
      if (!validate_name(new_name)) {
        alert('Invalid name, only characters a-z, 0-9, _, and - are accepted.');
        return;
      }
      new_name = clean_name(new_name);
      dismiss();
      logger.info(`Requesting rename for ${id} to ${new_name}.`);
      chrome.runtime.sendMessage({
        method: 'replay.rename',
        id: id,
        new_name: new_name
      }, (result) => {
        if (result.failed) {
          alert(`Renaming failed: ${result.reason}`);
        }
      });
    });

    $(player_elements.delete).click(() => {
      logger.info('Delete button clicked.');
      let id = this.replay_info.id;
      if (confirm('Are you sure you want to delete this replay?')) {
        setTimeout(() => {
          logger.info(`Sending request to delete: ${id}`);
          chrome.runtime.sendMessage({
            method: 'replay.delete',
            ids: [id]
          }, (result) => {
            if (result.failed) {
              alert(`Deletion failed: ${result.reason}`);
            }
          });
        }, 500);
        dismiss();
      }
    });

    $(player_elements.record).click(() => {
      logger.info('Record button clicked.');
      recording = !recording;
      if (!recording) {
        logger.info('Stopping recording.');
        this.recorder.stop();
        $(player_elements.record).toggleClass('active');
      } else {
        logger.info('Starting recording.');
        this.recorder.start();
        $(player_elements.record).toggleClass('active');
      }
    });

    $(player_elements.crop).click(() => {
      let [start, end] = [this.crop_start, this.crop_end];
      let id = this.replay_info.id;
      let new_name = prompt('If you would also like to name the new cropped replay, type the new name here. Leave it blank to make a generic name.');
      if (new_name === null) return;
      if (new_name === '') {
        new_name = 'replays' + Date.now();
      } else if (!validate_name(new_name)) {
        alert('Invalid name, only characters a-z, 0-9, _, and - are accepted.');
        return;
      } else {
        new_name = clean_name(new_name);
      }
      chrome.runtime.sendMessage({
        method: 'replay.crop',
        start: start,
        end: end,
        id: id,
        new_name: new_name
      }, (result) => {
        if (result.failed) {
          alert(`Failed to save new replay: ${result.reason}`);
        }
      });
      dismiss();
    });

    $(player_elements.crop_replace).click(() => {
      let [start, end] = [this.crop_start, this.crop_end];
      let id = this.replay_info.id;
      var new_name = prompt('If you would also like to rename this replay, do so now.', this.replay_info.name);
      if (new_name === null) return;
      if (!validate_name(new_name)) {
        alert('Invalid name, only characters a-z, 0-9, _, and - are accepted.');
        return;
      }
      new_name = clean_name(new_name);
      chrome.runtime.sendMessage({
        method: 'replay.crop_and_replace',
        id: id,
        start: start,
        end: end,
        new_name: new_name,
      }, (result) => {
        if (result.failed) {
          alert(`Failed to replace replay: ${result.reason}`);
        }
      });
      dismiss();
    });

    this.slider.on('clip_start_remove', () => {
      this.crop_start = 0;
    });

    this.slider.on('clip_end_remove', () => {
      this.crop_end = this.media.frames;
    });

    this.slider.on('set', (val) => {
      let frame = val * this.media.frames;
      this.media.set(Math.floor(frame));
      if (this.playing) {
        this.media.play();
      }
    });

    // Background click to close viewer.
    let $background = $(player_elements.background);
    $background.click((e) => {
      if ($background.is(e.target)) {
        dismiss();
      }
    });

    // Initial sizing.
    this._resize();

    // Arrow key controls.
    let keys = {
      back:    37, // left
      advance: 39  // right
    };

    $(document).on('keydown', (e) => {
      if (!this.focus) return;
      if (this.playing) return;
      if (e.which == keys.back) {
        if (this.last_frame) {
          this.media.set(this.last_frame - 1);
        }
      } else if (e.which == keys.advance) {
        if (this.last_frame < this.media.frames) {
          this.media.set(this.last_frame + 1);
        }
      }
    });

    // Control auto-hide listeners.
    // Returns a function that, when called, prevents the given
    // callback from being executed.
    function debounce(callback, wait) {
      let fn = () => { timeout = null; callback(); };
      var timeout = setTimeout(fn, wait);
      return function() {
        clearTimeout(timeout);
        timeout = setTimeout(fn, wait);
      }
    }

    this.pointer_active = false;
    let reset_idle;
    $('#viewer-container').mousemove(() => {
      if (!this.pointer_active) {
        this.pointer_active = true;
        this._update();
      }
      if (!reset_idle) {
        reset_idle = debounce(() => {
          reset_idle = null;
          this.pointer_active = false;
          this._update();
        }, 1000);
      }
      reset_idle();
    });

    this.pointer_on_controls = false;
    $('#viewer-control-container').hover(() => {
      this.pointer_on_controls = true;
      this._update();
    }, () => {
      this.pointer_on_controls = false;
      this._update();
    });
  }

  /**
   * @param {object} replay - replay info, object with id,
   *   name, etc.
   */
  load(replay) {
    this.replay_info = replay;
    this.media = new Media(replay, this.$canvas[0]);
    /*this.recorder = new MediaRecorder(this.media.stream, {
      mimeType: this.capture_type
    });
    */
    this.recorder = {};

    let chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    this.recorder.onstop = () => {
      let blob = new Blob(chunks, {
        type: this.capture_type
      });
      saveAs(blob, 'test.webm');
    };
    this.recorder.onstart = () => {
      chunks = [];
    };

    this.media.on('load', () => {
      this.show();
      this.media.set(0);
      this.crop_start = 0;
      this.crop_end = this.media.frames;
      this.slider.clip_start(0);
      this.slider.clip_end(1);
      track('Preview Replay');
    });

    this.media.on('error', (err) => {
      logger.error('Error loading media: ', err);
      alert(`Error loading replay: ${err.message}`);
      this.hide();
      $('#menuContainer').show();
    });

    this.media.on('play', () => {
      this.playing = true;
      this.end = false;
      this._update();
    });

    this.media.on('pause', () => {
      this.playing = false;
      this._update();
    });

    this.media.on('end', () => {
      this.playing = false;
      this.end = true;
      this._update();
    });

    this.media.on('frame', (i) => {
      this.last_frame = i;
      // Set slider.
      let ratio = this.last_frame / this.media.frames;
      this.slider.set(ratio);
    });

    this._update();
  }

  /**
   * Show previewer.
   */
  show() {
    $('#tpr-viewer-container').show();
    this.focus = true;
  }

  /**
   * Hide previewer.
   */
  hide() {
    this.focus = false;
    $('#tpr-viewer-container').hide();
  }

  // Update UI.
  _update() {
    this.end = this.last_frame === this.media.frames;
    if (this.playing) {
      $(player_elements.pause).show();
      $(player_elements.play).hide();
      $(player_elements.replay).hide();
      this.slider.contract();
      if (this.pointer_active || this.pointer_on_controls) {
        this._show_controls();
      } else {
        this._hide_controls();
      }
    } else {
      this.slider.expand();
      this._show_controls();
      $(player_elements.pause).hide();
      if (this.end) {
        $(player_elements.play).hide();
        $(player_elements.replay).show();
      } else {
        $(player_elements.play).show();
        $(player_elements.replay).hide();
      }
    }
  }

  _hide_controls() {
    $('#viewer-control-container').removeClass('active');
  }

  _show_controls() {
    $('#viewer-control-container').addClass('active');
  }

  // Resize elements by window.
  _resize() {
    let canvas_width = $(player_elements.canvas).prop('width');
    let canvas_height = $(player_elements.canvas).prop('height');
    let canvas_aspect_ratio = canvas_width / canvas_height;
    let window_width = $(window).width();
    let window_height = $(window).height();
    let padding = 50;
    let max_width = window_width - padding;
    let max_height = window_height - padding;
    let width, height;
    // Determine limiting constraint.
    if (max_height * canvas_aspect_ratio > max_width) {
      // Width is the limiting factor.
      width = max_width;
      height = max_width / canvas_aspect_ratio;
    } else {
      // Height is the limiting factor.
      width = max_height * canvas_aspect_ratio;
      height = max_height;
    }
    $(player_elements.canvase).width(width);
    $(player_elements.canvas).height(height);
    let control_padding = 26;
    // Resize control bar.
    $('#viewer-controls').width(width - control_padding);
  }

  set crop_start(val) {
    logger.debug(`Setting crop start to ${val}`);
    this._crop_start = val;
  }

  get crop_start() {
    return this._crop_start;
  }

  set crop_end(val) {
    logger.debug(`Setting crop end to ${val}`);
    this._crop_end = val;
  }

  get crop_end() {
    return this._crop_end;
  }
}

exports.Viewer = Viewer;

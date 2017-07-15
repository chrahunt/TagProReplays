/**
 * Test of WebP -> WebM conversion.
 * 
 * Blob support required so this runs in karma.
 */
const loadImage = require('image-promise');

const logger = require('util/logger')('make-video.spec');
const get_renderer = require('modules/renderer');
const renderVideo = require('modules/make-video');

// Sample frames for rendering.
let frames = [
  // path                          duration
  ['fixtures/render/goodblob.txt', 16],
  ['fixtures/render/badblob.txt',  16]
];

function dataURLtoBlob(dataUrl) {
  let arr = dataUrl.split(',');
  let mime = arr[0].match(/:(.*?);/)[1];
  let bstr = atob(arr[1]);
  let u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([u8arr], {type:mime});
}

// Provides frames in order.
function* frame_source(frames, limit = Infinity) {
  let max = Math.min(frames.length, limit);
  for (let i = 0; i < max; i++) {
    let frame = frames[i];
    yield fetch(frame[0]).then((res) => {
      return res.text();
    })
    .then(dataURLtoBlob)
    .then((blob) => {
      return {frame: blob, duration: frame[1]};
    });
  }
}

// Global canvas element used for rendering.
let can = document.createElement('canvas');
can.id = 'mapCanvas';
document.body.appendChild(can);

// Defaults.
can.width = 1280;
can.height = 800;
can.style.zIndex = 200;
can.style.position = 'absolute';
can.style.top = 0;
can.style.left = 0;

const texture_names = [
  'flair',
  'portal',
  'speedpad',
  'speedpadblue',
  'speedpadred',
  'splats',
  'tiles'
];

/**
 * Given a renderer, returns a pull stream as a
 * generator which returns Promises which resolves to
 * {frame: blob, duration: number}
 */
function* source_from_renderer(renderer) {
  let replay = renderer.replay;
  let me = Object.keys(replay).find(k => replay[k].me == 'me');
  let fps = replay[me].fps;
  let frames = replay.clock.length;
  let end = frames - 1;
  let frame = 0;
  let frame_time = Date.parse(replay.clock[frame]);
  while (frame < end) {
    let next_frame_time = Date.parse(replay.clock[frame + 1]);
    let frame_duration = next_frame_time - frame_time;
    renderer.draw(frame);
    yield renderer.toBlob('image/webp', 0.8)
    .then((blob) => ({frame: blob, duration: frame_duration}));
    frame_time = next_frame_time;
    frame++;
  }
  renderer.draw(frame);
  yield renderer.toBlob('image/webp', 0.8)
  .then((blob) => ({frame: blob, duration: 1000 / fps}));
}
function get_textures() {
  let paths = texture_names.map(name => `/images/${name}.png`);
  return loadImage(paths).then((images) => {
    let out = {};
    texture_names.forEach((name, i) => {
      out[name] = images[i];
    });
    return out;
  });
}

function get_file_source(path) {
  var options = {
    fps:             60,
    duration:        30,
    hotkey_enabled:  true,
    hotkey:          47, // '/' key.
    custom_textures: false,
    canvas_width:    1280,
    canvas_height:   800,
    splats:          true,
    ui:              true,
    chat:            true,
    spin:            true,
    record:          true // Recording enabled.
  };
  return fetch(path)
  .then((response) => response.json())
  .then((replay) => {
    return get_textures().then((textures) => {
      options.textures = textures;
      return get_renderer(can, replay, options);
    });
  })
  .then((renderer) => {
    return source_from_renderer(renderer);
  });
}

describe('converting WebP frames to WebM', () => {
  it('should render WebM', () => {
    return renderVideo(frame_source(frames)).then((data, stats) => { // eslint-disable-line no-unused-vars
      // Don't do anything with output yet, need some way
      // to identify that the video was rendered correctly.
      // But not throwing is good too.
      // ffmpeg validate
      //saveAs(data, 'test.webm');
    });
  });

  it('should handle rendering longer replays', function() {
    this.timeout(0);
    return get_file_source('/fixtures/render/test2DATE1483313925030.txt')
    .then((source) => {
      // We just happen to know the number of frames.
      let frames = 142;
      return renderVideo(source).progress((frame) => {
        // Log progress to avoid timeout.
        if (!(frame % 20))
          logger.info(`Progress: ${frame / frames}`);
      })
    })
    .then(({output, stats}) => { // eslint-disable-line no-unused-vars
      // If we haven't crashed then this is a success.
      // TODO: Save and validate file externally.
    });
  });
});
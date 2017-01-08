/**
 * Test of WebP -> WebM conversion.
 * 
 * Blob support required so this runs in karma.
 */
const expect = require('chai').expect;
const renderVideo = require('modules/make-video');
const saveAs = require('file-saver').saveAs;

// Sample frames for rendering.
let frames = [
  // path                 duration
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
function* frame_source(limit = Infinity) {
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

describe('converting WebP frames to WebM', () => {
  it('should render WebM', () => {
    return renderVideo(frame_source()).then((data) => {
      // Don't do anything with output yet, need some way
      // to identify that the video was rendered correctly.
      // But not throwing is good too.
      // ffmpeg validate
      //saveAs(data, 'test.webm');
    });
  });
});
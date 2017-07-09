const logger = require('util/logger')('whammy');
const {map} = require('util/promise-ext');

/**
 * Partial re-write of Whammy
 * https://github.com/antimatter15/whammy
 *
 * Adds stricter WebP parsing blob support.
 */

/**
 * @param {} frames
 * @returns {}
 */
function toWebM(frames) {
  logger.debug(`toWebM() with ${frames.length} frames`);
  var info = checkFrames(frames);
  
  //max duration by cluster in milliseconds
  var CLUSTER_MAX_DURATION = 30000;
  
  var EBML = [{
    "id": 0x1a45dfa3, // EBML
    "data": [{
      "id": 0x4286, // EBMLVersion
      "data": 1,
    }, {
      "id": 0x42f7, // EBMLReadVersion
      "data": 1,
    }, {
      "id": 0x42f2, // EBMLMaxIDLength
      "data": 4,
    }, {
      "id": 0x42f3, // EBMLMaxSizeLength
      "data": 8,
    }, {
      "id": 0x4282, // DocType
      "data": "webm",
    }, {
      "id": 0x4287, // DocTypeVersion
      "data": 2,
    }, {
      "id": 0x4285, // DocTypeReadVersion
      "data": 2,
    }]
  }, {
    "id": 0x18538067, // Segment
    "data": [{
      "id": 0x1549a966, // Info
      "data": [{
        "id": 0x2ad7b1, // TimecodeScale
        "data": 1e6, //do things in millisecs (num of nanosecs for duration scale)
      }, {
        "id": 0x4d80, // MuxingApp
        "data": "whammy",
      }, {
        "id": 0x5741, // WritingApp
        "data": "whammy",
      }, {
        "id": 0x4489, // Duration
        "data": doubleToBuffer(info.duration),
      }]
    }, {
      "id": 0x1654ae6b, // Tracks
      "data": [{
        "id": 0xae, // TrackEntry
        "data": [{
          "id": 0xd7, // TrackNumber
          "data": 1,
        }, {
          "id": 0x73c5, // TrackUID
          "data": 1,
        }, {
          "id": 0x9c, // FlagLacing
          "data": 0,
        }, {
          "id": 0x22b59c, // Language
          "data": "und",
        }, {
          "id": 0x86, // CodecID
          "data": "V_VP8",
        }, {
          "id": 0x258688, // CodecName
          "data": "VP8",
        }, {
          "id": 0x83, // TrackType
          "data": 1,
        }, {
          "id": 0xe0,  // Video
          "data": [{
            "id": 0xb0, // PixelWidth
            "data": info.width,
          }, {
            "id": 0xba, // PixelHeight
            "data": info.height,
          }]
        }]
      }]
    }, {
      "id": 0x1c53bb6b, // Cues
      "data": [
        //cue insertion point
      ],
    }, /*
      cluster insertion point
    */],
  }];
  
  var segment = EBML[1];
  var cues = segment.data[2];
  
  //Generate clusters (max duration)
  var frameNumber = 0;
  var clusterTimecode = 0;
  while (frameNumber < frames.length) {
    let cuePoint = {
      "id": 0xbb, // CuePoint
      "data": [{
        "id": 0xb3, // CueTime
        "data": Math.round(clusterTimecode),
      }, {
        "id": 0xb7, // CueTrackPositions
        "data": [{
          "id": 0xf7, // CueTrack
          "data": 1,
        }, {
          "id": 0xf1, // CueClusterPosition
          "size": 8,
          "data": 0, // to be filled in when we know it
        }]
      }]
    };
    
    cues.data.push(cuePoint);
    
    var clusterFrames = [];
    var clusterDuration = 0;
    do {
      clusterFrames.push(frames[frameNumber]);
      clusterDuration += frames[frameNumber].duration;
      frameNumber++;
    } while(frameNumber < frames.length && clusterDuration < CLUSTER_MAX_DURATION);
    
    var clusterCounter = 0;
    let blocks = clusterFrames.map(function(webp){
      let header = makeSimpleBlockHeader({
        discardable: 0,
        invisible:   0,
        keyframe:    1,
        lacing:      0,
        trackNum:    1,
        timecode:    Math.round(clusterCounter)
      });
      clusterCounter += webp.duration;
      return {
        id: 0xa3, // SimpleBlock
        blob: new Blob([header, webp.blob])
      };
    });
    var cluster = {
      "id": 0x1f43b675, // Cluster
      "data": [{
        "id": 0xe7, // Timecode
        "data": Math.round(clusterTimecode),
      }].concat(blocks)
    }

    // Add cluster to segment
    segment.data.push(cluster);
    clusterTimecode += clusterDuration;
  }
  
  // First pass to compute cluster positions
  var position = 0;
  for (var i = 0; i < segment.data.length; i++){
    if (i >= 3) {
      cues.data[i-3].data[1].data[1].data = position;
    }
    var data = generateEBML([segment.data[i]]);
    position += data.size || data.byteLength || data.length;
    if (i != 2) { // not cues
      // Save results to avoid having to encode everything twice
      segment.data[i] = data;
    }
  }
  
  return generateEBML(EBML);
}

function checkFrames(frames) {
  let {width, height, duration} = frames[0];
  for (var i = 1; i < frames.length; i++){
    let frame = frames[i];
    if (frame.width != width)
      throw new Error(`Frame ${i + 1} has a different width:`
        + ` ${frame.width} != ${width}`);
    if (frame.height != height)
      throw new Error(`Frame ${i + 1} has a different height:`
        + ` ${frame.height} != ${height}`);
    if (frame.duration < 0 || 0x7fff < frame.duration)
      throw new Error(`Frame ${i + 1} has a weird duration`
        + ` (must be between 0 and 32767): ${frame.duration}`);
    duration += frame.duration;
  }
  return {
    duration: duration,
    width: width,
    height: height
  };
}

/**
 * Parse data structure into simple block header.
 * @param data
 * @param data.trackNumber
 * @param data.timecode
 * @param data.keyframe
 * @param data.invisible
 * @param data.lacing - False or 'Xiph', 'EBML', or 'fixed' - not supported.
 * @param discardable
 */
function makeSimpleBlockHeader(data) {
  let flags = 0;
  if (data.keyframe)    flags |= 0x80;
  if (data.invisible)   flags |= 0x08;
  if (data.lacing) throw new Error('lacing not supported');
  if (data.discardable) flags |= 0x01;
  let trackNum = encodeEbmlValue(data.trackNum);
  let timecode = numToFixedBuffer(data.timecode, 2);
  flags = Uint8Array.from([flags]);
  
  return concatTypedArrays(trackNum, timecode, flags);
}

function concatTypedArrays(a, ...arrays) {
  let length = arrays.reduce((sum, arr) => sum + arr.length, a.length);
  let c = new a.constructor(length);
  c.set(a);
  let offset = a.length;
  for (let arr of arrays) {
    c.set(arr, offset);
    offset += arr.length;
  }
  return c;
}

/**
 * Encode data in UTF-8 like format. Used for IDs (already implicit in the id
 * value used) and size.
 * spec: http://matroska-org.github.io/libebml/specs.html
 * @param {number} val  integer value to be encoded.
 * @returns {Uint8Array}
 */
function encodeEbmlValue(val) {
  let result = val;
  if (val < Math.pow(2, 7) - 2) {
    result |= 0x80;
  } else if (val < Math.pow(2, 14) - 2) {
    result |= 0x4000;
  } else if (val < Math.pow(2, 21) - 2) {
    result |= 0x200000;
  } else if (val < Math.pow(2, 28) - 2) {
    result |= 0x10000000;
  } else if (val < Math.pow(2, 35) - 2) {
    result |= 0x800000000;
  } else if (val < Math.pow(2, 42) - 2) {
    result |= 0x20000000000;
  } else if (val < Math.pow(2, 49) - 2) {
    result |= 0x2000000000000;
  } else if (val < Math.pow(2, 56) - 2) {
    result |= 0x100000000000000;
  } else {
    throw new Error(`${val} is too large to be a valid id/size`);
  }
  return numToBuffer(result);
}

/**
 * Encode a float value to bytes (big-endian).
 *
 * @param {Number} num
 * @returns {Uint8Array}
 */
function doubleToBuffer(num) {
  let arr = new Uint8Array(8);
  let view = new DataView(arr.buffer);
  view.setFloat64(0, num);
  return arr;
}

/**
 * Convert a number representing an unsigned/positive integer to bytes (big-endian).
 * @param {Number} num
 * @returns {Uint8Array}
 */
function numToBuffer(num) {
  var parts = [];
  if (num < 0) throw new Error('Number must be nonnegative');
  // Make sure we add at least 1 number.
  do {
    parts.push(num & 0xff);
    num = num >> 8;
  } while (num);
  return new Uint8Array(parts.reverse());
}

/**
 * Convert a number to bytes (big-endian), truncating to the provided
 * size.
 * @param {Number} num
 * @param {Number} size - size of the buffer in bytes.
 * @returns {Uint8Array}
 */
function numToFixedBuffer(num, size) {
  var parts = new Uint8Array(size);
  for(var i = size - 1; i >= 0; i--){
    parts[i] = num & 0xff;
    num = num >> 8;
  }
  return parts;
}

/**
 * Convert a binary string to bytes.
 * @param {String} str
 * @returns {Uint8Array}
 */
function strToBuffer(str) {
  var arr = new Uint8Array(str.length);
  for(var i = 0; i < str.length; i++){
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

/**
 * Given a nested structure representing ebml, encode into binary.
 * Structure has the format:
 * [{id: Number, data: (Number|Structure|Blob|String)}]
 */
function generateEBML(jsons) {
  var ebml = [];
  
  for (let json of jsons) {
    if (typeof json.id === 'undefined' || ArrayBuffer.isView(json)) {
      // already encoded blob or byteArray
      ebml.push(json);
      continue
    }
    
    var data = json.blob || json.data;
    
    if (!json.blob) {
      // Recurse into data
      if (Array.isArray(data))      data = generateEBML(data);
      if (typeof data === 'number' && 'size' in json) data = numToFixedBuffer(data, json.size);
      if (typeof data === 'number') data = numToBuffer(data);
      if (typeof data === 'string') data = strToBuffer(data);
    }
    
    var len = data.size || data.byteLength || data.length;
    
    // id
    ebml.push(numToBuffer(json.id));
    // size
    ebml.push(encodeEbmlValue(len));
    // data
    ebml.push(data);
  }
  
  return new Blob(ebml, {type: 'video/webm'});
}


// Sanity check WebP parsing.
function parseAssert(msg, test) {
  if (!test) {
    let err = new Error(msg);
    err.name = 'WebPParseError';
    throw err;
  }
  return true;
}

/**
 * Read FourCC at given offset and return string.
 * @param {DataView} view  the view referencing the buffer.
 * @param {number} offset  the offset from which to read the value.
 * @returns {string}  the extracted string
 */
function readFourCC(view, offset = 0) {
  return String.fromCharCode(view.getUint8(offset),
                             view.getUint8(offset + 1),
                             view.getUint8(offset + 2),
                             view.getUint8(offset + 3));
}

const CHUNK_HEADER_SIZE = 8;
/**
 * Given an ArrayBuffer of length at least offset + CHUNK_HEADER_SIZE,
 * parse the chunk header from it.
 * @param {ArrayBuffer} buffer
 * @param {number} offset
 * @returns {object}
 */
function parseChunk(buffer, offset = 0) {
  let view = new DataView(buffer, offset, CHUNK_HEADER_SIZE);

  let chunk = {
    FourCC: readFourCC(view),
    Size: view.getUint32(4, true),
    Offset: offset + 8
  };
  // @optimization: don't create payload here.
  chunk.Payload = buffer.slice(chunk.Offset, chunk.Offset + chunk.Size);
  // Odd-sized chunks have a 0 padding.
  let next = (chunk.Size % 2 == 0) ? offset + 8 + chunk.Size
                                   : offset + 8 + chunk.Size + 1;
  return [chunk, next];
}

/**
 * Get 24-bit unsigned int (little-endian) from view.
 * @param {ArrayBuffer} view
 * @param {Number} offset
 * @returns {Number}
 */
function getUint24le(view, offset = 0) {
  return (view.getUint8(offset + 2) << 16) |
         (view.getUint8(offset + 1) <<  8) |
          view.getUint8(offset);
}

/**
 * Get 24-bit unsigned int (big-endian) from view.
 * @param {ArrayBuffer} view
 * @param {Number} offset
 * @returns {Number}
 */
function getUint24(view, offset = 0) {
  return (view.getUint8(offset    ) << 16) |
         (view.getUint8(offset + 1) <<  8) |
          view.getUint8(offset + 2);
}

/**
 * Parse VP8 into keyframe and width/height.
 * https://tools.ietf.org/html/rfc6386
 * - section 19.1
 * @param {Chunk} chunk
 */
function parseVP8(chunk) {
  // @optimization: don't construct DataView over entire payload
  let view = new DataView(chunk.Payload);
  let offset = 0;
  let data_start = offset;
  // 3 byte frame tag
  let tmp = getUint24le(view, offset);
  offset += 3;
  let key_frame       =  tmp       & 0x1;
  let version         = (tmp >> 1) & 0x7;
  let show_frame      = (tmp >> 4) & 0x1;
  let first_part_size = (tmp >> 5) & 0x7FFFF;
  //parseAssert(`VP8 chunk must be a key frame`, key_frame);
  // 3 byte start code
  let start_code = getUint24(view, offset);
  offset += 3;
  parseAssert(`start code ${start_code} must equal 0x9d012a`, start_code === 0x9d012a);
  let horizontal_size_code = view.getUint16(offset, true);
  offset += 2;
  let width = horizontal_size_code & 0x3FFF;
  let horizontal_scale = horizontal_size_code >> 14;
  let vertical_size_code = view.getUint16(offset, true);
  offset += 2;
  let height = vertical_size_code & 0x3FFF;
  let vertical_scale = vertical_size_code >> 14;
  return {
    width: width,
    height: height,
    blob: new Blob([chunk.Payload.slice(data_start)])
  };
}

/**
 * Parse WebP into just VP8.
 * @param {Object} riff
 * @returns {Object}
 */
function parseWebP(blob, id) {
  return Promise.resolve(blob).then(function(blob) {
    // @optimization: don't read whole blob at once.
    let res = new Response(blob);
    return res.arrayBuffer().then((buffer) => {
      //logger.debug(`Got arraybuffer for ${id}`);
      let view = new DataView(buffer);
      let offset = 0;
      let label = readFourCC(view, offset);
      offset += 4;
      parseAssert(`${label} must equal RIFF`, label === 'RIFF');
      let size = view.getUint32(offset, true);
      offset += 4;
      label = readFourCC(view, 8);
      // Bytes read out of `size`.
      let read = 4;
      offset += 4;
      parseAssert(`${label} must equal WEBP`, label === 'WEBP');
      // @optimization: stop reading chunks when we find VP8.
      let chunks = [];
      while (offset < size - 8) {
        let chunk;
        [chunk, offset] = parseChunk(buffer, offset);
        chunks.push(chunk);
      }

      let vp8 = chunks.find(c => c.FourCC === 'VP8 ');
      parseAssert('VP8 chunk must exist', vp8);
      // @optimization: read payload from Blob before passing to parseVP8.
      return parseVP8(vp8);
    });
  });
}

/**
 * Convert frames.
 * @param {} frames
 * @returns {}
 */
function getFramesPromises(frames) {
  return map(frames[Symbol.iterator](), (frame, i) => {
    //logger.debug(`Parsing ${i}`);
    return parseWebP(frame.imageBlob, i)
    .then((webp) => {
      //logger.debug(`Parsed ${i}`);
      webp.duration = frame.duration;
      return webp;
    });
  }, { concurrency: 100 });
}

function WhammyVideo() {
  this.frames = [];
}
exports.Video = WhammyVideo;

WhammyVideo.prototype.add = function(frame, duration) {
  if (frame[Symbol.toStringTag] === 'Blob') {
    let frame1 = {
      imageBlob: frame,
      duration: duration
    };
    this.frames.push(frame1);
  } else {
    throw new Error('Only Blobs are supported.');
  }
};

WhammyVideo.prototype.compile = function() {
  return getFramesPromises(this.frames).then(toWebM);
};

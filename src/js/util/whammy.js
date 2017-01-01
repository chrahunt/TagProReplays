const logger = require('util/logger')('whammy');

module.exports = (function() {
  // in this case, frames has a very specific meaning, which will be
  // detailed once i finish writing the code
  
  function toWebM(frames) {
    logger.debug(`toWebM() with ${frames.length} frames`);
    var info = checkFrames(frames);
    
    //max duration by cluster in milliseconds
    var CLUSTER_MAX_DURATION = 30000;
    
    var EBML = [
      {
        "id": 0x1a45dfa3, // EBML
        "data": [
          {
            "data": 1,
            "id": 0x4286 // EBMLVersion
          },
          {
            "data": 1,
            "id": 0x42f7 // EBMLReadVersion
          },
          {
            "data": 4,
            "id": 0x42f2 // EBMLMaxIDLength
          },
          {
            "data": 8,
            "id": 0x42f3 // EBMLMaxSizeLength
          },
          {
            "data": "webm",
            "id": 0x4282 // DocType
          },
          {
            "data": 2,
            "id": 0x4287 // DocTypeVersion
          },
          {
            "data": 2,
            "id": 0x4285 // DocTypeReadVersion
          }
        ]
      },
      {
        "id": 0x18538067, // Segment
        "data": [
          {
            "id": 0x1549a966, // Info
            "data": [
              {
                "data": 1e6, //do things in millisecs (num of nanosecs for duration scale)
                "id": 0x2ad7b1 // TimecodeScale
              },
              {
                "data": "whammy",
                "id": 0x4d80 // MuxingApp
              },
              {
                "data": "whammy",
                "id": 0x5741 // WritingApp
              },
              {
                "data": doubleToString(info.duration),
                "id": 0x4489 // Duration
              }
            ]
          },
          {
            "id": 0x1654ae6b, // Tracks
            "data": [
              {
                "id": 0xae, // TrackEntry
                "data": [
                  {
                    "data": 1,
                    "id": 0xd7 // TrackNumber
                  },
                  {
                    "data": 1,
                    "id": 0x73c5 // TrackUID
                  },
                  {
                    "data": 0,
                    "id": 0x9c // FlagLacing
                  },
                  {
                    "data": "und",
                    "id": 0x22b59c // Language
                  },
                  {
                    "data": "V_VP8",
                    "id": 0x86 // CodecID
                  },
                  {
                    "data": "VP8",
                    "id": 0x258688 // CodecName
                  },
                  {
                    "data": 1,
                    "id": 0x83 // TrackType
                  },
                  {
                    "id": 0xe0,  // Video
                    "data": [
                      {
                        "data": info.width,
                        "id": 0xb0 // PixelWidth
                      },
                      {
                        "data": info.height,
                        "id": 0xba // PixelHeight
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            "id": 0x1c53bb6b, // Cues
            "data": [
              //cue insertion point
            ]
          }

          //cluster insertion point
        ]
      }
    ];
    
    var segment = EBML[1];
    var cues = segment.data[2];
    
    //Generate clusters (max duration)
    var frameNumber = 0;
    var clusterTimecode = 0;
    while(frameNumber < frames.length) {
      let cuePoint = {
        "id": 0xbb, // CuePoint
        "data": [
          {
            "data": Math.round(clusterTimecode),
            "id": 0xb3 // CueTime
          },
          {
            "id": 0xb7, // CueTrackPositions
            "data": [
              {
                "data": 1,
                "id": 0xf7 // CueTrack
              },
              {
                "data": 0, // to be filled in when we know it
                "size": 8,
                "id": 0xf1 // CueClusterPosition
              }
            ]
          }
        ]
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
        var block = makeSimpleBlock({
          discardable: 0,
          invisible: 0,
          keyframe: 1,
          lacing: 0,
          trackNum: 1,
          timecode: Math.round(clusterCounter)
        });
        clusterCounter += webp.duration;
        return {
          blob: new Blob([block, webp.blob]),
          id: 0xa3
        };
      });
      var cluster = {
        "id": 0x1f43b675, // Cluster
        "data": [
          {
            "data": Math.round(clusterTimecode),
            "id": 0xe7 // Timecode
          }
        ].concat(blocks)
      }
 
      //Add cluster to segment
      segment.data.push(cluster);
      clusterTimecode += clusterDuration;
    }
    
    //First pass to compute cluster positions
    var position = 0;
    for(var i = 0; i < segment.data.length; i++){
      if (i >= 3) {
        cues.data[i-3].data[1].data[1].data = position;
      }
      var data = generateEBML([segment.data[i]]);
      position += data.size || data.byteLength || data.length;
      if (i != 2) { // not cues
        //Save results to avoid having to encode everything twice
        segment.data[i] = data;
      }
    }
    
    return generateEBML(EBML);
  }
  
  // sums the lengths of all the frames and gets the duration, woo
  
  function checkFrames(frames) {
    let {width, height, duration} = frames[0];
    for (var i = 1; i < frames.length; i++){
      let frame = frames[i];
      if(frame.width != width) throw "Frame " + (i + 1) + " has a different width: "+frame.width+' != '+width;
      if(frame.height != height) throw "Frame " + (i + 1) + " has a different height: "+frame.height+' != '+height;
      if(frame.duration < 0 || frame.duration > 0x7fff) throw "Frame " + (i + 1) + " has a weird duration (must be between 0 and 32767): "+frame.duration;
      duration += frame.duration;
    }
    return {
      duration: duration,
      width: width,
      height: height
    };
  }
  
  function numToBuffer(num) {
    var parts = [];
    while(num > 0){
      parts.push(num & 0xff);
      num = num >> 8;
    }
    return new Uint8Array(parts.reverse());
  }
  
  function numToFixedBuffer(num, size) {
    var parts = new Uint8Array(size);
    for(var i = size - 1; i >= 0; i--){
      parts[i] = num & 0xff;
      num = num >> 8;
    }
    return parts;
  }
  
  function strToBuffer(str) {
    var arr = new Uint8Array(str.length);
    for(var i = 0; i < str.length; i++){
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  }
  
  function bitsToBuffer(bits) {
    var data = [];
    var pad = (bits.length % 8) ? (new Array(1 + 8 - (bits.length % 8))).join('0') : '';
    bits = pad + bits;
    for(var i = 0; i < bits.length; i+= 8){
      data.push(parseInt(bits.substr(i,8),2));
    }
    return new Uint8Array(data);
  }

  function generateEBML(jsons) {
    var ebml = [];
    
    for (let json of jsons) {
      if (!('id' in json)) {
        // already encoded blob or byteArray
        ebml.push(json);
        continue
      }
      
      var data = json.blob || json.data;
      
      if (!json.blob) {
        if (typeof data === 'object') data = generateEBML(data);
        if (typeof data === 'number') data = 'size' in json ? numToFixedBuffer(data, json.size) : bitsToBuffer(data.toString(2));
        if (typeof data === 'string') data = new Blob([strToBuffer(data)]);
      }
      
      var len = data.size || data.byteLength || data.length;
      var zeroes = Math.ceil(Math.ceil(Math.log(len) / Math.log(2)) / 8);
      var size_str = len.toString(2);
      var padded = '0'.repeat((zeroes * 7 + 7) - size_str.length) + size_str;
      var size = '0'.repeat(zeroes) + '1' + padded;
      
      // i actually dont quite understand what went on up there, so I'm not really
      // going to fix this, i'm probably just going to write some hacky thing which
      // converts that string into a buffer-esque thing
      
      ebml.push(numToBuffer(json.id));
      ebml.push(bitsToBuffer(size));
      ebml.push(data);
    }
    
    return new Blob(ebml, {type: 'video/webm'});
  }
  
  //woot, a function that's actually written for this project!
  //this parses some json markup and makes it into that binary magic
  //which can then get shoved into the matroska comtainer (peaceably)
  
  function makeSimpleBlock(data) {
    var flags = 0;
    if (data.keyframe) flags |= 128;
    if (data.invisible) flags |= 8;
    if (data.lacing) flags |= (data.lacing << 1);
    if (data.discardable) flags |= 1;
    if (data.trackNum > 127) {
      throw "TrackNumber > 127 not supported";
    }
		
    return new Uint8Array([
      data.trackNum | 0x80,
      data.timecode >> 8,
      data.timecode & 0xff,
      flags
    ]);
  }
  
  function parseWebP(riff) {
    return riff.RIFF[0].then(function(RIFF) {
      let {width, height, blob} = RIFF.WEBP[0];
      return {width, height, riff: {RIFF: [RIFF]}, blob};
    });
  }
  
  function parseRIFF(blob) {
    return Promise.resolve(blob).then(function(blob) {
      var offset = 0;
      var chunks = {};
      
      let res = new Response(blob.slice(0, 64));
      return res.arrayBuffer().then(function(buffer) {
        let dw = new DataView(buffer);
        let _id = dw.getUint32(0)
        let ids = {
          1464156752: 'WEBP',
          1380533830: 'RIFF',
          0: 'LIST'
        };
        
        while (offset < blob.size) {
          var id = ids[_id];
          chunks[id] = chunks[id] || [];
          if (ids[_id] === 'RIFF' || id === 'LIST') {
            let len = dw.getUint32(4);
            offset += 8 + len;
            chunks[id].push(parseRIFF(blob.slice(8)).then(function(out) {
              return out;
            }));
          } else if (id === 'WEBP') {
            let width = dw.getUint16(18,true); //smaller size: dw.getUint8(18);
            let height = dw.getUint16(20,true); //smaller size: dw.getUint8(20);
            let chunk = blob.slice(offset + 12);
            
            chunks.WEBP.push({width, height, blob: chunk});
            offset = blob.size;
          }
        }
        
        return chunks;
      });
    });
  }

  // For encoding 'duration'
  function doubleToString(num) {
    return new Uint8Array(new Float64Array([num])).map(e => String.fromCharCode(e)).reverse().join('');
  }
  
  function getFramesPromises(frames) {
    return frames.map((frame) => {
      return parseRIFF(frame.imageBlob)
      .then(parseWebP)
      .then((webp) => {
        webp.duration = frame.duration;
        return webp;
      });
    });
  }

  function WhammyVideo() {
    this.frames = [];
  }

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
    return Promise.all(getFramesPromises(this.frames))
    .then(toWebM);
  };

  return {
    Video: WhammyVideo,
    toWebM: toWebM
  };
})();

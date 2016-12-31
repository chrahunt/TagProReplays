module.exports = (function() {
  // in this case, frames has a very specific meaning, which will be
  // detailed once i finish writing the code
  
  function toWebM(frames) {
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
      var cluster = {
        "id": 0x1f43b675, // Cluster
        "data": [
          {
            "data": Math.round(clusterTimecode),
            "id": 0xe7 // Timecode
          }
        ].concat(clusterFrames.map(function(webp){
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
        }))
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
    var width = frames[0].width,
    height = frames[0].height,
    duration = frames[0].duration;
    for(var i = 1; i < frames.length; i++){
      if(frames[i].width != width) throw "Frame " + (i + 1) + " has a different width: "+frames[i].width+' != '+width;
      if(frames[i].height != height) throw "Frame " + (i + 1) + " has a different height: "+frames[i].height+' != '+height;
      if(frames[i].duration < 0 || frames[i].duration > 0x7fff) throw "Frame " + (i + 1) + " has a weird duration (must be between 0 and 32767): "+frames[i].duration;
      duration += frames[i].duration;
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
    // this is slower
    // return new Uint8Array(str.split('').map(function(e){
    // 	return e.charCodeAt(0)
    // }))
  }
  
  //sorry this is ugly, and sort of hard to understand exactly why this was done
  // at all really, but the reason is that there's some code below that i dont really
  // feel like understanding, and this is easier than using my brain.
  
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
  
  // here's something else taken verbatim from weppy, awesome rite?
  
  function parseWebP(riff) {
    return riff.RIFF[0].then(function(RIFF) {
      let {width, height, blob} = RIFF.WEBP[0];
      return {width, height, riff: {RIFF: [RIFF]}, blob};
    });
  }
  
  // i think i'm going off on a riff by pretending this is some known
  // idiom which i'm making a casual and brilliant pun about, but since
  // i can't find anything on google which conforms to this idiomatic
  // usage, I'm assuming this is just a consequence of some psychotic
  // break which makes me make up puns. well, enough riff-raff (aha a
  // rescue of sorts), this function was ripped wholesale from weppy
  
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

	// here's a little utility function that acts as a utility for other functions
	// basically, the only purpose is for encoding "Duration", which is encoded as
	// a double (considerably more difficult to encode than an integer)
  function doubleToString(num) {
    return new Uint8Array(new Float64Array([num])).map(e => String.fromCharCode(e)).reverse().join('');
  }
  
  function getFramesPromises(frames) {
    window.framers = frames;
    let promises = [];
    for(let i = 0;i < frames.length;i++) {
      let frame1 = frames[i];
      let p = parseRIFF(frame1.imageBlob).then(rff => {
        return parseWebP(rff).then(function(webp) {
          webp.duration = frame1.duration;
          return webp;
        });
      });
      promises.push(p);
    }
    return promises;
  }

  function WhammyVideo(fps, numFrames, quality) { // a more abstract-ish API
    this.frames = Array.apply(null, Array(numFrames)); //fill array with 'undefined's
    this.duration = 1000 / fps;
    this.quality = quality || 0.8;
  }

  WhammyVideo.prototype.add = function(frame, pos, duration) {
    if(typeof duration != 'undefined' && this.duration) throw "you can't pass a duration if the fps is set";
    if(typeof duration == 'undefined' && !this.duration) throw "if you don't have the fps set, you need to have durations here.";
		
    if (frame[Symbol.toStringTag] === 'Blob') {
      let frame1 = {
        imageBlob: frame,
        duration: duration || this.duration
      };
      this.frames[pos] = frame1; //frames may not come in order
      return this.frames.indexOf(undefined)===-1; //any frames left to fill?
    }
  }
  
  WhammyVideo.prototype.compile = function() {
    return Promise.all(getFramesPromises(this.frames)).then(toWebM);
  }

  return {
    Video: WhammyVideo,
    toWebM: toWebM
  }
})();
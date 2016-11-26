const $ = require('jquery');
const loadImage = require('image-promise');

const Cookies = require('./cookies');
const get_renderer = require('./renderer');
const logger = require('./logger')('renderer');

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

module.exports = (id) => {
  get_replay(id).then((replay) => {
    createReplay(id, replay);
  });
};

// Create and display UI for in-browser preview.
function createReplay(id, positions) {
  let replay_name = id;
  // Initialize values
  let frame = 0;
  var playing = false;
  // Get player that corresponds to recording user ball.
  let fps;
  for (let j in positions) {
    if (positions[j].me == 'me') {
      fps = positions[j].fps;
      break;
    }
  }
  
  var tileSize = 40

  var preview_holder = document.createElement('div');
  preview_holder.id = 'tpr-previewer';
  document.body.appendChild(preview_holder);

  // Canvas for main display
  var canvas = $('<canvas>');
  var can = canvas[0];
  can.width = 30 * tileSize;
  can.height = 18 * tileSize;
  canvas.css({
    background: 'black',
    border: '10px solid white',
    zIndex: 1200,
    position: 'absolute',
    top: (window.innerHeight - (18 * tileSize) - 20) / 2 + 'px',
    left: (window.innerWidth - (30 * tileSize) - 20) / 2 + 'px',
    display: 'black',
    transition: 'opacity 0.5s linear',
    opacity: 0
  });

  preview_holder.appendChild(can);
  var context = can.getContext('2d');

  var renderer;
  chrome.storage.promise.local.get('options').then((items) => {
    if (!items.options) throw new Error('No options set.');
    return get_renderer(can, positions, items.options);
  }).then((created_renderer) => {
    renderer = created_renderer;
    logger.info('Renderer loaded.');
    renderer.draw(frame);
  });

  ////////////////////////////////
  /////     Playback bar     /////
  ////////////////////////////////

  // create area to hold buttons and slider bar

  var playbackBarDiv = document.createElement('div')
  playbackBarDiv.style.position = 'absolute'
  playbackBarDiv.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
  playbackBarDiv.style.left = can.style.left
  playbackBarDiv.style.width = can.width + 20 + 'px'
  playbackBarDiv.style.height = '90px'
  playbackBarDiv.style.transition = "opacity 0.25s linear"
  playbackBarDiv.style.zIndex = 1300
  playbackBarDiv.id = 'playbackBarDiv'
  playbackBarDiv.style.backgroundColor = 'black'
  preview_holder.appendChild(playbackBarDiv)

  // create white bar showing area that will be cropped
  var whiteBar = document.createElement('div')
  whiteBar.style.position = 'absolute'
  whiteBar.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
  whiteBar.style.left = can.style.left
  whiteBar.style.width = can.width + 20 + 'px'
  whiteBar.style.height = '20px'
  whiteBar.style.transition = "opacity 0.25s linear"
  whiteBar.style.zIndex = 1300
  whiteBar.id = 'whiteBar'
  whiteBar.style.backgroundColor = 'white'
  preview_holder.appendChild(whiteBar)

  // create grey bar showing area that will be kept
  var greyBar = document.createElement('div')
  greyBar.style.position = 'absolute'
  greyBar.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
  greyBar.style.left = can.style.left
  greyBar.style.width = can.width + 20 + 'px'
  greyBar.style.height = '20px'
  greyBar.style.transition = "opacity 0.25s linear"
  greyBar.style.zIndex = 1300
  greyBar.id = 'greyBar'
  greyBar.style.backgroundColor = 'grey'
  preview_holder.appendChild(greyBar)

  // create slider bar to hold slider
  var sliderBar = document.createElement('div')
  sliderBar.style.position = 'absolute'
  sliderBar.style.top = +can.style.top.replace('px', '') + can.height + 20 + 'px'
  sliderBar.style.left = can.style.left
  sliderBar.style.width = can.width + 20 + 'px'
  sliderBar.style.height = '20px'
  sliderBar.style.transition = "opacity 0.25s linear"
  sliderBar.style.zIndex = 1300
  sliderBar.id = 'sliderBar'
  sliderBar.style.backgroundColor = 'transparent'
  preview_holder.appendChild(sliderBar)

  // Play/seek slider.
  $('#sliderBar').append('<input type="range" id="slider">');
  var slider = document.getElementById('slider')
  slider.style.width = $('#sliderBar')[0].style.width;
  slider.style.transition = "opacity 0.25s linear";
  slider.style.zIndex = 1300;
  slider.value = 0;
  slider.min = 0;
  slider.max = positions.clock.length - 1;
  slider.onmousedown = () => {
    pause();
  };
  slider.onchange = function () {
    logger.debug('slider onchange()');
    frame = parseInt(this.value);
    renderer.draw(frame);
    pause();
  };

  ////////////////////////////////////
  /////     Playback buttons     /////
  ////////////////////////////////////
  let playInterval;
  function play(start, end) {
    logger.info(`Playing from frame ${start} to frame ${end}.`);
    if (playing) {
      clearInterval(playInterval);
    }

    // Source for frames.
    function* frames() {
      let frame = start;
      let frame_time = new Date(positions.clock[frame]).getTime();
      while (frame < end) {
        let next_frame_time = new Date(positions.clock[frame + 1]).getTime();
        let frame_duration = next_frame_time - frame_time;
        yield [frame, frame_duration];
        frame_time = next_frame_time;
        frame++;
      }
      yield [frame, 0];
    }

    playing = true;

    let reel = frames();
    playInterval = setTimeout(function animate() {
      let {value, done} = reel.next();
      if (done) return;
      let duration;
      [frame, duration] = value;
      renderer.draw(frame);
      slider.value = frame;
      let average_render_time = (renderer.total_render_time / renderer.rendered_frames);
      playInterval = setTimeout(animate, duration - average_render_time);
    });
  }

  function pause() {
    clearTimeout(playInterval);
    playing = false;
  }

  // functions to show, hide, and remove buttons
  function showButtons() {
    var buttons = {
      pause: pauseButton,
      play: playButton,
      stop: stopButton,
      reset: resetButton
    };
    for (let button of Object.values(buttons)) {
      button.style.opacity = "1.0";
      button.style.cursor = "pointer";
    }
  }

  // functions to control replay playback
  function resetReplay() {
    logger.info('resetReplay()');
    pause();
    frame = 0;
    renderer.draw(frame);
    slider.value = 0;
  }

  function stopReplay(doNotReopen) {
    logger.info('stopReplay()');
    if (playing) {
      clearTimeout(playInterval);
      playing = false;
    }
    frame = 0;

    if (!doNotReopen) {
      $('#menuContainer').show();
    }
    preview_holder.style.opacity = 0;
    setTimeout(() => {
      preview_holder.remove();
    }, 600);
  }

  function playReplay() {
    logger.info('playReplay()');
    let end = positions.clock.length - 1;
    let start = frame >= end ? 0
                             : frame;
    play(start, positions.clock.length - 1);
  }

  function pauseReplay() {
    logger.info('pauseReplay()');
    pause();
  }

  // cropping functions
  let crop_start = 0;
  let crop_end = 1;
  function setCropStart() {
    crop_start = +$('#slider')[0].value / +$('#slider')[0].max;
    greyBarStart = crop_start * $('#whiteBar').width() + +$('#whiteBar')[0].style.left.replace('px', '');
    if (crop_start >= crop_end) {
      crop_end = 1;
    }
    $('#greyBar')[0].style.left = greyBarStart + 'px';
    greyBarEnd = crop_end * $('#whiteBar').width() + +$('#whiteBar')[0].style.left.replace('px', '');
    $('#greyBar').width(greyBarEnd - greyBarStart) + 'px';
  }

  function setCropEnd() {
    crop_end = +$('#slider')[0].value / +$('#slider')[0].max;
    greyBarEnd = crop_end * $('#whiteBar').width();
    if (crop_end <= crop_start) {
      crop_start = 0;
    }
    greyBarStart = crop_start * $('#whiteBar').width() + +$('#whiteBar')[0].style.left.replace('px', '');
    $('#greyBar')[0].style.left = greyBarStart + 'px';
    $('#greyBar').width(greyBarEnd - greyBarStart + +$('#whiteBar')[0].style.left.replace('px', '')) + 'px';
  }

  function getCropRange() {
    let total = positions.clock.length - 1;
    let start = Math.floor(crop_start * total);
    let end = Math.floor(crop_end * total);
    return [start, end];
  }

  function playCroppedMovie() {
    let [start, end] = getCropRange();
    play(start, end);
  }

  // delete, render, and rename functions

  // delete this replay
  function deleteThisReplay() {
    logger.info('deleteThisReplay()');
    let replayToDelete = id;
    if (replayToDelete != null) {
      if (confirm('Are you sure you want to delete this replay?')) {
        stopReplay(false);
        setTimeout(() => {
          logger.info(`Sending request to delete: ${replayToDelete}`);
          chrome.runtime.sendMessage({
            method:   'replay.delete',
            ids: [replayToDelete]
          });
        }, 500);
      }
    }
  }

  // rename this replay
  function renameThisReplay() {
    logger.info('renameThisReplay()');
    let replayToRename = id;
    if (replayToRename != null) {
      let datePortion = replayToRename.replace(/.*DATE/, '').replace('replays', '')
      let newName = prompt('How would you like to rename ' + replayToRename.replace(/DATE.*/, '') + '?')
      if (newName != null) {
        stopReplay(false);
        newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '') + "DATE" + datePortion;
        logger.info(`Requesting replay rename for ${replayToRename} to ${newName}.`);
        chrome.runtime.sendMessage({
          method: 'replay.rename',
          id: replayToRename,
          newName: newName
        });
      }
    }
  }

  // playback control buttons
  var buttonURLs = {
    'stop':    'http://i.imgur.com/G32WYvH.png',
    'play':    'http://i.imgur.com/KvSKqpI.png',
    'pause':   'http://i.imgur.com/aSpd4cK.png',
    'forward': 'http://i.imgur.com/TVtAO69.png',
    'reset':   'http://i.imgur.com/vs3jWpc.png'
  };

  // stop button
  var stopButton = new Image()
  stopButton.id = 'stopButton'
  stopButton.src = buttonURLs['stop']
  stopButton.onclick = function () {
    stopReplay(false);
  }
  stopButton.style.position = "absolute"
  stopButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
  stopButton.style.left = +can.style.left.replace('px', '') + 20 + 'px'
  stopButton.style.transition = "opacity 0.25s linear"
  stopButton.style.zIndex = 1300
  stopButton.style.opacity = 0
  preview_holder.appendChild(stopButton)

  // reset button
  var resetButton = new Image()
  resetButton.id = 'resetButton'
  resetButton.src = buttonURLs['reset']
  resetButton.onclick = resetReplay
  resetButton.style.position = "absolute"
  resetButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
  resetButton.style.left = +can.style.left.replace('px', '') + 80 + 'px'
  resetButton.style.transition = "opacity 0.25s linear"
  resetButton.style.zIndex = 1300
  resetButton.style.opacity = 0
  preview_holder.appendChild(resetButton)

  // play button
  var playButton = new Image()
  playButton.id = 'playButton'
  playButton.src = buttonURLs['play']
  playButton.onclick = playReplay
  playButton.style.position = "absolute"
  playButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
  playButton.style.left = +can.style.left.replace('px', '') + 140 + 'px'
  playButton.style.transition = "opacity 0.25s linear"
  playButton.style.zIndex = 1300
  playButton.style.opacity = 0
  preview_holder.appendChild(playButton)

  // pause button
  var pauseButton = new Image()
  pauseButton.id = 'pauseButton'
  pauseButton.src = buttonURLs['pause']
  pauseButton.onclick = pauseReplay
  pauseButton.style.position = "absolute"
  pauseButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 25 + 'px'
  pauseButton.style.left = +can.style.left.replace('px', '') + 200 + 'px'
  pauseButton.style.transition = "opacity 0.25s linear"
  pauseButton.style.zIndex = 1300
  pauseButton.style.opacity = 0
  preview_holder.appendChild(pauseButton)

  // crop start button
  $('#pauseButton').after('<button id="cropStartButton">Crop Start')
  var cropStartButton = document.getElementById('cropStartButton')
  cropStartButton.style.position = 'absolute'
  cropStartButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
  cropStartButton.style.left = +pauseButton.style.left.replace('px', '') + 70 + 'px'
  cropStartButton.style.height = '40px'
  cropStartButton.style.fontSize = '20px'
  cropStartButton.style.fontWeight = 'bold'
  cropStartButton.style.transition = "opacity 0.25s linear"
  cropStartButton.style.zIndex = 1300
  cropStartButton.style.cursor = "pointer"
  cropStartButton.onclick = setCropStart
  cropStartButton.title = 'This sets the beginning of the cropped portion of the replay. Everything before this point will be erased when you crop the replay.'

  // crop End button
  $('#cropStartButton').after('<button id="cropEndButton">Crop End')
  var cropEndButton = document.getElementById('cropEndButton')
  cropEndButton.style.position = 'absolute'
  cropEndButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
  cropEndButton.style.left = +cropStartButton.style.left.replace('px', '') + $('#cropStartButton').width() + 20 + 'px'
  cropEndButton.style.height = '40px'
  cropEndButton.style.fontSize = '20px'
  cropEndButton.style.fontWeight = 'bold'
  cropEndButton.style.transition = "opacity 0.25s linear"
  cropEndButton.style.zIndex = 1300
  cropEndButton.style.cursor = "pointer"
  cropEndButton.onclick = setCropEnd
  cropEndButton.title = 'This sets the end of the cropped portion of the replay. Everything after this point will be erased when you crop the replay.'

  // play cropped movie button
  $('#cropEndButton').after('<button id="playCroppedMovieButton">Play Cropped')
  var playCroppedMovieButton = document.getElementById('playCroppedMovieButton')
  playCroppedMovieButton.style.position = 'absolute'
  playCroppedMovieButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
  playCroppedMovieButton.style.left = +cropEndButton.style.left.replace('px', '') + $('#cropEndButton').width() + 20 + 'px'
  playCroppedMovieButton.style.height = '40px'
  playCroppedMovieButton.style.fontSize = '20px'
  playCroppedMovieButton.style.fontWeight = 'bold'
  playCroppedMovieButton.style.transition = "opacity 0.25s linear"
  playCroppedMovieButton.style.zIndex = 1300
  playCroppedMovieButton.style.cursor = "pointer"
  playCroppedMovieButton.onclick = playCroppedMovie
  playCroppedMovieButton.title = 'This plays the section of the replay between the "crop start" and "crop end" so you know what your cropped replay will look like.'

  // crop button
  $('#playCroppedMovieButton').after('<button id="cropButton">Crop')
  var cropButton = document.getElementById('cropButton')
  cropButton.style.position = 'absolute'
  cropButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
  cropButton.style.left = +playCroppedMovieButton.style.left.replace('px', '') + $('#playCroppedMovieButton').width() + 20 + 'px'
  cropButton.style.height = '40px'
  cropButton.style.fontSize = '20px'
  cropButton.style.fontWeight = 'bold'
  cropButton.style.transition = "opacity 0.25s linear"
  cropButton.style.zIndex = 1300
  cropButton.style.cursor = "pointer"
  cropButton.onclick = function () {
    let [start, end] = getCropRange();
    let newName = prompt('If you would also like to name the new cropped replay, type the new name here. Leave it blank to make a generic name.');
    if (newName === null) return;
    if (newName === '') {
      newName = 'replays' + Date.now();
    } else {
      newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '');
      newName += 'DATE' + Date.now();
    }
    stopReplay(false);
    chrome.runtime.sendMessage({
      method: 'replay.crop',
      start: start,
      end: end,
      id: id,
      new_name: newName
    });
  }
  cropButton.title = 'This actually crops the replay. It leaves the original replay intact, though, and saves a new cropped replay.'

  // crop and replace button
  $('#cropButton').after('<button id="cropAndReplaceButton">Crop and Replace')
  var cropAndReplaceButton = document.getElementById('cropAndReplaceButton')
  cropAndReplaceButton.style.position = 'absolute'
  cropAndReplaceButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
  cropAndReplaceButton.style.left = +cropButton.style.left.replace('px', '') + $('#cropButton').width() + 20 + 'px'
  cropAndReplaceButton.style.height = '40px'
  cropAndReplaceButton.style.fontSize = '20px'
  cropAndReplaceButton.style.fontWeight = 'bold'
  cropAndReplaceButton.style.transition = "opacity 0.25s linear"
  cropAndReplaceButton.style.zIndex = 1300
  cropAndReplaceButton.style.cursor = "pointer"
  cropAndReplaceButton.onclick = function () {
    let [start, end] = getCropRange();
    var newName = prompt('If you would also like to rename this replay, type the new name here. Leave it blank to keep the old name.');
    if (newName === null) return;
    if (newName === '') {
      var oldName = replay_name;
      newName = replay_name;
    } else {
      var oldName = replay_name;
      newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '')
      newName += 'DATE' + oldName.replace(/^replays/, '').replace(/.*DATE/, '');
    }
    stopReplay(false);
    chrome.runtime.sendMessage({
      method: 'replay.crop_and_replace',
      id: id,
      start: start,
      end: end,
      new_name: newName,
    });
  }
  cropAndReplaceButton.title = 'This also actually crops the replay, but it replaces the original replay with the cropped one.'

  // delete button
  $('#cropAndReplaceButton').after('<button id="deleteButton">Delete')
  var deleteButton = document.getElementById('deleteButton')
  deleteButton.style.position = 'absolute'
  deleteButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
  deleteButton.style.left = +cropAndReplaceButton.style.left.replace('px', '') + $('#cropAndReplaceButton').width() + 20 + 'px'
  deleteButton.style.height = '40px'
  deleteButton.style.fontSize = '20px'
  deleteButton.style.fontWeight = 'bold'
  deleteButton.style.transition = "opacity 0.25s linear"
  deleteButton.style.zIndex = 1300
  deleteButton.style.cursor = "pointer"
  deleteButton.onclick = deleteThisReplay;
  deleteButton.title = 'This deletes the current replay.'

  // rename button
  $('#deleteButton').after('<button id="renameButton">Rename')
  var renameButton = document.getElementById('renameButton')
  renameButton.style.position = 'absolute'
  renameButton.style.top = +can.style.top.replace('px', '') + can.height + 20 + 35 + 'px'
  renameButton.style.left = +deleteButton.style.left.replace('px', '') + $('#deleteButton').width() + 20 + 'px'
  renameButton.style.height = '40px'
  renameButton.style.fontSize = '20px'
  renameButton.style.fontWeight = 'bold'
  renameButton.style.transition = "opacity 0.25s linear"
  renameButton.style.zIndex = 1300
  renameButton.style.cursor = "pointer"
  renameButton.onclick = renameThisReplay
  renameButton.title = 'This renames the current replay.'

  can.style.opacity = 1;
  showButtons();
}

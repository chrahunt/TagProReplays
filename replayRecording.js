
////////////////////////////////////////////
//           Recording Section            //
////////////////////////////////////////////

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function recordReplayData() {
  var savingIndex = 0
  var fps = +readCookie('fps')
  var saveDuration = +readCookie('duration')

  // function to save current player positions
  savePlayerPositions = function() {
    players=tagpro.players
    for(player in players) {
      if(!positions[player]) {
        positions[player] = {
                            x:new Array(saveDuration*fps), 
                            y:new Array(saveDuration*fps), 
                            name:players[player].name,
                            fps:fps,
                            team:players[player].team, // 1:red, 2:blue
                            map:$('#mapInfo').text().replace('Map: ','').replace(/ by.*/,''),
                            flag:new Array(saveDuration*fps),
                            bomb:new Array(saveDuration*fps),
                            grip:new Array(saveDuration*fps),
                            tagpro:new Array(saveDuration*fps),
                            dead:new Array(saveDuration*fps),
                            me:(tagpro.viewPort.source.id == player ? 'me' : 'other'),
                            hasFlag:null
                          }
      }
      for(i in positions[player]) {
        if($.isArray(positions[player][i])) {
          positions[player][i].shift()
          positions[player][i].push(tagpro.players[player][i])
        }
      }
    }  
    savingIndex++
  }
  
  thing = setInterval(savePlayerPositions, 1000/fps)
}

function emit(event, data){
   var e = new CustomEvent(event, {detail: data});
   window.dispatchEvent(e);
}

// send position data to content script
function saveReplayData(positions) {
  var data = JSON.stringify(positions)
  console.log('sending position data from injected script to content script.')
  emit('setPositionData', data)
}

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function(e){
      listener(e.detail);
    });
}

listen('positionDataConfirmation', function () {
	console.log('got message confirming data save')
	$(savedFeedback).fadeIn(300)
  	$(savedFeedback).fadeOut(900)
})



// function to add button to record replay data
function recordButton() {
  var recordButton = document.createElement("img")
  recordButton.id = 'recordButton'
  recordButton.src = 'http://i.imgur.com/oS1bPqR.png'
  recordButton.onclick=function(){saveReplayData(positions)}
  recordButton.style.position="absolute"
  recordButton.style.margin="auto"
  recordButton.style.right="30px"
  recordButton.style.top="45px"
  recordButton.style.cursor="pointer"
  $('body').append(recordButton)
  
  var savedFeedback = document.createElement('a')
  savedFeedback.id = 'savedFeedback'
  savedFeedback.textContent = 'Saved!'
  savedFeedback.style.right='20px'
  savedFeedback.style.top='80px'
  savedFeedback.style.position="absolute"
  savedFeedback.style.color='#00CC00'
  savedFeedback.style.fontSize='20px'
  savedFeedback.style.fontWeight='bold'
  $('body').append(savedFeedback)
  $(savedFeedback).hide()
}

var positions = {}
recordButton()
recordReplayData()



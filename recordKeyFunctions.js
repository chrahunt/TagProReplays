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

function setCookie(name, value, domain) { 
  var now = new Date();
  var time = now.getTime();
  var expireTime = time + 1000*60*60*24*365;
  now.setTime(expireTime);
  document.cookie = name+'='+value+';expires='+now.toGMTString()+';path=/; domain='+domain;
  console.log('cookie: name='+name+' value='+value+' expires='+now.toGMTString())
}

saveRecordKeySettings = function() {
	setTimeout(function(){
		// Save cookie
		if(typeof currentRecordKey !== "undefined") {
			setCookie('replayRecordKey', currentRecordKey, '.koalabeast.com')
		}	
		
		// do 'saved' animation now
		$('#recordKeySaveFeedback').fadeIn()
		$('#recordKeySaveFeedback').fadeOut()
	}, 100)
}

exitRecordKeyMenu = function() {
	$(document).off("keypress", setKeyPressInput)
    $("#recordKeyContainer").fadeOut() 
    setTimeout(function(){$("#recordKeyContainer").remove()},500)
}

function openRecordKeyMenu() {
  $('article').append('<div id=recordKeyContainer>')
  $('#recordKeyContainer').css({
            "width" : "400px",
            "height" : "300px",
            "position": "absolute",
            "margin": "auto",
            "top": "0",
            "left": "0",
            "right": "0",
            "bottom": "0",
            "zIndex": "101"})
  
  // make a background
  $('#recordKeyContainer').append('<img id=recordKeyBackground>')
  $('#recordKeyBackground')[0].style['background-color']='#E6E6E6'
  $('#recordKeyBackground').css({
            "width" : "100%",
            "height" : "100%",
            "position": "absolute",
            "opacity" : "1"
  })
  
  // make a border for the background
  $('#recordKeyBackground').after('<div id=recordKeyBackgroundBorder>')
  $('#recordKeyBackgroundBorder').css({
            "position" : "absolute",
            "top" : "0",
            "left" : "0",
            "right" : "0",
            "bottom" : "0",
            "border" : "solid 10px white"
  })
  
  // add title box
  $('#recordKeyContainer').append('<div id=recordKeyTitleBox>')
  $('#recordKeyTitleBox').css({
            "width" : "80%",
            "height" : "10%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "10%",
            "left" : "10%"
  })
  $('#recordKeyTitleBox').append('<txt id=recordKeyTitleText>Select Key to Record Data')
  $('#recordKeyTitleText').css({
            "width" : "100%",
            "position" : "absolute",
            "margin" : "auto",
            "text-align" : "center",
            "fontSize" : "30px",
            "color" : "black"
  })
  
  // add area for file selection
  $('#recordKeyBackground').after('<div id=recordKeyListBox>')
  $('#recordKeyListBox').css({
            "width" : "100%",
            "height" : "50%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "30%",
            "left" : "0",
            "overflow" : "auto",
            "opacity" : "1",
            "z-index" : "101"
  })
  
  // key choose area
  $('#recordKeyListBox').append('<p><txt id=recordKeyChooserText>Press Key You Want to Use to Record Replays')
  $('#recordKeyChooserText').css({
  			"color" : "black",
  			"width" : "100%",
  			"position" : "absolute",
  			"text-align" : "center",
  			"margin-top" : "40px"
  })
  $('#recordKeyChooserText').after('<input id=recordKeyChooserInput readonly="true">')
  $('#recordKeyChooserInput').css({
  			"position" : "absolute",
  			"width" : "50px",
  			"margin-left" : "170px",
  			"margin-top" : "60px",
  			"text-align" : "center"
  })
  
  // populate recordKeyChooserInput with current key value. if undefined, make it the "z" key
  if(readCookie('replayRecordKey') !== null) {
  	$('#recordKeyChooserInput').val(String.fromCharCode(readCookie('replayRecordKey')))
  } else {
  	setCookie('replayRecordKey', 47, '.koalabeast.com')
  	$('#recordKeyChooserInput').val('/')
  }
  
  // function to set value of recordKeyChooserInput based on user keypress
  setKeyPressInput = function(e) {
  	currentRecordKey = e.which
  	$('#recordKeyChooserInput').val(String.fromCharCode(e.which))
  }
  
  // set up listener for user keypresses (will get removed when menu closes)
  $(document).on("keypress", setKeyPressInput)
  
  
  // save button
  $('#recordKeyContainer').append('<p><center><button id="recordKeySaveButton">Save')
  $('#recordKeySaveButton').css({
  			"bottom" : "15px",
  			"left" : ($("#recordKeyContainer").width()/2 - $("#recordKeySaveButton").width()/2 - 10)+"px",
  			"position" : "absolute",
  			"zIndex" : "102",
  			"text-align" : "center"
  })
  $('#recordKeySaveButton')[0].onclick = saveRecordKeySettings
  
  $('#recordKeyContainer').append('<a id=recordKeySaveFeedback>Saved!')
  $('#recordKeySaveFeedback').css({
  			"bottom" : "15px",
  			"left" : ($("#recordKeyContainer").width()/2 + $("#recordKeySaveButton").width()/2 + 10 + 5)+"px",
  			"position" : "absolute"
  })
  			 
  $('#recordKeySaveFeedback').hide()
    
  // exit button
  $('#recordKeyContainer').append('<a id=recordKeyExitButton href=#>X')
  $('#recordKeyExitButton').css({
    'position':'absolute',
    'background-color':'grey',
    'color' : 'black',
    'top' : '10px',
    'right' : '10px',
    'fontWidth' : 'bold',
    'fontSize' : '20px'
  })
  $('#recordKeyExitButton')[0].onclick = exitRecordKeyMenu
}
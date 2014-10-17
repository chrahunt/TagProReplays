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
  console.log('cookie: name='+name+' value='+value+' expires='+now.toGMTString()+' domain='+domain);
}

var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//)[1];

saveRecordKeySettings = function() {
	setTimeout(function(){
		// Save cookie
		if(typeof currentRecordKey !== "undefined") {
			setCookie('replayRecordKey', currentRecordKey, cookieDomain)
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
  $('#recordKeyContainer').load(chrome.extension.getURL("ui/_recordkey.html"), function() {
    // populate recordKeyChooserInput with current key value. if undefined, make it the "z" key
    if(readCookie('replayRecordKey') !== null) {
    	$('#recordKeyChooserInput').val(String.fromCharCode(readCookie('replayRecordKey')))
    } else {
    	setCookie('replayRecordKey', 47, cookieDomain)
    	$('#recordKeyChooserInput').val('/')
    }

    // function to set value of recordKeyChooserInput based on user keypress
    setKeyPressInput = function(e) {
    	currentRecordKey = e.which
    	$('#recordKeyChooserInput').val(String.fromCharCode(e.which))
    }
    
    // set up listener for user keypresses (will get removed when menu closes)
    $(document).on("keypress", setKeyPressInput)

    $('#recordKeySaveButton').css(
      'left',
      ($("#recordKeyContainer").width()/2 - $("#recordKeySaveButton").width()/2 - 10)+"px"
    );

    $('#recordKeySaveButton')[0].onclick = saveRecordKeySettings

    $('#recordKeySaveFeedback').css(
      'left',
      ($("#recordKeyContainer").width()/2 + $("#recordKeySaveButton").width()/2 + 10 + 5)+"px"
    );

    $('#recordKeySaveFeedback').hide()
    $('#recordKeyExitButton')[0].onclick = exitRecordKeyMenu
  });
}

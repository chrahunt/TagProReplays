
////////////////////////////////////////////
//           Animation Section            //
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

function setCookie(name, value, domain) { 
  var now = new Date();
  var time = now.getTime();
  var expireTime = time + 1000*60*60*24*365;
  now.setTime(expireTime);
  document.cookie = name+'='+value+';expires='+now.toGMTString()+';path=/; domain='+domain;
  console.log('cookie: name='+name+' value='+value+' expires='+now.toGMTString())
}

// Get URL for setting cookies, assumes a domain of *.hostname.tld:*/etc
var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//);

function createReplayPageButton() {
  function findInsertionPoint() {
    buttons = $('article>div.buttons.smaller>a')
    for (var i = 0; i < buttons.length; i ++) {
        textcontent = buttons[i].textContent
        if(textcontent.search('Leaders')>=0) {
          return(buttons[i])
        }
    }
  }
  $(findInsertionPoint()).after('<a class=button id=ReplayMenuButton>Replays')
  $('#ReplayMenuButton').append('<span>watch yourself')
  $('#ReplayMenuButton')[0].onclick=openReplayMenu
}

function openReplayMenu() {
  // create a container for the playback menu
  $('article').append('<div id=menuContainer>')
  $('#menuContainer').css({
            "width" : "75%",
            "height" : "75%",
            "position": "absolute",
            "margin": "auto",
            "top": "0",
            "left": "0",
            "right": "0",
            "bottom": "0",
            "zIndex": "100"})
  $('#menuContainer').hide()
  
  // make a background
  $('#menuContainer').append('<img id=background>')
  $('#background')[0].style['background-color']='#E6E6E6'
  $('#background').css({
            "width" : "100%",
            "height" : "100%",
            "position": "absolute",
            "opacity" : ".8"
  })
  
  // make a border for the background
  $('#background').after('<div id=backgroundBorder>')
  $('#backgroundBorder').css({
            "position" : "absolute",
            "top" : "0",
            "left" : "0",
            "right" : "0",
            "bottom" : "0",
            "border" : "solid 10px white"
  })
  
  // add area for available replays 
  $('#background').after('<div id=replayListBox>')
  $('#replayListBox').css({
            "background-color" : "grey",
            "width" : "80%",
            "height" : "50%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "40%",
            "left" : "10%",
            "overflow" : "auto",
            "opacity" : ".8",
            "z-index" : "100"
  })
  
  // add title box
  $('#menuContainer').append('<div id=titleBox>')
  $('#titleBox').css({
            "width" : "80%",
            "height" : "10%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "10%",
            "left" : "10%"
  })
  $('#titleBox').append('<txt id=titleText>TagPro Replays Menu')
  $('#titleText').css({
            "width" : "100%",
            "position" : "absolute",
            "margin" : "auto",
            "text-align" : "center",
            "fontSize" : "60px",
            "color" : "black"
  })
  
  //////////////////
  // add settings //
  //////////////////
  
  // settings container
  $('#menuContainer').append('<div id=settingsContainer>')
  $('#settingsContainer').css({
            "width" : "80%",
            "height" : "10%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "25%",
            "left" : "10%"            
  })
  
  // fps input
  fpsInfo = 'Use this to set how many times per second data are recorded from the tagpro game.\nHigher fps will create smoother replays. \n\nIf you experience framerate drops during gameplay, or if your replays are sped up, try reducing this value.'
  $('#settingsContainer').append('<txt id=fpsTxt>')
  $('#fpsTxt').text('FPS:')
  $('#fpsTxt')[0].title = fpsInfo
  $('#fpsTxt').css({
            "fontSize" : "18px",
            "color" : "black",
            "margin-right" : "5px"
  })
  $('#fpsTxt').after('<input id=fpsInput>')
  $('#fpsInput').css({
            "margin-right" : "10px",
            "width" : "20px"
  })
  $('#fpsInput')[0].title = fpsInfo
  
  // duration input
  durationInfo = 'Use this to set how long the replay will be in seconds. Values greater than 60 seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect replays that have already been recorded'
  $('#fpsInput').after('<txt id=durationTxt>')
  $('#durationTxt').text('Duration:')
  $('#durationTxt')[0].title = durationInfo
  $('#durationTxt').css({
            "fontSize" : "18px",
            "color" : "black",
            "margin-right" : "5px"
  })
  $('#durationTxt').after('<input id=durationInput>')
  $('#durationInput').css({
  			"width" : "20px",
  			"margin-right" : "20px"
  })
  $('#durationInput')[0].title = durationInfo
  
  // recording checkbox
  recordInfo = 'This controls whether the extension is capable of recording replays during a tagpro game.\n\nUncheck to disable the extension.'
  $('#durationInput').after('<txt id=recordTxt>')  
  $('#recordTxt').text('On/Off')
  $('#recordTxt')[0].title = recordInfo
  $('#recordTxt').css({
  			"fontSize" : "18px",
  			"color" : "black",
  			"margin-right" : "5px"
  })
  $('#recordTxt').after('<input id=recordCheckbox type="checkbox">')
  $('#recordCheckbox')[0].title = recordInfo
  
  // custom texture checkbox
  textureInfo = 'This controls whether custom texture files will be used in rendered movies.\n\nCheck to use textures, uncheck to use vanilla.\n\nThis only applies to rendered movies.' 
  $('#recordCheckbox').after('<txt id=useTextureTxt>')
  $('#useTextureTxt').text('Use Textures')
  $('#useTextureTxt')[0].title = textureInfo
  $('#useTextureTxt').css({
  			"fontSize" : "18px",
  			"color" : "black",
  			"margin-left" : "20px",
  			"margin-right" : "5px"
  })
  $('#useTextureTxt').after('<input id=useTextureCheckbox type="checkbox">')
  $('#useTextureCheckbox')[0].title = textureInfo
  
  // custom texture menu button
  textureInfo2 = 'This button allows you to upload your custom texture files'
  $('#useTextureCheckbox').after('<button id=textureMenuButton>Load Textures')
  $('#textureMenuButton').css({
  			"margin-left" : "20px"
  })
  $('#textureMenuButton')[0].onclick = openTextureMenu
  $('#textureMenuButton')[0].title = textureInfo2
  
  // record key checkbox
  recordKeyInfo = 'This allows you to designate a key that acts exactly like clicking the record button with the mouse.\n\nDon\'t use keys that have other uses in the game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all, because the extension will listen for that key even if you are typing in chat.'
  $('#textureMenuButton').after('<txt id=recordKeyTxt>')
  $('#recordKeyTxt').text('Record Key')
  $('#recordKeyTxt')[0].title = recordKeyInfo
  $('#recordKeyTxt').css({
  			"fontSize" : "18px",
  			"color" : "black",
  			"margin-left" : "20px",
  			"margin-right" : "5px"
  })
  $('#recordKeyTxt').after('<input id=recordKeyCheckbox type="checkbox">')
  $('#recordKeyCheckbox')[0].onclick = function() {
  	if(this.checked) {
  		openRecordKeyMenu()
  	}
  }
  $('#recordKeyCheckbox')[0].title = recordKeyInfo
  
  // useSplats checkbox
  useSplatsInfo = 'This toggles whether to show splats or not.\n\nCheck the box if you want to show splats in the replay'
  $('#recordKeyCheckbox').after('<txt id=useSplatsTxt>')
  $('#useSplatsTxt').text('Splats')
  $('#useSplatsTxt')[0].title = useSplatsInfo
  $('#useSplatsTxt').css({
  			"fontSize" : "18px",
  			"color" : "black",
  			"margin-left" : "20px",
  			"margin-right" : "5px"
  })
  $('#useSplatsTxt').after('<input id=useSplatsCheckbox type="checkbox">')
  $('#useSplatsCheckbox')[0].title = useSplatsInfo

  			  
  			  
  // Replay menu title
  $('#menuContainer').append('<div id=replayListContainer>Available Replays')
  $('#replayListContainer').css({
            "width" : "80%",
            "height" : "10%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "35%",
            "left" : "10%",
            "fontSize" : "20px",
            "color" : "black",
            "text-align" : "center"
  })
  
  exitMenu = function() {
    fpsInputValue = $('#fpsInput')[0].value
    durationInputValue = $('#durationInput')[0].value
    recordInputValue = $('#recordCheckbox')[0].checked
    useTexturesInputValue = $('#useTextureCheckbox')[0].checked
    useRecordKeyValue = $('#recordKeyCheckbox')[0].checked
    useSplatsValue = $('#useSplatsCheckbox')[0].checked
    if(!isNaN(fpsInputValue) & fpsInputValue!="") {
      setCookie('fps', $('#fpsInput')[0].value, cookieDomain)
    }
    if(!isNaN(durationInputValue) & durationInputValue!="") {
      setCookie('duration', $('#durationInput')[0].value, cookieDomain)
    }
    setCookie('record', recordInputValue, cookieDomain)
    setCookie('useTextures', useTexturesInputValue, cookieDomain)
    setCookie('useRecordKey', useRecordKeyValue, cookieDomain)
    setCookie('useSplats', useSplatsValue, cookieDomain)
    $("#menuContainer").fadeOut()
    
    chrome.runtime.sendMessage({method:'cleanRenderedReplays'}) 
    setTimeout(function(){$("#menuContainer").remove()},500)
  }
  
  $('#menuContainer').append('<a id=exitButton href=#>X')
  $('#exitButton').css({
    'position':'absolute',
    'background-color':'grey',
    'color' : 'black',
    'top' : '5%',
    'right' : '5%',
    'fontWidth' : 'bold',
    'fontSize' : '20px'
  })
  $('#exitButton')[0].onclick = exitMenu
  
  
  // function for requesting indexdb datastore contents from background script
  function getListData() {
  	chrome.runtime.sendMessage({method:'requestList'})
  }
  
  // function for determining if a position file name is in an array of rendered movie names
  function positionFileIsRendered(positionFileName, movieNames) {
  	for(m in movieNames) {
  		if(positionFileName.replace('replays','').replace(/.*DATE/,'') == movieNames[m]) {
  			return(true)
  		}
  	}
  	return(false)
  }
  
  // function that initially sends list of replays to background script for mass rendering
  // the function that deals with subsequent renderings ("renderSelectedSubsequent") is defined below in the global scope
  function renderSelectedInitial() {
  	replaysToRender = []
  	$('#replayListBox input').each(function(){if(this.checked){replaysToRender.push(this.id.replace('SelectedCheckbox',''))}})
  	if(replaysToRender.length > 0) {
  		if(confirm('Are you sure you want to render these replays? The extension will be unavailable until the movies are rendered.')) {
		  	chrome.runtime.sendMessage({method:'renderAllInitial', 
		  	                            data:replaysToRender,
	  		                            useTextures:$('#useTextureCheckbox')[0].checked,
	        		                    useSplats:$('#useSplatsCheckbox')[0].checked
	        		                    })
  			console.log('sent request to render multiple replays: '+replaysToRender)
  		}
  	}
  }
  
  // function to delete multiple files at once
  function deleteSelected() {
  	replaysToDelete = []
  	$('#replayListBox input').each(function(){if(this.checked){replaysToDelete.push(this.id.replace('SelectedCheckbox',''))}})
  	if(replaysToDelete.length > 0) {
  		if(confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
  			console.log('requesting to delete '+replaysToDelete)
    	    chrome.runtime.sendMessage({method:'requestDataDelete',fileName:replaysToDelete})
  		}
  	}
  }
  
  // This puts the current replays into the menu 	
  populateList = function(storageData, movieNames) {
    replayList = []
    for(dat in storageData) {
        replayList.push(storageData[dat])
    }
    if(!replayList.length > 0) {
      $('#replayListBox').append("<p><a>You don't have any replays saved. Go record some!")
    } else {
    
      // this is where the replay sorting functions will go, when i write them
      replayList = replayList.reverse()
      //
      
      // these buttons allow rendering/deleting multiple replays
      $('#replayListBox').append("<p><center><button id=renderSelectedButton>Render Selected")
      $('#renderSelectedButton')[0].onclick=renderSelectedInitial
      $('#renderSelectedButton').after("<button id=deleteSelectedButton style='margin-left:10px'>Delete Selected")
      $('#deleteSelectedButton')[0].onclick=deleteSelected
      
      console.log(replayList)
      for(dat in replayList) {
        thisReplay = replayList[dat]
        $('#replayListBox').append("<p><input type=checkbox id="+thisReplay+"SelectedCheckbox style='margin-left:20px'>")
        $('#'+thisReplay+'SelectedCheckbox').after("<a id="+thisReplay+" href=# style='margin-left:5px margin-right:10px'>"+thisReplay.replace(/DATE.*/,'')+"</a>") 
        $('#'+thisReplay)[0].onclick = function(){
          exitMenu()
	 	  console.log('sending data request for '+this.id)
		  sessionStorage.setItem('currentReplay', this.id)
		  chrome.runtime.sendMessage({method:'requestData',fileName:this.id})
        }
        ms = +thisReplay.replace('replays','').replace(/.*DATE/,'')
    	date = new Date(ms)
        datevalue = date.toDateString() +' '+ date.toLocaleTimeString().replace(/:.?.? /g, ' ')
        $('#'+thisReplay)[0].title = datevalue
        
        
        if(positionFileIsRendered(thisReplay, movieNames)) {
        	$('#'+thisReplay).after("<txt id="+thisReplay+"Rendered style='margin-right:10px'>✓")
        	$('#'+thisReplay+"Rendered")[0].style.color="white" //"#00FF00"
        } else {
        	$('#'+thisReplay).after("<txt id="+thisReplay+"Rendered style='margin-right:16px'> ")
        }
        
      
        //$('#'+thisReplay+"Rendered").after('<button id='+thisReplay+'RenderMovieButton style="margin-left:10px">Render Movie')
        //$('#'+thisReplay+'RenderMovieButton')[0].onclick = function() {
        //	fileNameToRender = this.id.replace('RenderMovieButton','')
        //	console.log('asking background script to render '+fileNameToRender)
        //	if(confirm('Are you sure you want to render '+fileNameToRender.replace(/DATE.*/,'')+'? The extension will be unavailable until the movie is rendered.')) {
	    //    	chrome.runtime.sendMessage({method:'renderMovie', 
	    //    	                            name:fileNameToRender,
	    //    	                            useTextures:$('#useTextureCheckbox')[0].checked,
	    //    	                            useSplats:$('#useSplatsCheckbox')[0].checked
	    //    	                            })
	    //    }
	    //}
	    $('#'+thisReplay+'Rendered').after('<button id='+thisReplay+'DownloadMovieButton style="margin-left:5px">Download Movie')
	    $('#'+thisReplay+'DownloadMovieButton')[0].onclick = function() {
        	fileNameToDownload = this.id.replace('DownloadMovieButton','')
        	console.log('asking background script to download video for '+fileNameToDownload)
        	chrome.runtime.sendMessage({method:'downloadMovie', name:fileNameToDownload})
	    }
	    if(!positionFileIsRendered(thisReplay, movieNames)) {
	    	$('#'+thisReplay+'DownloadMovieButton')[0].disabled = true
	    }
	    
        $('#'+thisReplay+'DownloadMovieButton').after('<button id='+thisReplay+'DownloadButton style="margin-left:5px">Download Raw Data')
        $('#'+thisReplay+'DownloadButton')[0].onclick = function(){
        	fileNameToDownload = this.id.replace('DownloadButton','')
        	console.log('requesting '+fileNameToDownload)
        	chrome.runtime.sendMessage({method:'requestDataForDownload',fileName:fileNameToDownload})
        }
        $('#'+thisReplay+'DownloadButton').after('<button id='+thisReplay+'RenameButton style="margin-left:5px">Rename')
        $('#'+thisReplay+'RenameButton')[0].onclick = function() {
        	fileNameToRename = this.id.replace('RenameButton','')
        	datePortion = this.id.replace(/.*DATE/,'').replace('replays','').replace('RenameButton','')
        	newName = prompt('How would you like to rename '+this.id.replace(/DATE.*/,'').replace('RenameButton',''))
        	if(newName != null) {
        		newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi,'')+"DATE"+datePortion
	        	console.log('requesting to rename from '+fileNameToRename+' to '+newName)
    	    	chrome.runtime.sendMessage({method:'requestFileRename',oldName:fileNameToRename, newName:newName})
    	    }
    	}	
        //$('#'+thisReplay+'RenameButton').after('<button id='+thisReplay+'DeleteButton style="margin-left:5px">Delete')
        //$('#'+thisReplay+'DeleteButton')[0].onclick = function(){
        //	fileNameToDelete = this.id.replace('DeleteButton','')
        //	if(confirm('Are you sure you want to delete '+fileNameToDelete+'?')){
	    //    	console.log('requesting '+fileNameToDelete)
    	//    	chrome.runtime.sendMessage({method:'requestDataDelete',fileName:fileNameToDelete})
    	//    }
    	//}
    	
    	$('#'+thisReplay+'RenameButton').after('<txt id='+thisReplay+'Date style="margin-left:5px">'+datevalue)
      }
      GOODMARGIN = 0
      for(dat in replayList) {
          thisReplay = replayList[dat]
          if($('#'+thisReplay).width() > GOODMARGIN) {
          	GOODMARGIN = $('#'+thisReplay).width()
          }
      }
      for(dat in replayList) {
          thisReplay = replayList[dat]
	      $('#'+thisReplay).css({'margin-right':(GOODMARGIN - $('#'+thisReplay).width() + 20)+'px',
	      						  'margin-left': '20px'})
	  }
    }
  }
  ///////////////////////////////////////////////////////////
  // Set fps and duration text box values - and checkboxes //
  ///////////////////////////////////////////////////////////

  fpsValue = (!readCookie('fps')) ? "30" : readCookie('fps')
  durationValue = (!readCookie('duration')) ? "30" : readCookie('duration')
  recordValue = (!readCookie('record')) ? 'true' : readCookie('record')
  useTexturesValue = (!readCookie('useTextures')) ? 'false' : readCookie('useTextures')
  useRecordKeyValue = (!readCookie('useRecordKey')) ? 'false' : readCookie('useRecordKey')
  useSplatsValue = (!readCookie('useSplats')) ? 'false' : readCookie('useSplats')
  
  $('#fpsInput')[0].value=(!isNaN(fpsValue) & fpsValue!="") ? fpsValue : 30
  $('#durationInput')[0].value=(!isNaN(durationValue) & durationValue!="") ? durationValue : 30
  $('#recordCheckbox')[0].checked = eval(recordValue)
  $('#useTextureCheckbox')[0].checked = eval(useTexturesValue)
  $('#recordKeyCheckbox')[0].checked = eval(useRecordKeyValue)
  $('#useSplatsCheckbox')[0].checked = eval(useSplatsValue)
  
  getListData()
  $('#menuContainer').fadeIn()
}

// This is in case we want the user to download something 
function saveData(name, data) {
	var file = new Blob([data], {type: "data:text/txt;charset=utf-8"});
	var a = document.createElement('a');
    a.download = name+'.txt';
    a.href = (window.URL || window.webkitURL).createObjectURL(file);
	var event = document.createEvent('MouseEvents');
	event.initEvent('click', true, false);
   // trigger download
	a.dispatchEvent(event);    
    (window.URL || window.webkitURL).revokeObjectURL(a.href);
}

// This is an easy method wrapper to dispatch events
function emit(event, data){
   var e = new CustomEvent(event, {detail: data});
   window.dispatchEvent(e);
}

// function to grey out menu buttons and disable all other menu actions
function greyButtons() {
	$('#menuContainer button').each(function(){this.disabled=true})
	$('#menuContainer input').each(function(){this.disabled=true})
	$('#replayListBox a').css({
    	cursor: 'default',
    	pointerEvents: 'none',
    	color: 'white'
	});
}

// this function is run upon receipt of confirmation from the background script that one of the selected replays has been rendered
function  renderSelectedSubsequent(replaysToRender, replayI, lastOne, tabNum) {
	chrome.runtime.sendMessage({method:'renderAllSubsequent', 
		  	                  	data:replaysToRender,
		  	                  	replayI:replayI,
		  	                  	lastOne:lastOne,
	  		                  	useTextures:$('#useTextureCheckbox')[0].checked,
	        		        	useSplats:$('#useSplatsCheckbox')[0].checked,
	        		        	tabNum:tabNum
	        		            })
  	console.log('sent request to render replay: '+replaysToRender[replayI])
}

// set global scope for some variables and functions
// then set up listeners for info from background script
var positions
var savePlayerPositions
var populateList
var initiateAnimation
var videofile
chrome.runtime.onMessage.addListener(function(message,sender,sendResponse){
	if(message.method == 'itemsList') {
  		console.log('got itemList message')
  		populateList(message.positionKeys, message.movieNames)
  	} else if(message.method == 'positionData') {
  		console.log('got positionData message')
  		localStorage.setItem('currentReplayName', message.movieName)
  		console.log(typeof message.title)
  		positions = JSON.parse(message.title)
  		console.log(positions)
  		createReplay(positions)
  		animateReplay(thisI, positions, mapImg)
  	} else if(message.method == "dataSetConfirmationFromBG") {
  		console.log('got data set confirmation from background script. sending confirmation to injected script.')
  		emit('positionDataConfirmation',true)
  	} else if(message.method == "positionDataForDownload") {
  		console.log('got data for download - '+message.fileName)
  		saveData(message.fileName, message.title)
  	} else if(message.method == 'dataDeleted') {
  		console.log('data were deleted')
  		$('#menuContainer').remove()
  		openReplayMenu()
  	} else if(message.method == "fileRenameSuccess") {
  		console.log('got confirmation of data file rename from background script')
  		$('#menuContainer').remove()
  		openReplayMenu()
  	} else if(message.method == "picture") {
  		console.log('got picture file from background script')
  		picture = message.file
  	} else if(message.method == "movieRenderConfirmation") {
  		console.log('got movie render confirmation')
  		exitMenu()
    } else if(message.method == "movieRenderFailure") {
    	alert('pls. That replay is too old to replay. Don\'t delete it yet though, because I\'ll eventually add in replay functions for old replays.')
    } else if(message.method == "movieDownloadConfirmation") {
    	console.log('got movie download confirmation')
    } else if(message.method == "movieDownloadFailure") {
    	alert('Download failed. Most likely you haven\'t rendered that movie yet.')
    } else if(message.method == "progressBarCreate") {
    	// CREATE PROGRESS BAR AND GREY OUT BUTTONS
    	$('#'+message.name+'Rendered').after('<progress id='+message.name+'ProgressBar style="margin-left:5px">')
    	$('#'+message.name+'ProgressBar').width(100)
    	$('#'+message.name+'ProgressBar').css({'margin-right' : '5px'})
    	$('#'+message.name+'DownloadMovieButton').remove()
    	greyButtons()
    	console.log('got request to create progress Bar for '+message.name)
    } else if(message.method == "progressBarUpdate") {
    	// UPDATE PROGRESS BAR
    	if(typeof $('#'+message.name+'ProgressBar')[0] !== 'undefined') {
	    	$('#'+message.name+'ProgressBar')[0].value=message.progress
	    }
    } else if(message.method == "movieRenderConfirmationNotLastOne") {
		newReplayI = +message.replayI+1
		lastOne = false
		tabNum = message.tabNum
		if(newReplayI == message.replaysToRender.length-1) {
			lastOne = true
		}
		renderSelectedSubsequent(message.replaysToRender, newReplayI, lastOne, tabNum)
	}
});

// set fps and duration if they're not already
if(!readCookie('fps')) { setCookie('fps', 30, cookieDomain) }
if(!readCookie('duration')) { setCookie('duration', 30, cookieDomain) }
if(!readCookie('useSplats')) { setCookie('useSplats', true, cookieDomain) } 

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function(e){
      listener(e.detail);
    });
}

// set up listener for info from injected script
// if we receive data, send it along to the background script for storage
listen('setPositionData', function (data) {
	console.log('got position data from injected script. sending to background script')
	chrome.runtime.sendMessage({method:'setPositionData',positionData:data})
})

// if we're on the main tagpro server screen, run the createReplayPageButton function
if(document.URL.search(/[a-z]+\/#?$/) >= 0) {
	// make the body scrollable
	$('body')[0].style.overflowY = "scroll"
	// make the button
	createReplayPageButton()
}	


// if we're in a game, as evidenced by there being a port number, inject the replayRecording.js script
if(document.URL.search(/\.\w+:/) >= 0) {
	function injectScript(path) {
    	var script = document.createElement('script');
    	script.setAttribute("type", "application/javascript");
    	script.src = chrome.extension.getURL(path);
    	script.onload = removeScript;
    	(document.head||document.documentElement).appendChild(script);
  	}
  	function removeScript() {
    	this.parentNode.removeChild(this);
  	}
  	var scripts = ["replayRecording.js"];
  	scripts.forEach(injectScript);
}




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

// Inserts Replay button in main page
function createReplayPageButton() {
  function findInsertionPoint() {
    buttons = $('article>div.buttons.smaller>a')
    for (var i = 0; i < buttons.length; i ++) {
      textcontent = buttons[i].textContent
      if(textcontent.search('Leaders') >= 0) {
        return(buttons[i]);
      }
    }
  }
  $(findInsertionPoint()).after('<a class=button id=ReplayMenuButton>Replays')
  $('#ReplayMenuButton').append('<span>watch yourself')
  $('#ReplayMenuButton')[0].onclick=openReplayMenu
}

function openReplayMenu() {
  // function for requesting indexdb datastore contents from background script.
  // Response from background script initiates population of replays into menu.
  function getListData() {
    chrome.runtime.sendMessage({
      method: 'requestList'
    });
  }

  function setFormTitles() {
    fpsTitle = 'Use this to set how many times per second data are recorded from the tagpro game.\n' +
      'Higher fps will create smoother replays.\n\nIf you experience framerate drops during gameplay,' +
      'or if your replays are sped up, try reducing this value.';
    $('#fpsTxt').prop('title', fpsTitle);
    $('#fpsInput').prop('title', fpsTitle);

    durationTitle = 'Use this to set how long the replay will be in seconds. Values greater than 60 ' +
      'seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect' +
      'replays that have already been recorded';
    $('#durationText').prop('title', durationTitle);
    $('#durationInput').prop('title', durationTitle);

    recordTitle = 'This controls whether the extension is capable of recording replays during a tagpro game.\n\n' +
      'Uncheck to disable the extension.';
    $('#recordTxt').prop('title', recordTitle);
    $('#recordCheckbox').prop('title', recordTitle);

    useTextureTitle = 'This controls whether custom texture files will be used in rendered movies.\n\n' +
      'Check to use textures, uncheck to use vanilla.\n\nThis only applies to rendered movies.';
    $('#useTextureTxt').prop('title', useTextureTitle);
    $('#useTextureCheckbox').prop('title', useTextureTitle);

    textureMenuButtonTitle = 'This button allows you to upload your custom texture files';
    $('#textureMenuButton').prop('title', textureMenuButtonTitle);

    recordKeyTitle = 'This allows you to designate a key that acts exactly like clicking ' +
      'the record button with the mouse.\n\nDon\'t use keys that have other uses in the ' +
      'game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all, ' +
      'because the extension will listen for that key even if you are typing in chat.';
    $('#recordKeyTxt').prop('title', recordKeyTitle);
    $('#recordKeyCheckbox').prop('title', recordKeyTitle);

    useSplatsTitle = 'This toggles whether to show splats or not.\n\nCheck the box if you ' +
      'want to show splats in the replay';
    $('#useSplatsTxt').prop('title', useSplatsTitle);
    $('#useSplatsCheckbox').prop('title', useSplatsTitle);
  }

  if($('#menuContainer').length) {
    // Menu already exists, update replay list and show.
    // Remove previously-created replay rows.
    $('.replayRow').not('.clone').remove();
    getListData();
    $('#menuContainer').fadeIn();
  } else {
    // Create Container for Replay Menu.
    $('article').append('<div id=menuContainer>');
    $('#menuContainer').hide();

    // Retrieve html from ui/_menu.html and place into menu container,
    // executing relevant javascript afterwards.
    $('#menuContainer').load(chrome.extension.getURL("ui/_menu.html"), function() {
      setFormTitles();
      $('#textureMenuButton')[0].onclick = openTextureMenu;
      $('#recordKeyCheckbox')[0].onclick = function() {
        if(this.checked) {
          openRecordKeyMenu();
        }
      }

      // Save form fields and close menu.
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
        
        chrome.runtime.sendMessage({
          method:'cleanRenderedReplays'
        }); 
        /*setTimeout(function() {
          $("#menuContainer").fadeOut()
        },500);*/
      }

      $('#exitButton')[0].onclick = exitMenu;

      // function for determining if a position file name is in an array of rendered movie names
      function positionFileIsRendered(positionFileName, movieNames) {
        for(m in movieNames) {
          if(positionFileName.replace('replays','').replace(/.*DATE/,'') == movieNames[m]) {
            return(true);
          }
        }
        return(false);
      }
    
      // function that initially sends list of replays to background script for mass rendering
      // the function that deals with subsequent renderings ("renderSelectedSubsequent") is defined below in the global scope
      function renderSelectedInitial() {
        replaysToRender = []
        $('.selected-checkbox').each(function() {
          if(this.checked) {
            var row = $(this).closest('div');
            var replayId = row.data("replay");
            replaysToRender.push(replayId);
          }
        });
        if(replaysToRender.length > 0) {
          if(confirm('Are you sure you want to render these replays? The extension will be unavailable until the movies are rendered.')) {
            chrome.runtime.sendMessage({
              method: 'renderAllInitial',
              data: replaysToRender,
              useTextures: $('#useTextureCheckbox')[0].checked,
              useSplats: $('#useSplatsCheckbox')[0].checked
            });
            console.log('sent request to render multiple replays: '+replaysToRender);
          }
        }
      }
    
      // function to delete multiple files at once
      function deleteSelected() {
        replaysToDelete = []
        $('.selected-checkbox').each(function() {
          if(this.checked) {
            var row = $(this).closest('div');
            var replayId = row.data("replay");
            replaysToDelete.push(replayId);
          }
        });

        if(replaysToDelete.length > 0) {
          if(confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
            console.log('requesting to delete ' + replaysToDelete);
            chrome.runtime.sendMessage({
              method: 'requestDataDelete',
              fileName: replaysToDelete
            });
          }
        }
      }
    
      // This puts the current replays into the menu   
      populateList = function(storageData, movieNames) {
        replayList = [];
        for(dat in storageData) {
          replayList.push(storageData[dat]);
        }
        
        if(!replayList.length > 0) {
          // Show "No replays" message.
          $('#noReplays').show();
          $('#multiButtons').hide();
          $('#replayList').hide();
        } else {
          // this is where the replay sorting functions will go, when i write them
          replayList = replayList.reverse();

          // Display buttons for rendering and deleting multiple items.
          $('#multiButtons').show();

          // Display list of replays.
          $('#replayList').show();

          $('#noReplays').hide();
          
          // these buttons allow rendering/deleting multiple replays
          $('#renderSelectedButton')[0].onclick = renderSelectedInitial;
          $('#deleteSelectedButton')[0].onclick = deleteSelected;

          // Template row that other rows will clone and populate with their own information.
          var cloneRow = $('#replayList div.replayRow.clone:first').clone(true);
          cloneRow.removeClass('clone');
          console.log(replayList);
          // Populate rows
          for(dat in replayList) {
            thisReplay = replayList[dat]
            var newRow = cloneRow.clone(true);
            newRow.data("replay", thisReplay);
            newRow.attr("id", thisReplay);
            // Set playback link text
            newRow.children('a.playback-link').text(thisReplay.replace(/DATE.*/,''));

            ms = +thisReplay.replace('replays','').replace(/.*DATE/,'');
            date = new Date(ms);
            datevalue = date.toDateString() +' '+ date.toLocaleTimeString().replace(/:.?.? /g, ' ');
            newRow.children('a.playback-link').title = datevalue;
            
            if(positionFileIsRendered(thisReplay, movieNames)) {
              newRow.children('.rendered-check').text('✓');
              newRow.children('.rendered-check').css('margin-right', '10px');
            }

            if(!positionFileIsRendered(thisReplay, movieNames)) {
              newRow.children('.download-movie-button')[0].disabled = true
            }

            newRow.children('.replay-date').text(datevalue);
            $('#replayList').append(newRow);
          }

          // Replay row element click handlers
          $('#replayList .playback-link').click(function() {
            var replayRow = $(this).closest('div');
            var replayId = replayRow.data("replay");
            exitMenu()
            console.log('sending data request for ' + replayId);
            sessionStorage.setItem('currentReplay', replayId);
            chrome.runtime.sendMessage({
              method: 'requestData',
              fileName: replayId
            });
          });

          $('#replayList .download-movie-button').click(function() {
            var replayRow = $(this).closest('div');
            var replayId = replayRow.data("replay");
            fileNameToDownload = replayId;
            console.log('asking background script to download video for '+ fileNameToDownload)
            chrome.runtime.sendMessage({
              method: 'downloadMovie',
              name: fileNameToDownload
            });
          });

          $('.download-button').click(function() {
            var replayRow = $(this).closest('div');
            var replayId = replayRow.data("replay");
            fileNameToDownload = replayId;
            console.log('requesting ' + fileNameToDownload);
            chrome.runtime.sendMessage({
              method: 'requestDataForDownload',
              fileName: fileNameToDownload
            });
          });

          $('.rename-button').click(function() {
            var replayRow = $(this).closest('div');
            var replayId = replayRow.data("replay");
            fileNameToRename = replayId;
            datePortion = fileNameToRename.replace(/.*DATE/,'').replace('replays','');
            newName = prompt('How would you like to rename ' + fileNameToRename.replace(/DATE.*/,''));
            if(newName != null) {
              newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi,'')+"DATE"+datePortion;
              console.log('requesting to rename from ' + fileNameToRename + ' to ' + newName);
              chrome.runtime.sendMessage({
                method: 'requestFileRename',
                oldName: fileNameToRename,
                newName: newName
              });
            }
          });

          GOODMARGIN = 0
          $('.playback-link').each(function() {
            if($(this).width() > GOODMARGIN) {
              GOODMARGIN = $(this).width();
            }
          });

          $('.playback-link').each(function() {
            $(this).css('margin-right', (GOODMARGIN - $(this).width() + 20) + 'px');
          });
        }
      }

      ///////////////////////////////////////////////////////////
      // Set fps and duration text box values - and checkboxes //
      ///////////////////////////////////////////////////////////

      fpsValue = (!readCookie('fps')) ? "30" : readCookie('fps');
      durationValue = (!readCookie('duration')) ? "30" : readCookie('duration');
      recordValue = (!readCookie('record')) ? 'true' : readCookie('record');
      useTexturesValue = (!readCookie('useTextures')) ? 'false' : readCookie('useTextures');
      useRecordKeyValue = (!readCookie('useRecordKey')) ? 'false' : readCookie('useRecordKey');
      useSplatsValue = (!readCookie('useSplats')) ? 'false' : readCookie('useSplats');
      
      $('#fpsInput')[0].value=(!isNaN(fpsValue) & fpsValue!="") ? fpsValue : 30;
      $('#durationInput')[0].value=(!isNaN(durationValue) & durationValue!="") ? durationValue : 30;
      $('#recordCheckbox')[0].checked = eval(recordValue);
      $('#useTextureCheckbox')[0].checked = eval(useTexturesValue);
      $('#recordKeyCheckbox')[0].checked = eval(useRecordKeyValue);
      $('#useSplatsCheckbox')[0].checked = eval(useSplatsValue);
      
      getListData();
      $('#menuContainer').fadeIn();
    });
  }
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
  $('#replayListBox a').addClass('disabled');
}

function unGreyButtons() {
  $('#menuContainer button').each(function(){this.disabled=false})
  $('#menuContainer input').each(function(){this.disabled=false})
  $('#replayListBox a').removeClass('disabled');
}

// this function is run upon receipt of confirmation from the background script that one of the selected replays has been rendered
function renderSelectedSubsequent(replaysToRender, replayI, lastOne, tabNum) {
  chrome.runtime.sendMessage({
    method:'renderAllSubsequent', 
    data:replaysToRender,
    replayI:replayI,
    lastOne:lastOne,
    useTextures:$('#useTextureCheckbox')[0].checked,
    useSplats:$('#useSplatsCheckbox')[0].checked,
    tabNum:tabNum
  });
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
    unGreyButtons()
    openReplayMenu()
  } else if(message.method == "movieRenderFailure") {
    alert('pls. That replay is too old to replay. Don\'t delete it yet though, because I\'ll eventually add in replay functions for old replays.')
  } else if(message.method == "movieDownloadConfirmation") {
    console.log('got movie download confirmation')
  } else if(message.method == "movieDownloadFailure") {
    alert('Download failed. Most likely you haven\'t rendered that movie yet.')
  } else if(message.method == "progressBarCreate") {
    // CREATE PROGRESS BAR AND GREY OUT BUTTONS
    $('#'+message.name+' .rendered-check').after('<progress id='+message.name+'ProgressBar style="margin-left:5px">')
    $('#'+message.name+'ProgressBar').width(100)
    $('#'+message.name+'ProgressBar').css({'margin-right' : '5px'})
    $('#'+message.name+' .download-movie-button').remove()
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
  chrome.runtime.sendMessage({
    method:'setPositionData',
    positionData:data
  })
})

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

function injectStyleSheet(path) {
  var link = document.createElement('link');
  link.setAttribute("rel", "stylesheet");
  link.href = chrome.extension.getURL(path);
  //script.onload = removeScript;
  (document.head||document.documentElement).appendChild(link);
}

// if we're on the main tagpro server screen, run the createReplayPageButton function
if(document.URL.search(/[a-z]+\/#?$/) >= 0) {
  // make the body scrollable
  $('body')[0].style.overflowY = "scroll"
  // make the button
  createReplayPageButton()
  // Inject style sheet for menu.
  injectStyleSheet("ui/_menu.css");
  injectStyleSheet("ui/_texture.css");
  injectStyleSheet("ui/_recordkey.css");
}  


// if we're in a game, as evidenced by there being a port number, inject the replayRecording.js script
if(document.URL.search(/\.\w+:/) >= 0) {
  var scripts = ["replayRecording.js"];
  scripts.forEach(injectScript);
}

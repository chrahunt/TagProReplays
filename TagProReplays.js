// Cookie functions.
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

// Get URL for setting cookies, assumes a domain of *.hostname.tld:*/etc
var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//)[1];

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
  $('#ReplayMenuButton').click(function() {
    // Show menu.
    if($('#menuContainer').length) {
      $('#menuContainer').modal('show');
    }
  });
}

// Function to create the menu.
function createMenu() {
  // Create Container for Replay Menu.
  $('article').append('<div id="tpr-container" class="bootstrap-container">');

  // Retrieve html of all items
  $('#tpr-container').load(chrome.extension.getURL("ui/menus.html"), function() {
    console.log("Loaded.");

    /* UI-specific code */
    // Code to set the header row to the same width as the replay table, if needed.
    /*$('#menuContainer').on('shown.bs.modal', function() {
      $('#replay-headers').width($('#replayList table').width());
    });*/

    // Handling multiple modals
    // http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
    $(function() {
      $('.modal').on('hidden.bs.modal', function(e) {
        $(this).removeClass('fv-modal-stack');
        $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') - 1);
      });

      $('.modal').on('shown.bs.modal', function(e) {
        // keep track of the number of open modals
        if (typeof($('#tpr-container').data('open_modals')) == 'undefined') {
          $('#tpr-container').data('open_modals', 0);
        }

        // if the z-index of this modal has been set, ignore.
        if ($(this).hasClass('fv-modal-stack')) {
          return;
        }
           
        $(this).addClass('fv-modal-stack');

        $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') + 1);

        $(this).css('z-index', 1040 + (10 * $('#tpr-container').data('open_modals')));

        $('.modal-backdrop').not('.fv-modal-stack' ).css(
          'z-index',
          1039 + (10 * $('#tpr-container').data('open_modals'))
        );

        $('.modal-backdrop').not('fv-modal-stack').addClass('fv-modal-stack'); 
      });
    });

    // 
    setFormTitles();

    // Save form fields.
    saveSettings = function() {
      // Save form fields
      fpsInputValue = $('#fpsInput')[0].value
      durationInputValue = $('#durationInput')[0].value
      recordInputValue = $('#recordCheckbox')[0].checked
      useTexturesInputValue = $('#useTextureCheckbox')[0].checked
      useRecordKeyValue = $('#recordKeyChooserInput').data('record');
      console.log("Use record key value: " + useRecordKeyValue);
      currentRecordKey = $('#recordKeyChooserInput').text();
      useSplatsValue = $('#useSplatsCheckbox')[0].checked
      // Set cookies for replayRecording
      if(!isNaN(fpsInputValue) & fpsInputValue!="") {
        setCookie('fps', $('#fpsInput')[0].value, cookieDomain)
      }
      if(!isNaN(durationInputValue) & durationInputValue!="") {
        setCookie('duration', $('#durationInput')[0].value, cookieDomain)
      }
      setCookie('record', recordInputValue, cookieDomain)
      setCookie('useTextures', useTexturesInputValue, cookieDomain)
      setCookie('useRecordKey', useRecordKeyValue, cookieDomain)
      if(currentRecordKey !== 'None') {
        setCookie('replayRecordKey', currentRecordKey.charCodeAt(0), cookieDomain)
      }
      setCookie('useSplats', useSplatsValue, cookieDomain)
      
      chrome.runtime.sendMessage({
        method:'cleanRenderedReplays'
      });
      $('#settingsContainer').modal('hide');
    }

    $('#saveSettingsButton').click(saveSettings);

    // Set value of settings when dialog opened, using default values if
    // none have yet been set.
    setSettings = function() {
      fpsValue = (!readCookie('fps')) ? "30" : readCookie('fps');
      durationValue = (!readCookie('duration')) ? "30" : readCookie('duration');
      recordValue = (!readCookie('record')) ? 'true' : readCookie('record');
      // Record key default is '/'
      replayRecordKey = (!readCookie('replayRecordKey')) ? 47 : readCookie('replayRecordKey');
      useTexturesValue = (!readCookie('useTextures')) ? 'false' : readCookie('useTextures');
      useRecordKeyValue = (!readCookie('useRecordKey')) ? 'false' : readCookie('useRecordKey');
      useSplatsValue = (!readCookie('useSplats')) ? 'false' : readCookie('useSplats');
      
      $('#fpsInput')[0].value=(!isNaN(fpsValue) & fpsValue!="") ? fpsValue : 30;
      $('#durationInput')[0].value=(!isNaN(durationValue) & durationValue!="") ? durationValue : 30;
      if(useRecordKeyValue === 'true') {
        $('#recordKeyChooserInput').text(String.fromCharCode(replayRecordKey));
        $('#recordKeyChooserInput').data('record', true);
        $('#record-key-remove').show();
      } else {
        $('#recordKeyChooserInput').text('None');
        $('#recordKeyChooserInput').data('record', false);
        $('#record-key-remove').hide();
      }
      $('#useTextureCheckbox')[0].checked = (useTexturesValue === 'true');
      $('#useSplatsCheckbox')[0].checked = (useSplatsValue === 'true');
      $('#recordCheckbox')[0].checked = (recordValue === 'true');
    }

    $('#settingsContainer').on('show.bs.modal', setSettings);
    // Set settings so other areas that use the settings directly from the
    // elements will work properly.
    setSettings();

    // Update list of replays when menu is opened.
    $('#menuContainer').on('show.bs.modal', function() {
      $('.replayRow').not('.clone').remove();
      getListData();
    });

    // these buttons allow rendering/deleting multiple replays
    $('#renderSelectedButton').click(renderSelectedInitial);
    $('#deleteSelectedButton').click(deleteSelected);

    // function for determining if a position file name is in an array of rendered movie names
    function positionFileIsRendered(positionFileName, movieNames) {
      for(m in movieNames) {
        if(positionFileName.replace('replays','').replace(/.*DATE/,'') == movieNames[m]) {
          return(true);
        }
      }
      return(false);
    }
    
    // Get replay id for row, given an element in it.
    function getReplayId(elt) {
      var replayRow = $(elt).closest('tr');
      return replayRow.data("replay");
    }

    // function that initially sends list of replays to background script for mass rendering
    // the function that deals with subsequent renderings ("renderSelectedSubsequent") is defined below in the global scope
    function renderSelectedInitial() {
      replaysToRender = []
      $('.selected-checkbox').each(function() {
        if(this.checked) {
          replaysToRender.push(getReplayId(this));
        }
      });
      if(replaysToRender.length > 0) {
        console.log(replaysToRender);
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
          var row = $(this).closest('tr');
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
      
      if(!(replayList.length > 0)) {
        // Show "No replays" message.
        $('#noReplays').show();
        $('#renderSelectedButton').prop('disabled', true);
        $('#deleteSelectedButton').prop('disabled', true);
        $('#replayList').hide();
      } else {
        console.log("got replays");
        // Enable buttons for interacting with multiple selections.
        $('#renderSelectedButton').prop('disabled', false);
        $('#deleteSelectedButton').prop('disabled', false);

        // this is where the replay sorting functions will go, when i write them
        replayList = replayList.reverse();

        // Display list of replays.
        $('#replayList').show();

        $('#noReplays').hide();

        // Template row that other rows will clone and populate with their own information.
        var cloneRow = $('#replayList .replayRow.clone:first').clone(true);
        cloneRow.removeClass('clone');
        console.log(replayList);
        
        // Populate rows
        for(dat in replayList) {
          thisReplay = replayList[dat]
          var newRow = cloneRow.clone(true);
          newRow.data("replay", thisReplay);
          newRow.attr("id", thisReplay);
          // Set playback link text
          newRow.find('a.playback-link').text(thisReplay.replace(/DATE.*/,''));

          ms = +thisReplay.replace('replays','').replace(/.*DATE/,'');
          date = new Date(ms);
          datevalue = date.toDateString() +' '+ date.toLocaleTimeString().replace(/:.?.? /g, ' ');
          newRow.find('a.playback-link').title = datevalue;
          
          if(positionFileIsRendered(thisReplay, movieNames)) {
            newRow.find('.rendered-check').text('✓');
          } else {
            newRow.find('.download-movie-button').prop('disabled', true);
          }

          newRow.find('.replay-date').text(datevalue);
          $('#replayList tbody').append(newRow);
        }

        // Set replay row element click handlers.
        // Set handler for in-browser-preview link.
        $('.replayRow:not(.clone) .playback-link').click(function() {
          var replayId = getReplayId(this);
          $('#menuContainer').modal('hide');
          console.log('sending data request for ' + replayId);
          sessionStorage.setItem('currentReplay', replayId);
          chrome.runtime.sendMessage({
            method: 'requestData',
            fileName: replayId
          });
        });

        // Set handler for movie download button.
        $('.replayRow:not(.clone) .download-movie-button').click(function() {
          var replayId = getReplayId(this);
          fileNameToDownload = replayId;
          console.log('asking background script to download video for '+ fileNameToDownload)
          chrome.runtime.sendMessage({
            method: 'downloadMovie',
            name: fileNameToDownload
          });
        });

        // Set handler for raw data download button.
        $('.replayRow:not(.clone) .download-button').click(function() {
          var replayId = getReplayId(this);
          fileNameToDownload = replayId;
          console.log('requesting ' + fileNameToDownload);
          chrome.runtime.sendMessage({
            method: 'requestDataForDownload',
            fileName: fileNameToDownload
          });
        });

        // Set handler for rename button.
        $('.replayRow:not(.clone) .rename-button').click(function() {
          var replayId = getReplayId(this);
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

        // Automatic height adjustment for replay list.
        $('#menuContainer .modal-dialog').data(
          'original-height',
          $('#menuContainer .modal-dialog').height()
        );

        setReplayListHeight = function() {
          if($('#menuContainer .modal-dialog').data('original-height') > $(window).height()) {
            var setHeight = false;
            var newHeight = 185;
            if($(window).height() > 500) {
              newHeight = $(window).height() - 315;
            }
            $('#replayList').height(newHeight);
          }
        }

        $(window).resize(setReplayListHeight);
        setReplayListHeight();
      }
    }

    $('#textureSaveButton').click(function() {
      saveTextureSettings();
      $('#textureContainer').modal('hide');
    });

    // Record key functionality.
    keyListener = function(e) {
      currentRecordKey = e.which
      $('#recordKeyChooserInput').text(String.fromCharCode(e.which))
      $('#recordKeyChooserInput').data('record', true);
      $('#record-key-remove').show();
      stopInputting();
    }

    stopInputting = function() {
      $('#record-key-input-container').removeClass('focused');
      $(document).off("keypress", keyListener);
    }

    $('#record-key-input-container').click(function(e) {
      console.log("target: "+e.target);
      console.log("test");
      $(this).addClass('focused');
      $(document).on("keypress", keyListener)
    });

    $('#record-key-remove').click(function(e) {
      e.stopPropagation();
      $('#recordKeyChooserInput').data('record', false);
      $('#recordKeyChooserInput').text('None');
      $('#record-key-remove').hide();
      return false;
    });

    $(document).click(function(e) {
      if(!$(e.target).parents().andSelf().is('#record-key-input-container')) {
        stopInputting();
      }
    });
  }); /* end menu load */
}

// Function to set UI titles.
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

// function for requesting indexdb datastore contents from background script.
// Response from background script initiates population of replays into menu.
function getListData() {
  chrome.runtime.sendMessage({
    method: 'requestList'
  });
}

function openReplayMenu() {
  if($('#menuContainer').length) {
    $('#menuContainer').modal('show');
  }
}

// Function to close and reopen the TagPro Replays menu.
function closeAndReopenMenu() {
  $('#menuContainer').modal('hide');
  // A delay here is necessary otherwise there is an issue with the
  // modal not re-appearing.
  setTimeout(function() {
    $('#menuContainer').modal('show');
  }, 500);
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
    closeAndReopenMenu();
  } else if(message.method == "fileRenameSuccess") {
    console.log('got confirmation of data file rename from background script')
    closeAndReopenMenu();
  } else if(message.method == "picture") {
    console.log('got picture file from background script')
    picture = message.file
  } else if(message.method == "movieRenderConfirmation") {
    console.log('got movie render confirmation')
    closeAndReopenMenu();
  } else if(message.method == "movieRenderFailure") {
    alert('pls. That replay is too old to replay. Don\'t delete it yet though, because I\'ll eventually add in replay functions for old replays.')
  } else if(message.method == "movieDownloadConfirmation") {
    console.log('got movie download confirmation')
  } else if(message.method == "movieDownloadFailure") {
    alert('Download failed. Most likely you haven\'t rendered that movie yet.')
  } else if(message.method == "progressBarCreate") {
    // CREATE PROGRESS BAR AND GREY OUT BUTTONS
    $('#'+message.name+' .rendered-check').html('<progress class="progressbar">')
    //$('#'+message.name+'ProgressBar').width(100)
    //$('#'+message.name+'ProgressBar').css({'margin-right' : '5px'})
    //$('#'+message.name+' .download-movie-button').remove()
    console.log('got request to create progress Bar for '+message.name)
  } else if(message.method == "progressBarUpdate") {
    // UPDATE PROGRESS BAR
    if(typeof $('#'+message.name+' .progressbar')[0] !== 'undefined') {
      $('#'+message.name+' .progressbar')[0].value=message.progress
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
  createReplayPageButton();
  createMenu();
  // Inject style sheet for menu.
  //injectStyleSheet("ui/_menu.css");
  //injectStyleSheet("ui/_texture.css");
  //injectStyleSheet("ui/_recordkey.css");
  // Include custom bootstrap.css scoped to #tpr-container
  injectStyleSheet("ui/bootstrap.css");
  injectStyleSheet("ui/menus.css");
}  


// if we're in a game, as evidenced by there being a port number, inject the replayRecording.js script
if(document.URL.search(/\.\w+:/) >= 0) {
  var scripts = ["replayRecording.js"];
  scripts.forEach(injectScript);
}

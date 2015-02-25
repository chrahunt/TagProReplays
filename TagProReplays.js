// Cookie functions.
function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function setCookie(name, value, domain) {
    var now = new Date();
    var time = now.getTime();
    var expireTime = time + 1000 * 60 * 60 * 24 * 365;
    now.setTime(expireTime);
    document.cookie = name + '=' + value + ';expires=' + now.toGMTString() + ';path=/; domain=' + domain;
    console.log('cookie: name=' + name + ' value=' + value + ' expires=' + now.toGMTString() + ' domain=' + domain);
}

// Get URL for setting cookies, assumes a domain of *.hostname.tld:*/etc
var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//)[1];

// Inserts Replay button in main page
function createReplayPageButton() {
    function findInsertionPoint() {
        buttons = $('article>div.buttons.smaller>a')
        for (var i = 0; i < buttons.length; i++) {
            textcontent = buttons[i].textContent
            if (textcontent.search('Leaders') >= 0) {
                return (buttons[i]);
            }
        }
    }

    $(findInsertionPoint()).after('<a class=button id=ReplayMenuButton>Replays')
    $('#ReplayMenuButton').append('<span>watch yourself')
    $('#ReplayMenuButton').click(function () {
        // Show menu.
        if ($('#menuContainer').length) {
            $('#menuContainer').modal('show');
        }
    });
}

// Function to create the menu.
function createMenu() {
    // Create Container for Replay Menu.
    $('article').append('<div id="tpr-container" class="bootstrap-container">');

    // Retrieve html of all items
    $('#tpr-container').load(chrome.extension.getURL("ui/menus.html"), function () {
        console.log("Loaded.");
       	$('#settings-title').text('TagPro Replays v' + chrome.runtime.getManifest().version);

        /* UI-specific code */
        // Code to set the header row to the same width as the replay table, if needed.
        /*$('#menuContainer').on('shown.bs.modal', function() {
         $('#replay-headers').width($('#replayList table').width());
         });*/

        // Handling multiple modals
        // http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
        $(function () {
            $('.modal').on('hidden.bs.modal', function (e) {
                $(this).removeClass('fv-modal-stack');
                $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') - 1);
            });

            $('.modal').on('shown.bs.modal', function (e) {
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

                $('.modal-backdrop').not('.fv-modal-stack').css(
                    'z-index',
                    1039 + (10 * $('#tpr-container').data('open_modals'))
                );

                $('.modal-backdrop').not('fv-modal-stack').addClass('fv-modal-stack');
            });
        });

        //
        setFormTitles();
        
        // allow 'select all' checkbox to work
        $('#selectAllCheckbox')[0].onchange=function(e) {
        					$('.replayRow:not(.clone) .selected-checkbox').each(function() {
        						this.checked = e.target.checked 
        					})

        }

        // Save form fields.
        saveSettings = function () {
            // Save form fields
            var fpsInputValue = $('#fpsInput')[0].value,
            	durationInputValue = $('#durationInput')[0].value,
            	recordInputValue = $('#recordCheckbox')[0].checked,
            	useTexturesInputValue = $('#useTextureCheckbox')[0].checked,
            	useRecordKeyValue = $('#recordKeyChooserInput').data('record'),
            	currentRecordKey = $('#recordKeyChooserInput').text(),
            	useSplatsValue = $('#useSplatsCheckbox')[0].checked,
            	useSpinValue = $('#useSpinCheckbox')[0].checked,
            	useClockAndScoreValue = $('#useClockAndScoreCheckbox')[0].checked,
            	useChatValue = $('#useChatCheckbox')[0].checked,
            	canvasWidthValue = Number($('#canvasWidthInput').val()),
            	canvasHeightValue = Number($('#canvasHeightInput').val());
            
            // Set cookies for replayRecording
            if (!isNaN(fpsInputValue) && fpsInputValue != "") {
                setCookie('fps', $('#fpsInput')[0].value, cookieDomain)
            }
            if (!isNaN(durationInputValue) && durationInputValue != "") {
                setCookie('duration', $('#durationInput')[0].value, cookieDomain);
            }
            setCookie('record', recordInputValue, cookieDomain);
            setCookie('useTextures', useTexturesInputValue, cookieDomain);
            setCookie('useRecordKey', useRecordKeyValue, cookieDomain);
            if (currentRecordKey !== 'None') {
                setCookie('replayRecordKey', currentRecordKey.charCodeAt(0), cookieDomain);
            }
            setCookie('useSplats', useSplatsValue, cookieDomain);
            setCookie('useSpin', useSpinValue, cookieDomain);
            setCookie('useClockAndScore', useClockAndScoreValue, cookieDomain);
            setCookie('useChat', useChatValue, cookieDomain);
            if (!isNaN(canvasWidthValue) && canvasWidthValue !== "") {
            	setCookie('canvasWidth', canvasWidthValue, cookieDomain);
            }
            if (!isNaN(canvasHeightValue) && canvasHeightValue !== "") {
            	setCookie('canvasHeight', canvasHeightValue, cookieDomain);
            } 

            chrome.runtime.sendMessage({
                method: 'cleanRenderedReplays'
            });
            $('#settingsContainer').modal('hide');
        }

        $('#saveSettingsButton').click(saveSettings);

        // Set value of settings when dialog opened, using default values if
        // none have yet been set.
        setSettings = function () {
            var fpsValue = readCookie('fps') || "60",
        		durationValue = readCookie('duration') || "30",
            	recordValue = readCookie('record') || 'true',
            	// Record key default is '/'
            	replayRecordKey = readCookie('replayRecordKey') || 47,
            	useTexturesValue = readCookie('useTextures') || 'true',
            	useRecordKeyValue = 'true',
            	useSplatsValue = readCookie('useSplats') || 'true',
            	useSpinValue = readCookie('useSpin') || 'true',
            	useClockAndScoreValue = readCookie('useClockAndScore') || 'true',
            	useChatValue = readCookie('useChat') || 'true', 
            	canvasWidthValue = readCookie('canvasWidth') || 1280,
            	canvasHeightValue = readCookie('canvasHeight') || 800;

            $('#fpsInput')[0].value = (!isNaN(fpsValue) & fpsValue != "") ? fpsValue : 60;
            $('#durationInput')[0].value = (!isNaN(durationValue) & durationValue != "") ? durationValue : 30;
            if (useRecordKeyValue === 'true') {
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
            $('#useSpinCheckbox')[0].checked = (useSpinValue === 'true');
            $('#useClockAndScoreCheckbox')[0].checked = (useClockAndScoreValue === 'true');
            $('#useChatCheckbox')[0].checked = (useChatValue === 'true');
            $('#canvasWidthInput').val(canvasWidthValue);
            $('#canvasHeightInput').val(canvasHeightValue);
        }

        $('#settingsContainer').on('show.bs.modal', setSettings);
        // Set settings so other areas that use the settings directly from the
        // elements will work properly.
        setSettings();

        // Update list of replays when menu is opened.
        $('#menuContainer').on('show.bs.modal', function () {
            $('.replayRow').not('.clone').remove();
            getListData();
        });

        // these buttons allow rendering/deleting multiple replays
        $('#renderSelectedButton').click(renderSelectedInitial);
        $('#deleteSelectedButton').click(deleteSelected);
        $('#downloadRawButton').click(downloadRawData);

        // function for determining if a position file name is in an array of rendered movie names
        function positionFileIsRendered(positionFileName, movieNames) {
            for (m in movieNames) {
                if (positionFileName.replace('replays', '').replace(/.*DATE/, '') == movieNames[m]) {
                    return (true);
                }
            }
            return (false);
        }

        // function that initially sends list of replays to background script for mass rendering
        // the function that deals with subsequent renderings ("renderSelectedSubsequent") is defined below in the global scope
        function renderSelectedInitial() {
            replaysToRender = []
            $('.selected-checkbox').each(function () {
                if (this.checked) {
                    replaysToRender.push(getReplayId(this));
                }
            });
            if (replaysToRender.length > 0) {
                console.log(replaysToRender);
                if (confirm('Are you sure you want to render these replays? The extension will be unavailable until the movies are rendered.')) {
                    chrome.runtime.sendMessage({
                        method: 'renderAllInitial',
                        data: replaysToRender,
                        useTextures: $('#useTextureCheckbox')[0].checked,
                        useSplats: $('#useSplatsCheckbox')[0].checked,
                        useSpin: $('#useSpinCheckbox')[0].checked,
                        useClockAndScore: $('#useClockAndScoreCheckbox')[0].checked,
                        useChat: $('#useChatCheckbox')[0].checked,
                        canvasWidth: isNaN($('#canvasWidthInput').val()) ? 1280 : Number($('#canvasWidthInput').val()),
                        canvasHeight: isNaN($('#canvasHeightInput').val()) ? 800 : Number($('#canvasHeightInput').val())
                    });
                    console.log('sent request to render multiple replays: ' + replaysToRender);
                }
            }
        }

        // function to delete multiple files at once
        function deleteSelected() {
            replaysToDelete = []
            $('.selected-checkbox').each(function () {
                if (this.checked) {
                    var row = $(this).closest('tr');
                    var replayId = row.data("replay");
                    replaysToDelete.push(replayId);
                }
            });

            if (replaysToDelete.length > 0) {
                if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
                    console.log('requesting to delete ' + replaysToDelete);
                    chrome.runtime.sendMessage({
                        method: 'requestDataDelete',
                        fileName: replaysToDelete
                    });
                }
            }
        }
        
        //function to download multiple raw data at once
        function downloadRawData() {
        	var rawDataToDownload = [];
        	$('.selected-checkbox').each(function () {
        		if (this.checked) {
        			var row = $(this).closest('tr');
        			var replayId = row.data('replay');
        			rawDataToDownload.push(replayId);
        		}
        	});
        	
        	if (rawDataToDownload.length > 0) {
        		console.log('requesting to download raw data for ' + rawDataToDownload);
        		chrome.runtime.sendMessage({
        			method: 'requestDataForDownload',
        			files: rawDataToDownload
        		});
        	}
        }
        
        /*
        Sorting Section
        **
        **
        **
        */
        
        // unicode arrows to use for sort indicators
        UPARROW   = "\u25B2"
        DOWNARROW = "\u25BC"
        
        /*
        These next functions allow toggling of the various sort methods.
        A cookie is used to store the current sort preference.
        Values of this cookie include:
        	- "alphaA"  : alphabetical ascending - normal alphabetical order
        	- "alphaD"  : alphabetical descending - reverse alphabetical
        	- "chronoA" : chronological ascending - older replays appear at the top
        	- "chronoD" : chronological descending - newer replays appear at the top
        	- "durA"    : duration ascending - shorter replays appear at the top
        	- "durD"    : duration descending - longer replays appear at the top
        	- "renA"    : rendered ascending - unrendered replays appear at the top
        	- "renD"    : rendered descending - rendered replays appear at the top
        
        */
        
        // function for toggling sorting - name (alphabetical)
        function nameSortToggle() {
        	var curSortMethod = readCookie('sortMethod');
        	setCookie('sortMethod', (curSortMethod === 'alphaD') ? "alphaA" : "alphaD", cookieDomain);
        	sortReplays();
        }        		
        
        // function for toggling sorting - date (chronological) 
        function dateSortToggle() {
        	var curSortMethod = readCookie('sortMethod');
        	setCookie('sortMethod', (curSortMethod === 'chronoD') ? "chronoA" : "chronoD", cookieDomain);
        	sortReplays();
        }
        
        // function for toggling sorting - duration 
        function durationSortToggle() {
        	var curSortMethod = readCookie('sortMethod');
        	setCookie('sortMethod', (curSortMethod === 'durD') ? "durA" : "durD", cookieDomain);
        	sortReplays();
        }
        
        // function for toggling sorting - rendered status
        function renderedSortToggle() {
        	var curSortMethod = readCookie('sortMethod');
        	setCookie('sortMethod', (curSortMethod === 'renD') ? "renA" : "renD", cookieDomain);
        	sortReplays();
        }
        
        // tie sorting toggle functions to the headers
        $('#nameHeader')[0].onclick = nameSortToggle;
        $('#nameHeader')[0].style.cursor = 'pointer';
        $('#dateHeader')[0].onclick = dateSortToggle;
        $('#dateHeader')[0].style.cursor = 'pointer';
        $('#durationHeader')[0].onclick = durationSortToggle;
        $('#durationHeader')[0].style.cursor = 'pointer';
        $('#renderedHeader')[0].onclick = renderedSortToggle;
        $('#renderedHeader')[0].style.cursor = 'pointer';
        
        // if no sortmethod cookie exists, default is chronoD
        if(!readCookie('sortMethod')) {
        	setCookie('sortMethod', 'chronoD', cookieDomain);
        }
        
        // this function grabs ids, dates, and durations and calls the doSorting function with 
        // the appropriate arguments. then it rearranges the replay rows in the menu according to that order.
        sortReplays = function() {
        	var entries = [];
        	$('#replayList .replayRow').not('.clone').map(function(a, b) {
        		var thisDurationString = $(b).find('.duration').text();
        		var thisMinutes = Number(thisDurationString.split(':')[0]);
        		var thisSeconds = Number(thisDurationString.split(':')[1]);
        		var thisDuration = 60*thisMinutes + thisSeconds;
        		var thisRendered = $(b).find('.rendered-check').text() !== '';
        		entries.push({
        			replay: b.id, 
        		    duration: thisDuration,
        		    rendered: thisRendered
        		});
        	});
        	var sortedEntries = doSorting(entries, readCookie('sortMethod'));
        	for(var entry in sortedEntries) {
        		var thisEntry = $('#replayList #'+sortedEntries[entry].replay);
        		if(entry === 0) {
        			$('#replayList tBody').prepend(thisEntry);
        			var oldEntry = thisEntry;
        		} else {
        			$(oldEntry).after(thisEntry);
        			oldEntry = thisEntry;
        		};
        	};
        	$('#replayList tBody').prepend($('#replayList .clone'));
        };		
        
        // this function handles sorting and the toggling of 
        doSorting = function(replaylist, sortmethod) {
        	if(sortmethod === "alphaA") {
        		$('#nameHeader')[0].textContent = 'Name '+UPARROW;
        		$('#dateHeader')[0].textContent = 'Date';
        		$('#durationHeader')[0].textContent = 'Duration';
        		$('#renderedHeader')[0].textContent = 'Rendered';
        		return(replaylist.sort(function(a,b) {
        			aREP = a.replay;
        			bREP = b.replay;
        			if(aREP < bREP) return(-1);
        			if(aREP > bREP) return(1);
        			return(0);
        		}));
        	}
        	if(sortmethod === "alphaD") {
        		$('#nameHeader')[0].textContent = 'Name '+DOWNARROW;
        		$('#dateHeader')[0].textContent = 'Date';
        		$('#durationHeader')[0].textContent = 'Duration';
        		$('#renderedHeader')[0].textContent = 'Rendered';
        		return(replaylist.sort(function(a,b) {
        			aREP = a.replay;
        			bREP = b.replay;
        			if(aREP < bREP) return(-1);
        			if(aREP > bREP) return(1);
        			return(0);
        		}).reverse());
        	}
        	if(sortmethod === "chronoA") {
        		$('#dateHeader')[0].textContent = 'Date '+UPARROW;
            	$('#nameHeader')[0].textContent = 'Name';
            	$('#durationHeader')[0].textContent = 'Duration';
            	$('#renderedHeader')[0].textContent = 'Rendered';
        		return(replaylist.sort(function(a,b) {
                	aNum = Number(a.replay.replace('replays', '').replace(/.*DATE/, ''));
                	bNum = Number(b.replay.replace('replays', '').replace(/.*DATE/, ''));
                	return(aNum - bNum);
                }))
            }
            if(sortmethod === "chronoD") {
            	$('#dateHeader')[0].textContent = 'Date '+DOWNARROW;
            	$('#nameHeader')[0].textContent = 'Name';
            	$('#durationHeader')[0].textContent = 'Duration';
            	$('#renderedHeader')[0].textContent = 'Rendered';
            	return(replaylist.sort(function(a,b) {
                	aNum = Number(a.replay.replace('replays', '').replace(/.*DATE/, ''));
                	bNum = Number(b.replay.replace('replays', '').replace(/.*DATE/, ''));
                	return(bNum - aNum);
                }))
            }
            if(sortmethod === 'durA') {
            	$('#durationHeader')[0].textContent = 'Duration '+UPARROW;
            	$('#dateHeader')[0].textContent = 'Date';
            	$('#nameHeader')[0].textContent = 'Name';
            	$('#renderedHeader')[0].textContent = 'Rendered';
            	return(replaylist.sort(function(a,b) {
            		return(Number(a.duration) - Number(b.duration));
            	}));
            }
            if(sortmethod === 'durD') {
            	$('#durationHeader')[0].textContent = 'Duration '+DOWNARROW;
            	$('#dateHeader')[0].textContent = 'Date';
            	$('#nameHeader')[0].textContent = 'Name';
            	$('#renderedHeader')[0].textContent = 'Rendered';
            	return(replaylist.sort(function(a,b) {
            		return(Number(b.duration) - Number(a.duration));
            	}));
            }
            if(sortmethod === 'renA') {
            	$('#renderedHeader')[0].textContent = 'Rendered '+UPARROW;
            	$('#durationHeader')[0].textContent = 'Duration';
            	$('#dateHeader')[0].textContent = 'Date';
            	$('#nameHeader')[0].textContent = 'Name';
            	return(replaylist.sort(function(a,b) {
            		return(a.rendered - b.rendered);
            	}));
            }
            if(sortmethod === 'renD') {
            	$('#renderedHeader')[0].textContent = 'Rendered '+DOWNARROW;
            	$('#durationHeader')[0].textContent = 'Duration';
            	$('#dateHeader')[0].textContent = 'Date';
            	$('#nameHeader')[0].textContent = 'Name';
            	return(replaylist.sort(function(a,b) {
            		return(b.rendered - a.rendered);
            	}));
            }
        }

		/*
		End of Sorting Section
		**
		**
		*/


        // This puts the current replays into the menu
        populateList = function (storageData, movieNames, metadata, previews) {
            replayList = [];
            for (dat in storageData) {
                replayList.push({replay:storageData[dat], metadata:metadata[dat], preview:previews[dat]});
            }

            if (!(replayList.length > 0)) {
                // Show "No replays" message.
                $('#noReplays').show();
                $('#renderSelectedButton').prop('disabled', true);
                $('#deleteSelectedButton').prop('disabled', true);
                $('#downloadRawButton').prop('disabled', true);
                $('#replayList').hide();
            } else {
                console.log("got replays");
                // Enable buttons for interacting with multiple selections.
                $('#renderSelectedButton').prop('disabled', false);
                $('#deleteSelectedButton').prop('disabled', false);
                $('#downloadRawButton').prop('disabled', false);

                // sort the results
                replayList = doSorting(replayList, readCookie('sortMethod'));

                // Display list of replays.
                $('#replayList').show();

                $('#noReplays').hide();

                // Template row that other rows will clone and populate with their own information.
                var cloneRow = $('#replayList .replayRow.clone:first').clone(true);
                cloneRow.removeClass('clone');
                console.log(replayList);

                // Populate rows
                for (dat in replayList) {
                    thisReplay = replayList[dat].replay
                    var metadata = $.isPlainObject(replayList[dat].metadata) ? replayList[dat].metadata : JSON.parse(replayList[dat].metadata);
                    thisDuration = metadata.duration;
                    var titleText = formatMetaDataTitle(metadata);
                    var thisPreview = replayList[dat].preview;
                    var newRow = cloneRow.clone(true);
                    newRow.data("replay", thisReplay);
                    newRow.attr("id", thisReplay);
                    // Set playback link text
                    newRow.find('a.playback-link').text(thisReplay.replace(/DATE.*/, ''));
                    newRow.find('a.playback-link').data('preview', thisPreview);
                    newRow.find('a.playback-link').popover({
  						html: true,
  						trigger: 'hover',
       					placement : 'right',
  						content: function () {
    						return '<img src="'+$(this).data('preview') + '"/>';
  						}
					});

                    ms = +thisReplay.replace('replays', '').replace(/.*DATE/, '');
                    date = new Date(ms);
                    datevalue = date.toDateString() + ' ' + date.toLocaleTimeString().replace(/:.?.? /g, ' ');
                    newRow.find('a.playback-link').title = datevalue;

                    if (positionFileIsRendered(thisReplay, movieNames)) {
                        newRow.find('.rendered-check').text('✓');
                    } else {
                        newRow.find('.download-movie-button').prop('disabled', true);
                    }
                    
                    var durationDate = new Date(thisDuration * 1000);
                    var durationFormatted = durationDate.getUTCMinutes()+':'+('0'+durationDate.getUTCSeconds()).slice(-2)
                    newRow.find('.duration').text(durationFormatted);

                    newRow.find('.replay-date').text(datevalue);
                    newRow[0].title = titleText;
                    $('#replayList tbody').append(newRow);
                }

                // Set replay row element click handlers.
                // Set handler for in-browser-preview link.
                $('.replayRow:not(.clone) .playback-link').click(function () {
                    var replayId = getReplayId(this);
                    //$('#menuContainer').modal('hide');
                    $('#menuContainer').hide();
                    console.log('sending data request for ' + replayId);
                    sessionStorage.setItem('currentReplay', replayId);
                    chrome.runtime.sendMessage({
                        method: 'requestData',
                        fileName: replayId
                    });
                });

                // Set handler for movie download button.
                $('.replayRow:not(.clone) .download-movie-button').click(function () {
                    var replayId = getReplayId(this);
                    fileNameToDownload = replayId;
                    console.log('asking background script to download video for ' + fileNameToDownload)
                    chrome.runtime.sendMessage({
                        method: 'downloadMovie',
                        name: fileNameToDownload
                    });
                });
				
                // Set handler for rename button.
                $('.replayRow:not(.clone) .rename-button').click(function () {
                    var replayId = getReplayId(this);
                    fileNameToRename = replayId;
                    datePortion = fileNameToRename.replace(/.*DATE/, '').replace('replays', '');
                    newName = prompt('How would you like to rename ' + fileNameToRename.replace(/DATE.*/, ''));
                    if (newName != null) {
                        newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '') + "DATE" + datePortion;
                        console.log('requesting to rename from ' + fileNameToRename + ' to ' + newName);
                        chrome.runtime.sendMessage({
                            method: 'requestFileRename',
                            oldName: fileNameToRename,
                            newName: newName
                        });
                    }
                });
                
                // Set handler for checkbox.
                $('.replayRow:not(.clone) .selected-checkbox').click(function(e) {
                	if( this.checked && e.shiftKey && $('.replayRow:not(.clone) .selected-checkbox:checked').length > 1 ) {
                		var boxes = $('.replayRow:not(.clone) .selected-checkbox'),
                		    closestBox = undefined,
                		    thisBox = undefined;
                		for(var i = 0; i < boxes.length; i++) {
                			if ( this == boxes[i] ) { 
                				var thisBox = i; 
                				if ( closestBox ) break;
                				continue
                			}
                			if (boxes[i].checked) var closestBox = i;
                			if ( thisBox && closestBox ) break;
                		}
                		var bounds = [closestBox, thisBox].sort(function(a,b){return(a-b)});
                		boxes.map(function(num, box) { 
                			if(num > bounds[0] && num < bounds[1]) box.checked = true;
                		});
                	}
                });

                $('#replayList').height('auto');
                // Automatic height adjustment for replay list.
                $('#menuContainer .modal-dialog').data(
                    'original-height',
                    $('#menuContainer .modal-dialog').height()
                );

                setReplayListHeight = function () {
                    if ($('#menuContainer .modal-dialog').data('original-height') > $(window).height()) {
                        var setHeight = false;
                        var newHeight = 185;
                        if ($(window).height() > 500) {
                            newHeight = $(window).height() - 315;
                        }
                        $('#replayList').height(newHeight);
                    }
                }
                
                setReplayMenuWidth = function() {
                	$('#menuContainer .modal-dialog').width(.70*$(window).width());
                }
                
				setReplayMenuWidth();
                $(window).resize(setReplayListHeight);
                $(window).resize(setReplayMenuWidth);
                setReplayListHeight();
            }
        }
        /* end populateList */

        $('#textureSaveButton').click(function () {
            saveTextureSettings();
            $('#textureContainer').modal('hide');
        });

        // Record key functionality.
        keyListener = function (e) {
            currentRecordKey = e.which
            $('#recordKeyChooserInput').text(String.fromCharCode(e.which))
            $('#recordKeyChooserInput').data('record', true);
            $('#record-key-remove').show();
            stopInputting();
        }

        stopInputting = function () {
            $('#record-key-input-container').removeClass('focused');
            $(document).off("keypress", keyListener);
        }

        $('#record-key-input-container').click(function (e) {
            console.log("target: " + e.target);
            console.log("test");
            $(this).addClass('focused');
            $(document).on("keypress", keyListener)
        });

        $('#record-key-remove').click(function (e) {
            e.stopPropagation();
            $('#recordKeyChooserInput').data('record', false);
            $('#recordKeyChooserInput').text('None');
            $('#record-key-remove').hide();
            return false;
        });

        $(document).click(function (e) {
            if (!$(e.target).parents().andSelf().is('#record-key-input-container')) {
                stopInputting();
            }
        });

        // Raw data import functionality.
        /*
         * Test a raw TagPro Replays data file for integrity and add to
         * replays.
         * fileData  the file data as read from the file input
         * fileName  [optional]  the name of the file as it will appear in
         *   the replay list.
         */
        rawParse = function (fileData, fileName, i, files) {
        	i++;
            try {
                var parsedData = JSON.parse(fileData);
            } catch (err) {
                alert('The file you uploaded was not a valid TagPro Replays raw file.');
                return;
            }

            // Test for necessary replay parts.
            if (!parsedData.tiles | !parsedData.clock | !parsedData.floorTiles | !parsedData.map | !parsedData.wallMap) {
                alert('The file you uploaded was not a valid TagPro Replays raw file.');
            } else {
                var message = {
                    method: 'setPositionDataFromImport',
                    positionData: fileData
                }
                if(typeof fileName !== 'undefined') message.newName = fileName;

				chrome.runtime.sendMessage(message, function(response) {
					console.log('got "data added" response from background script')
					addRow(response.replayName, JSON.parse(response.metadata), response.preview, 'top');
        			sortReplays();
        			readImportedFile(files, i);
				});
            }
        }
        
        // function for preparing a file to be read by the rawParse function
        readImportedFile = function(files, i) {
			if(i==files.length) return
        	var rawFileReader = new FileReader();
			var newFileName = files[i].name.replace(/\.txt$/, '');
			if (newFileName.search('DATE') < 0 && newFileName.search('replays') != 0) {
				newFileName += 'DATE' + new Date().getTime()
			}
			rawFileReader.onload = function (e) {
				rawParse(e.target.result, newFileName, i, files);
			}
			rawFileReader.readAsText(files[i]);
		};
        
        // Visible button invokes the actual file input.
        $('#raw-upload-button').click(function (e) {
            // Empty file input so change listener is invoked even if same
            // file is selected.
            $('#raw-upload').val('');
            $('#raw-upload').click();
            e.preventDefault();
        });
        $('#raw-upload').attr('accept', '.txt');
        $('#raw-upload').change(function () {
            var files = $(this).prop('files');
            if (files.length > 0) {
                readImportedFile(files, 0)
            }
        });
    });
    /* end menu load */
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
    
    canvasWidthAndHeightTitle = 'Set the width and height of the .webm movie file. The default is 1280 by 800, ' +
    'but set it to 1280 by 720 for true 720p resolution';
    $('#canvasWidthInput').prop('title', canvasWidthAndHeightTitle);
    $('#canvasHeightInput').prop('title', canvasWidthAndHeightTitle);
}

// function for requesting indexdb datastore contents from background script.
// Response from background script initiates population of replays into menu.
function getListData() {
    chrome.runtime.sendMessage({
        method: 'requestList'
    });
}

function openReplayMenu() {
    if ($('#menuContainer').length) {
        $('#menuContainer').modal('show');
    }
}

// Function to close and reopen the TagPro Replays menu.
// THIS FUNCTION IS NO LONGER USED - IT REMAINS HERE IN CASE I NEED IT LATER FOR SOME REASON
function closeAndReopenMenu() {
    // first, clear out saved rendered replays whose raw files have been deleted
    chrome.runtime.sendMessage({
        method: 'cleanRenderedReplays'
    });

    $('#menuContainer').modal('hide');
    // A delay here is necessary otherwise there is an issue with the
    // modal not re-appearing.
    setTimeout(function () {
        $('#menuContainer').modal('show');
    }, 500);
}

// This is in case we want the user to download something 
function saveData(name, data) {
    var file = new Blob([data], {type: "data:text/txt;charset=utf-8"});
    var a = document.createElement('a');
    a.download = name + '.txt';
    a.href = (window.URL || window.webkitURL).createObjectURL(file);
    var event = document.createEvent('MouseEvents');
    event.initEvent('click', true, false);
    // trigger download
    a.dispatchEvent(event);
    (window.URL || window.webkitURL).revokeObjectURL(a.href);
}

// This is an easy method wrapper to dispatch events
function emit(event, data) {
    var e = new CustomEvent(event, {detail: data});
    window.dispatchEvent(e);
}

// this function is run upon receipt of confirmation from the background script that one of the selected replays has been rendered
function renderSelectedSubsequent(replaysToRender, replayI, lastOne) {
    chrome.runtime.sendMessage({
        method: 'renderAllSubsequent',
        data: replaysToRender,
        replayI: replayI,
        lastOne: lastOne,
        useTextures: $('#useTextureCheckbox')[0].checked,
        useSplats: $('#useSplatsCheckbox')[0].checked,
        useSpin: $('#useSpinCheckbox')[0].checked,
        useClockAndScore: $('#useClockAndScoreCheckbox')[0].checked,
        useChat: $('#useChatCheckbox')[0].checked
    });
    console.log('sent request to render replay: ' + replaysToRender[replayI])
}

// this function stores custom texture files sent by the background script
function storeTextures(textures) {
	Object.keys(textures).forEach(function(key){
		if(textures[key] != undefined) {
			localStorage.setItem(key, textures[key]);
		}
	})
}

// function to delete replays from menu after their data are deleted from IndexedDB	
// this gets called in reponse to a message from the background script confirming a
// data deletion	
function deleteRows(deletedFiles) {
	if(!$.isArray(deletedFiles)) {
		$('#'+deletedFiles).remove();
		return
	}
	deletedFiles.map(function(deletedFile){
		$('#'+deletedFile).remove()
	});
};

// function to change the name text and id of a replay when a user renames the replay
// this gets called in response to a message from the background script confirming a 
// successful renaming
function renameRow(oldName, newName) {
	var oldRow = $('#' + oldName);
	$('#'+oldName + ' .playback-link').text(newName.replace(/DATE.*/, ''));
	oldRow.data("replay", newName);
	oldRow[0].id = newName;
};

//Get replay id for row, given an element in it.
function getReplayId(elt) {
	var replayRow = $(elt).closest('tr');
	return replayRow.data("replay");
}

// function to format metadata to put into title text
function formatMetaDataTitle(metadata) {
    var title = '';
    title += "Map: " + metadata.map + "\n";
    title += "FPS: " + metadata.fps + "\n";
    title += "Red Team:\n\t" + metadata.redTeam.join('\n\t') + "\n";
    title += "Blue Team:\n\t" + metadata.blueTeam.join('\n\t') + "\n";
    return(title)
}

// function to add a row to the replay list
// the second argument tells the function where to put the new row
// if it equals "top", then the row goes at the top
// if it is a replay name, it will go before that replay 
function addRow(replayName, metadata, thisPreview, insertionPoint) {
	var ms = +replayName.replace('replays', '').replace(/.*DATE/, '');
    var date = new Date(ms);
    var datevalue = date.toDateString() + ' ' + date.toLocaleTimeString().replace(/:.?.? /g, ' ');
    var duration = metadata.duration;
    var durationDate = new Date(duration * 1000);
    var durationFormatted = durationDate.getUTCMinutes()+':'+('0'+durationDate.getUTCSeconds()).slice(-2)
    var titleText = formatMetaDataTitle(metadata);
	
	if(insertionPoint === 'top' || insertionPoint !== replayName) {
		var cloneRow = $('#replayList .replayRow.clone:first').clone(true);
    	cloneRow.removeClass('clone');
		var newRow = cloneRow.clone(true);
    	newRow.data("replay", replayName);
    	newRow.attr("id", replayName);
    	// Set playback link text
    	newRow.find('a.playback-link').text(replayName.replace(/DATE.*/, ''));
		newRow.find('a.playback-link').data('preview', thisPreview);
		newRow.find('a.playback-link').popover({
  						html: true,
  						trigger: 'hover',
       					placement : 'right',
  						content: function () {
    						return '<img src="'+$(this).data('preview') + '"/>';
  						}
					});
		newRow.find('.download-movie-button').prop('disabled', true);
    	newRow.find('.replay-date').text(datevalue);
    	newRow.find('.duration').text(durationFormatted);
    	newRow[0].title = titleText;
    	if(insertionPoint === 'top') {
    		$('#replayList tbody').prepend(newRow);
    	} else {
    		$('#'+insertionPoint).replaceWith(newRow);
    	}
    
		// Set replay row element click handlers.
		// Set handler for in-browser-preview link.
		$('#'+replayName+' .playback-link').click(function () {
			var replayId = getReplayId(this);
			console.log(replayId)
			//$('#menuContainer').modal('hide');
			$('#menuContainer').hide();
			console.log('sending data request for ' + replayId);
			sessionStorage.setItem('currentReplay', replayId);
			chrome.runtime.sendMessage({
				method: 'requestData',
				fileName: replayId
			});
		});

		// Set handler for movie download button.
		$('#'+replayName+' .download-movie-button').click(function () {
			var replayId = getReplayId(this);
			fileNameToDownload = replayId;
			console.log('asking background script to download video for ' + fileNameToDownload)
			chrome.runtime.sendMessage({
				method: 'downloadMovie',
				name: fileNameToDownload
			});
		});

		// Set handler for rename button.
		$('#'+replayName+' .rename-button').click(function () {
			var replayId = getReplayId(this);
			fileNameToRename = replayId;
			datePortion = fileNameToRename.replace(/.*DATE/, '').replace('replays', '');
			newName = prompt('How would you like to rename ' + fileNameToRename.replace(/DATE.*/, ''));
			if (newName != null) {
				newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '') + "DATE" + datePortion;
				console.log('requesting to rename from ' + fileNameToRename + ' to ' + newName);
				chrome.runtime.sendMessage({
					method: 'requestFileRename',
					oldName: fileNameToRename,
					newName: newName
				});
			}
		});
		
		// Set handler for checkbox.
		$('#'+replayName+' .selected-checkbox').click(function(e) {
			if( this.checked && e.shiftKey && $('.replayRow:not(.clone) .selected-checkbox:checked').length > 1 ) {
				var boxes = $('.replayRow:not(.clone) .selected-checkbox'),
					closestBox = undefined,
					thisBox = undefined;
				for(var i = 0; i < boxes.length; i++) {
					if ( this == boxes[i] ) { 
						var thisBox = i; 
						if ( closestBox ) break;
						continue
					}
					if (boxes[i].checked) var closestBox = i;
					if ( thisBox && closestBox ) break;
				}
				var bounds = [closestBox, thisBox].sort(function(a,b){return(a-b)});
				boxes.map(function(num, box) { 
					if(num > bounds[0] && num < bounds[1]) box.checked = true;
				});
			}
		});
	} else {
    	var oldRow = $('#'+insertionPoint);
    	oldRow.find('.rendered-check').text('');
    	oldRow.find('.download-movie-button').prop('disabled', true);
    	oldRow.find('.duration').text(durationFormatted);
    }
}


// set global scope for some variables and functions
// then set up listeners for info from background script
var positions
var savePlayerPositions
var populateList
var initiateAnimation
var videofile
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.method == 'itemsList') {
        console.log('got itemList message')
        storeTextures(message.textures);
        populateList(message.positionKeys, message.movieNames, JSON.parse(message.metadata), message.previews);
    } else if (message.method == 'positionData') {
        console.log('got positionData message')
        localStorage.setItem('currentReplayName', message.movieName)
        console.log(typeof message.title)
        positions = JSON.parse(message.title)
        console.log(positions)
        createReplay(positions)
        animateReplay(thisI, positions, mapImg)
    } else if (message.method == "dataSetConfirmationFromBG") {
        console.log('got data set confirmation from background script. sending confirmation to injected script.')
        //closeAndReopenMenu();
        if (document.URL.search(/[a-z]+\/#?$/) >= 0) {
        	addRow(message.replayName, JSON.parse(message.metadata), message.preview, 'top');
        	sortReplays()
        }
        emit('positionDataConfirmation', true)
    } else if (message.method == "positionDataForDownload") {
        console.log('got data for download - ' + message.fileName)
        saveData(message.fileName, message.title)
    } else if (message.method == 'dataDeleted') {
        console.log('data were deleted')
        //closeAndReopenMenu();
        if(typeof message.newName !== 'undefined') {
        	addRow(message.newName, message.metadata, message.preview, message.deletedFiles)
        	sortReplays()
        } else {
        	deleteRows(message.deletedFiles);
        }
    } else if (message.method == "fileRenameSuccess") {
        console.log('got confirmation of data file rename from background script')
        //closeAndReopenMenu();
        renameRow(message.oldName, message.newName);
        sortReplays();
    } else if (message.method == "picture") {
        console.log('got picture file from background script')
        picture = message.file
    } else if (message.method == "movieRenderConfirmation") {
        console.log('got movie render confirmation')
        $('.replayRow').not('.clone').remove();
        getListData();
        //closeAndReopenMenu();
    } else if (message.method == "movieRenderFailure") {
        alert('pls. That replay is too old to replay. Don\'t delete it yet though, because I\'ll eventually add in replay functions for old replays.')
    } else if (message.method == "movieDownloadConfirmation") {
        console.log('got movie download confirmation')
    } else if (message.method == "movieDownloadFailure") {
        alert('Download failed. Most likely you haven\'t rendered that movie yet.')
    } else if (message.method == "progressBarCreate") {
        // CREATE PROGRESS BAR AND GREY OUT BUTTONS
        $('#' + message.name + ' .rendered-check').html('<progress class="progressbar">')
        console.log('got request to create progress Bar for ' + message.name)
    } else if (message.method == "progressBarUpdate") {
        // UPDATE PROGRESS BAR
        if (typeof $('#' + message.name + ' .progressbar')[0] !== 'undefined') {
            $('#' + message.name + ' .progressbar')[0].value = message.progress
        }
    } else if (message.method == "movieRenderConfirmationNotLastOne") {
    	if( message.failure ) {
    		console.log(message.name+' was a failure.');
    		$('#' + message.name + ' .rendered-check').html('<txt style="color:red">ERROR');
    	}
        newReplayI = +message.replayI + 1
        lastOne = false
        if (newReplayI == message.replaysToRender.length - 1) {
            lastOne = true
        }
        renderSelectedSubsequent(message.replaysToRender, newReplayI, lastOne)
    }
});

// set fps and duration if they're not already
if (!readCookie('fps')) {
    setCookie('fps', 60, cookieDomain)
}
if (!readCookie('duration')) {
    setCookie('duration', 30, cookieDomain)
}
if (!readCookie('useSplats')) {
    setCookie('useSplats', true, cookieDomain)
}
if (!readCookie('useSpin')) {
	setCookie('useSpin', true, cookieDomain)
}
if (!readCookie('useClockAndScore')) {
	setCookie('useClockAndScore', true, cookieDomain)
}
if (!readCookie('canvasWidth')) {
	setCookie('canvasWidth', 1280, cookieDomain)
}
if (!readCookie('canvasHeight')) {
	setCookie('canvasHeight', 800, cookieDomain)
}
if (!readCookie('useChat')) {
	setCookie('useChat', true, cookieDomain)
}

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function (e) {
        listener(e.detail);
    });
}

// set up listener for info from injected script
// if we receive data, send it along to the background script for storage
listen('setPositionData', function (data) {
    console.log('got position data from injected script. sending to background script')
    chrome.runtime.sendMessage({
        method: 'setPositionData',
        positionData: data
    })
})

function injectScript(path) {
    var script = document.createElement('script');
    script.setAttribute("type", "application/javascript");
    script.src = chrome.extension.getURL(path);
    script.onload = removeScript;
    (document.head || document.documentElement).appendChild(script);
}

function removeScript() {
    this.parentNode.removeChild(this);
}

function injectStyleSheet(path) {
    var link = document.createElement('link');
    link.setAttribute("rel", "stylesheet");
    link.href = chrome.extension.getURL(path);
    //script.onload = removeScript;
    (document.head || document.documentElement).appendChild(link);
}

// if we're on the main tagpro server screen, run the createReplayPageButton function
if (document.URL.search(/[a-z]+\/#?$/) >= 0) {
    // make the body scrollable
    $('body')[0].style.overflowY = "scroll"
    // make the button
    createReplayPageButton();
    createMenu();
    // Include custom bootstrap.css scoped to #tpr-container
    injectStyleSheet("ui/bootstrap.css");
    injectStyleSheet("ui/menus.css");
}


// if we're in a game, as evidenced by there being a port number, inject the replayRecording.js script
if (document.URL.search(/\.\w+:/) >= 0) {
    var scripts = ["replayRecording.js"];
    scripts.forEach(injectScript);
}

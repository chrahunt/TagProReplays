const $ = require('jquery');
// Set global since bootstrap assumes it.
window.$ = window.jQuery = $;
require('bootstrap');
// Relinquish control back to existing version if needed.
$.noConflict(true);

const reader = require('promise-file-reader');

const logger = require('./modules/logger')('content');
const Cookies = require('./modules/cookies');
const Preview = require('./modules/previewer');
const Textures = require('./modules/textures');

// Get URL for setting cookies, assumes a domain of *.hostname.tld:*/etc
var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//)[1];

function get_options() {
  return Promise.resolve({
    spin: Cookies.read('useSpin') == 'true',
    splats: Cookies.read('useSplats') == 'true',
    ui: Cookies.read('useClockAndScore') == 'true',
    chats: Cookies.read('useChat') == 'true',
    custom_textures: Cookies.read('useTextures') == 'true',
    width: Cookies.read('canvasWidth') || 1280,
    height: Cookies.read('canvasHeight') || 800
  });
}

// Inserts Replay button in main page
function createReplayPageButton() {
    if ($('#userscript-home').length) {
        $('#play-now').after('<a class="btn" id="ReplayMenuButton">Replays');
        $('#ReplayMenuButton').append('<span class="sub-text">watch yourself');
    } else {
        $('div.buttons > a[href="/boards"]').after('<a class="button" id="ReplayMenuButton">Replays');
        $('#ReplayMenuButton').append('<span>watch yourself');
    }

    $('#ReplayMenuButton').click(function () {
        // Show menu.
        if ($('#menuContainer').length) {
            $('#menuContainer').modal('show');
        }
    });
}

// Function to create the menu.
function createMenu() {
    var insert_point;
    if ($('#userscript-home').length) {
        insert_point = $('body');
    } else {
        insert_point = $('article');
    }
    // Create Container for Replay Menu.
    insert_point.append('<div id="tpr-container" class="bootstrap-container">');

    // Retrieve html of all items
    $('#tpr-container').load(chrome.extension.getURL("html/menus.html"), function () {
        logger.info("Loaded.");
           $('#settings-title').text('TagPro Replays v' + chrome.runtime.getManifest().version);

        /* UI-specific code */
        // Code to set the header row to the same width as the replay table, if needed.
        /*$('#menuContainer').on('shown.bs.modal', function() {
         $('#replay-headers').width($('#replayList table').width());
         });*/

        // Handling multiple modals
        // http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
        // Track backdrops to overcome duplicate bootstrap code causing problems.
        var backdrops = new Map();
        $(function () {
            $('.modal').on('hidden.bs.modal', function (e) {
                $(this).removeClass('fv-modal-stack');
                $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') - 1);
                if (backdrops.has(this)) {
                    backdrops.get(this).remove();
                    backdrops.delete(this);
                }
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

                var these_backdrops = $('.modal-backdrop').not('.fv-modal-stack');
                backdrops.set(this, these_backdrops);
                these_backdrops.addClass('fv-modal-stack');
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
                Cookies.set('fps', $('#fpsInput')[0].value, cookieDomain)
            }
            if (!isNaN(durationInputValue) && durationInputValue != "") {
                Cookies.set('duration', $('#durationInput')[0].value, cookieDomain);
            }
            Cookies.set('record', recordInputValue, cookieDomain);
            Cookies.set('useTextures', useTexturesInputValue, cookieDomain);
            Cookies.set('useRecordKey', useRecordKeyValue, cookieDomain);
            if (currentRecordKey !== 'None') {
                Cookies.set('replayRecordKey', currentRecordKey.charCodeAt(0), cookieDomain);
            }
            Cookies.set('useSplats', useSplatsValue, cookieDomain);
            Cookies.set('useSpin', useSpinValue, cookieDomain);
            Cookies.set('useClockAndScore', useClockAndScoreValue, cookieDomain);
            Cookies.set('useChat', useChatValue, cookieDomain);
            if (!isNaN(canvasWidthValue) && canvasWidthValue !== "") {
                Cookies.set('canvasWidth', canvasWidthValue, cookieDomain);
            }
            if (!isNaN(canvasHeightValue) && canvasHeightValue !== "") {
                Cookies.set('canvasHeight', canvasHeightValue, cookieDomain);
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
            var fpsValue = Cookies.read('fps') || "60",
                durationValue = Cookies.read('duration') || "30",
                recordValue = Cookies.read('record') || 'true',
                // Record key default is '/'
                replayRecordKey = Cookies.read('replayRecordKey') || 47,
                useTexturesValue = Cookies.read('useTextures') || 'true',
                useRecordKeyValue = 'true',
                useSplatsValue = Cookies.read('useSplats') || 'true',
                useSpinValue = Cookies.read('useSpin') || 'true',
                useClockAndScoreValue = Cookies.read('useClockAndScore') || 'true',
                useChatValue = Cookies.read('useChat') || 'true', 
                canvasWidthValue = Cookies.read('canvasWidth') || 1280,
                canvasHeightValue = Cookies.read('canvasHeight') || 800;

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
        $('#renderSelectedButton').click(renderSelected);
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

        /**
         * Callback for Render button. Sends replays to background page
         * consecutively on completion of previous replay.
         */
        function renderSelected() {
            let ids = [];
            $('.selected-checkbox').each(function () {
                if (this.checked) {
                    ids.push(getReplayId(this));
                }
            });
            if (ids.length > 0) {
                if (confirm('Are you sure you want to render these replays? The extension will be unavailable until the movies are rendered.')) {
                  logger.info('Starting rendering of replays.');
                  let i = 0;
                  get_options().then(function render_loop(options) {
                    if (i === ids.length) {
                        logger.info('Rendering complete.');
                        return;
                    }
                    let id = ids[i];
                    $(`#${id} .rendered-check`).html('<progress class="progressbar">');
                    chrome.runtime.sendMessage({
                        method: 'replay.render',
                        id: id,
                        options: options
                    }, (result) => {
                        logger.info(`Received render confirmation for replay: ${i}`);
                        if (result.failed) {
                            logger.info(`Rendering of ${i} failed, reason: ${result.reason}`);
                            if (result.severity == 'fatal') {
                                alert(`Rendering failed: ${result.reason}`);
                                return;
                            } else {
                                // Some transient error, we can continue to send replays.
                                $(`#${id} .rendered-check`).html('<span style="color:red">ERROR');
                            }
                        } else {
                            $(`#${id} .rendered-check`).text('✓');
                            $(`#${id} .download-movie-button`).prop('disabled', false);
                        }
                        i++;
                        render_loop(options);
                    });
                  }).catch((err) => {
                    logger.error('Error retrieving options: ', err);
                  });
                }
            }
        }

        // function to delete multiple files at once
        function deleteSelected() {
            let ids = [];
            $('.selected-checkbox').each(function () {
                if (this.checked) {
                    var row = $(this).closest('tr');
                    var replayId = row.data("replay");
                    ids.push(replayId);
                }
            });

            if (ids.length > 0) {
                if (confirm('Are you sure you want to delete these replays? This cannot be undone.')) {
                    logger.info(`Requesting deletion of: ${ids}`);
                    chrome.runtime.sendMessage({
                        method: 'replay.delete',
                        ids: ids
                    });
                }
            }
        }
        
        //function to download multiple raw data at once
        function downloadRawData() {
            var ids = [];
            $('.selected-checkbox').each(function () {
                if (this.checked) {
                    var row = $(this).closest('tr');
                    var replayId = row.data('replay');
                    ids.push(replayId);
                }
            });
            
            if (ids.length > 0) {
                logger.info(`Requestion download for: ${ids}`);
                chrome.runtime.sendMessage({
                    method: 'replay.download',
                    ids: ids
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
            var curSortMethod = Cookies.read('sortMethod');
            Cookies.set('sortMethod', (curSortMethod === 'alphaD') ? "alphaA" : "alphaD", cookieDomain);
            sortReplays();
        }                
        
        // function for toggling sorting - date (chronological) 
        function dateSortToggle() {
            var curSortMethod = Cookies.read('sortMethod');
            Cookies.set('sortMethod', (curSortMethod === 'chronoD') ? "chronoA" : "chronoD", cookieDomain);
            sortReplays();
        }
        
        // function for toggling sorting - duration 
        function durationSortToggle() {
            var curSortMethod = Cookies.read('sortMethod');
            Cookies.set('sortMethod', (curSortMethod === 'durD') ? "durA" : "durD", cookieDomain);
            sortReplays();
        }
        
        // function for toggling sorting - rendered status
        function renderedSortToggle() {
            var curSortMethod = Cookies.read('sortMethod');
            Cookies.set('sortMethod', (curSortMethod === 'renD') ? "renA" : "renD", cookieDomain);
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
        if(!Cookies.read('sortMethod')) {
            Cookies.set('sortMethod', 'chronoD', cookieDomain);
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
            var sortedEntries = doSorting(entries, Cookies.read('sortMethod'));
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

        // Replay data row listeners.
        $('#replayList').on('click', '.playback-link', (e) => {
            var replayId = getReplayId(e.target);
            logger.info(`Playback link clicked for ${replayId}`);
            $('#menuContainer').hide();
            Preview(replayId);
        });

        $('#replayList').on('click', '.download-movie-button', (e) => {
            let replayId = getReplayId(e.target);
            logger.info(`Movie download button clicked for ${replayId}`);
            chrome.runtime.sendMessage({
                method: 'movie.download',
                id: replayId
            }, (result) => {
                if (result.failed) {
                    alert(`Download failed. Most likely you haven't rendered that movie yet.\nReason: ${result.reason}`);
                } else {
                    logger.debug('Movie download completed.');
                }
            });
        });

        $('#replayList').on('click', '.rename-button', (e) => {
            let replayId = getReplayId(e.target);
            logger.info(`Rename button clicked for ${replayId}`);
            let fileNameToRename = replayId;
            let datePortion = fileNameToRename.replace(/.*DATE/, '').replace('replays', '');
            let newName = prompt('How would you like to rename ' + fileNameToRename.replace(/DATE.*/, ''));
            if (newName != null) {
                newName = newName.replace(/ /g, '_').replace(/[^a-z0-9\_\-]/gi, '') + "DATE" + datePortion;
                logger.info('requesting to rename from ' + fileNameToRename + ' to ' + newName);
                chrome.runtime.sendMessage({
                    method: 'replay.rename',
                    id: fileNameToRename,
                    newName: newName
                });
            }
        });

        $('#replayList').on('click', '.selected-checkbox', (e) => {
            let self = e.target;
            if (self.checked && e.shiftKey &&
                $('.replayRow:not(.clone) .selected-checkbox:checked').length > 1) {
                let boxes = $('.replayRow:not(.clone) .selected-checkbox'),
                    closestBox = null,
                    thisBox = null;
                for (let i = 0; i < boxes.length; i++) {
                    if (self == boxes[i]) { 
                        thisBox = i; 
                        if (closestBox !== null) break;
                        continue;
                    }
                    if (boxes[i].checked) closestBox = i;
                    if (thisBox !== null && closestBox !== null) break;
                }
                var bounds = [closestBox, thisBox].sort((a, b) => a - b);
                boxes.map((num, box) => {
                    box.checked = bounds[0] <= num && num <= bounds[1];
                });
            }
        });

        // This puts the current replays into the menu
        populateList = function (storageData, movieNames, metadata) {
            let replayList = [];
            for (let index in storageData) {
                replayList.push({
                    replay:   storageData[index],
                    metadata: metadata[index]
                });
            }

            logger.info(`Received ${replayList.length} replay(s).`);
            if (!(replayList.length > 0)) {
                // Show "No replays" message.
                $('#noReplays').show();
                $('#renderSelectedButton').prop('disabled', true);
                $('#deleteSelectedButton').prop('disabled', true);
                $('#downloadRawButton').prop('disabled', true);
                $('#replayList').hide();
            } else {
                // Enable buttons for interacting with multiple selections.
                $('#renderSelectedButton').prop('disabled', false);
                $('#deleteSelectedButton').prop('disabled', false);
                $('#downloadRawButton').prop('disabled', false);

                // sort the results
                replayList = doSorting(replayList, Cookies.read('sortMethod'));

                // Display list of replays.
                $('#replayList').show();

                $('#noReplays').hide();

                // Template row that other rows will clone and populate with their own information.
                var cloneRow = $('#replayList .replayRow.clone:first').clone(true);
                cloneRow.removeClass('clone');

                // Populate rows
                for (dat in replayList) {
                    thisReplay = replayList[dat].replay
                    var metadata = $.isPlainObject(replayList[dat].metadata) ? replayList[dat].metadata : JSON.parse(replayList[dat].metadata);
                    thisDuration = metadata.duration;
                    var titleText = formatMetaDataTitle(metadata);
                    var newRow = cloneRow.clone(true);
                    newRow.data("replay", thisReplay);
                    newRow.attr("id", thisReplay);
                    // Set playback link text
                    newRow.find('a.playback-link').text(thisReplay.replace(/DATE.*/, ''));

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
          // Load image files, if available, from file fields.
          let imageSources = {
            tilesInput:        "tiles",
            portalInput:       "portal",
            speedpadInput:     "speedpad",
            speedpadredInput:  "speedpadred",
            speedpadblueInput: "speedpadblue",
            splatsInput:       "splats"
          };
          let textures = {};
          Promise.all(Object.keys(imageSources).map((id) => {
            let input = document.getElementById(id);
            if (!input) {
              return Promise.reject(`Could not find input with id: ${id}`);
            }
            let file = input.files[0];
            if (!file) return;
            return reader.readAsDataURL(file).then((data) => {
              textures[imageSources[id]] = data;
            });
          })).then(() => {
            return Textures.set(textures);
          }).then(() => {
            $('#textureContainer').modal('hide');
          }).catch((err) => {
            logger.error('Error saving textures: ', err);
          });
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
            logger.info("target: " + e.target);
            logger.info("test");
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
            if (!$(e.target).parents().addBack().is('#record-key-input-container')) {
                stopInputting();
            }
        });

        // Raw data import functionality.
        /*
         * Test a raw TagPro Replays data file for integrity and add to
         * replays.
         * fileData  the file data as read from the file input
         * fileName  
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
                chrome.runtime.sendMessage({
                    method: 'replay.import',
                    name: fileName,
                    data: parsedData
                }, function (response) {
                    logger.info(`Replay ${name} imported.`);
                    readImportedFile(files, i);
                });
            }
        };
        
        // function for preparing a file to be read by the rawParse function
        readImportedFile = function(files, i) {
            if (i == files.length) return;
            // Get file name from file or create.
            var file_name = files[i].name.replace(/\.txt$/, '');
            if (!file_name.includes('DATE') && !file_name.startsWith('replays')) {
                file_name += 'DATE' + Date.now();
            }
            reader.readAsText(files[i]).then((text) => {
                rawParse(text, file_name, i, files);
            });
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
    ' or if your replays are sped up, try reducing this value.';
    $('#fpsTxt').prop('title', fpsTitle);
    $('#fpsInput').prop('title', fpsTitle);

    durationTitle = 'Use this to set how long the replay will be in seconds. Values greater than 60' +
    ' seconds are not recommended.\n\nThis setting will apply to future recordings. It will not affect' +
    ' replays that have already been recorded';
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

    recordKeyTitle = 'This allows you to designate a key that acts exactly like clicking' +
    ' the record button with the mouse.\n\nDon\'t use keys that have other uses in the' +
    ' game, such as w, a, s, d, t, or g.\n\nActually, don\'t use a letter key at all,' +
    ' because the extension will listen for that key even if you are typing in chat.';
    $('#recordKeyTxt').prop('title', recordKeyTitle);
    $('#recordKeyCheckbox').prop('title', recordKeyTitle);

    useSplatsTitle = 'This toggles whether to show splats or not.\n\nCheck the box if you' +
    ' want to show splats in the replay';
    $('#useSplatsTxt').prop('title', useSplatsTitle);
    $('#useSplatsCheckbox').prop('title', useSplatsTitle);
    
    canvasWidthAndHeightTitle = 'Set the width and height of the .webm movie file. The default is 1280 by 800,' +
    ' but set it to 1280 by 720 for true 720p resolution';
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

// This is an easy method wrapper to dispatch events
function emit(event, data) {
    var e = new CustomEvent(event, {detail: data});
    window.dispatchEvent(e);
}

// function to delete replays from menu after their data are deleted from IndexedDB    
// this gets called in reponse to a message from the background script confirming a
// data deletion    
function deleteRows(deletedFiles) {
    if(!Array.isArray(deletedFiles)) {
        $('#'+deletedFiles).remove();
        return
    }
    deletedFiles.map(function(deletedFile){
        $('#'+deletedFile).remove()
    });
}

// function to change the name text and id of a replay when a user renames the replay
// this gets called in response to a message from the background script confirming a 
// successful renaming
function renameRow(oldName, newName) {
    var oldRow = $('#' + oldName);
    $('#'+oldName + ' .playback-link').text(newName.replace(/DATE.*/, ''));
    oldRow.data("replay", newName);
    oldRow[0].id = newName;
}

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

/**
 * Make row for new replay.
 */
function make_row(name, metadata) {
    var ms = +name.replace('replays', '').replace(/.*DATE/, '');
    var date = new Date(ms);
    var datevalue = date.toDateString() + ' ' + date.toLocaleTimeString().replace(/:.?.? /g, ' ');
    var duration = metadata.duration;
    var durationDate = new Date(duration * 1000);
    var durationFormatted = durationDate.getUTCMinutes()+':'+('0'+durationDate.getUTCSeconds()).slice(-2);
    var titleText = formatMetaDataTitle(metadata);
    
    var row = $('#replayList .replayRow.clone:first').clone(true);
    row.removeClass('clone');
    row.data("replay", name);
    row.attr("id", name);
    // Set playback link text
    row.find('a.playback-link').text(name.replace(/DATE.*/, ''));
    row.find('.download-movie-button').prop('disabled', true);
    row.find('.replay-date').text(datevalue);
    row.find('.duration').text(durationFormatted);
    row[0].title = titleText;
    return row;
}

// function to add a row to the replay list
// the second argument tells the function where to put the new row
// if it equals "top", then the row goes at the top
// if it is a replay name, it will go before that replay 
function addRow(replayName, metadata) {
    logger.debug(`Adding row for ${replayName}`);
    let row = make_row(replayName, metadata);
    $('#replayList tbody').prepend(row);
}

function replaceRow(id, new_id, metadata) {
    logger.debug(`Replacing row ${id} with ${new_id}.`);
    let row = make_row(new_id, metadata);
    $(`#${id}`).replaceWith(row);
}

// set global scope for some variables and functions
// then set up listeners for info from background script
var positions;
var savePlayerPositions;
var populateList;
var initiateAnimation;
var videofile;
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    let method = message.method;
    logger.info(`Received message: ${method}`);

    if (method == 'replay.added') {
        addRow(message.id, message.metadata);
        sortReplays();

    } else if (method == 'replay.deleted') {
        deleteRows(message.ids);

    } else if (method == 'replay.replaced') {
        replaceRow(message.id, message.new_id, message.metadata);
        sortReplays();

    } else if (method == 'itemsList') {
        populateList(message.positionKeys, message.movieNames, JSON.parse(message.metadata));

    } else if (method == "replay.renamed") {
        logger.info(`Replay ${message.id} renamed to ${message.new_name}.`)
        renameRow(message.id, message.new_name);
        sortReplays();

    } else if (method == "render.update") {
        let id = message.id;
        let progress = message.progress;
        let progress_bar = $(`#${id} .progressbar`)[0];
        progress_bar.value = progress;

    } else {
        logger.error(`Message type not recognized: ${method}`);
    }
});

// set fps and duration if they're not already
if (!Cookies.read('fps')) {
    Cookies.set('fps', 60, cookieDomain);
}
if (!Cookies.read('duration')) {
    Cookies.set('duration', 30, cookieDomain);
}
if (!Cookies.read('useSplats')) {
    Cookies.set('useSplats', true, cookieDomain);
}
if (!Cookies.read('useSpin')) {
    Cookies.set('useSpin', true, cookieDomain);
}
if (!Cookies.read('useClockAndScore')) {
    Cookies.set('useClockAndScore', true, cookieDomain);
}
if (!Cookies.read('canvasWidth')) {
    Cookies.set('canvasWidth', 1280, cookieDomain);
}
if (!Cookies.read('canvasHeight')) {
    Cookies.set('canvasHeight', 800, cookieDomain);
}
if (!Cookies.read('useChat')) {
    Cookies.set('useChat', true, cookieDomain);
}
if (!Cookies.read('useTextures')) {
    Cookies.set('useTextures', true, cookieDomain);
}

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function (e) {
        listener(e.detail);
    });
}

// set up listener for info from injected script
// if we receive data, send it along to the background script for storage
listen('replay.save', function (info) {
    logger.info('got position data from injected script. sending to background script')
    chrome.runtime.sendMessage({
        method: 'replay.save_record',
        data: info.data,
        name: info.name
    }, (result) => {
        emit('replay.saved', {
            failed: result
        })
    });
});

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
    injectStyleSheet("css/bootstrap.css");
    injectStyleSheet("css/menu.css");
}


// if we're in a game, as evidenced by there being a port number, inject the replayRecording.js script
if (document.URL.search(/\.\w+:/) >= 0) {
    var scripts = ["js/recording.js"];
    scripts.forEach(injectScript);
}
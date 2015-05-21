/**
 * Record and save the state of the game, emitting an event to the
 * window with the replay data which is picked up by a content script.
 * 
 * This file is injected into the page by TagProReplays. This is
 * necessary in order to listen to the game socket, which provides game
 * state information.
 */
(function(window, document, undefined) {

/**
 * Read cookie with given name, returning its value if found. If no
 * cookie with the name is found, returns `null`.
 * @param {string} name - The name of the cookie to retrieve the value
 *   for.
 * @return {?string} - The value of the cookie, or null if not found.
 */
function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

/**
 * Create an array of size `n` filled with null.
 * @param {integer} n - The size of the array to create.
 * @return {Array.<null>} - An array of size `N` filled with zeros.
 */
function createNullArray(n) {
    var ary = new Array(n);
    for (var i = 0; i < ary.length; i++) ary[i] = null;
    return ary;
}

/**
 * @typedef Options
 * @type {object}
 * @property {integer} fps - The FPS at which the replay should be
 *   recorded at.
 * @property {integer} duration - The duration (in seconds) of the
 *   replay.
 * @property {boolean} record_key_enabled - Whether or not the record
 *   hotkey should function.
 * @property {integer} record_key - The KeyCode for the hotkey that can
 *   be used to save a replay.
 * @property {boolean} record - Whether or not recording should occur.
 */
/**
 * Get set options from cookies, or default options if no cookies are
 * set.
 * @return {Options} - The options to use when recording.
 */
function getOptions() {
    function getBooleanCookie(name, defaultValue) {
        var cookie = readCookie(name);
        if (cookie) {
            return cookie == "true";
        } else {
            return defaultValue;
        }
    }

    var fps = +readCookie('fps') || 60;
    var duration = +readCookie('duration') || 30;
    var record_key_enabled = getBooleanCookie('useRecordKey', true);
    var record_key = +readCookie('replayRecordKey') || 47;
    var record = getBooleanCookie('record', true);

    var options = {
        fps: fps,
        duration: duration,
        record_key_enabled: record_key_enabled,
        record_key: record_key,
        record: record
    };
    return options;
}

// Retrieve recording options.
var options = getOptions();

// Initialize the replay recording.
function recordReplayData(data) {
    var savingIndex = 0;
    var fps = options.fps;
    var saveDuration = options.duration;
    var numFrames = fps * saveDuration;

    // Set up replay data container.
    data.bombs = [];
    data.chat = [];
    data.endTimes = [];
    data.dynamicTiles = [];
    data.spawns = [];
    data.splats = [];
    data.score = createNullArray(numFrames);
    data.time = createNullArray(numFrames);

    data.players = {};

    data.map = tagpro.map;
    delete data.map.splats;
    data.wallMap = tagpro.wallMap;

    // Set initial value for end time.
    data.endTimes.push((new Date(tagpro.gameEndsAt)).getTime());

    // Set up dynamic tiles.
    var dynamicTileIds = [3, 4, 5, 6, 9, 10, 13, 14, 15, 16, 19, 20, 21];
    for (var col in data.map) {
        for (var row in data.map[col]) {
            var tile = data.map[col][row];
            if (dynamicTileIds.indexOf(Math.floor(tile)) !== -1) {
                data.dynamicTiles.push({
                    x: Number(col),
                    y: Number(row),
                    value: createNullArray(numFrames)});
            }
        }
    }

    // set up listener for chats, splats, and bombs
    tagpro.socket.on('chat', function (msg) {
        data.chat.push({
            from: msg.from,
            to: msg.to,
            message: msg.message,
            color: msg.c, // Optional.
            mod: msg.mod, // Optional.
            time: Date.now()
        });
    });

    tagpro.socket.on('splat', function (msg) {
        data.splats.push({
            team: msg.t,
            x: msg.x,
            y: msg.y,
            temp: msg.temp,
            time: Date.now()
        });
    });

    tagpro.socket.on('bomb', function (msg) {
        data.bombs.push({
            type: msg.type,
            x: msg.x,
            y: msg.y,
            time: Date.now()
        });
    });

    tagpro.socket.on('spawn', function (msg) {
        data.spawns.push({
            team: msg.t,
            wait: msg.w,
            x: msg.x,
            y: msg.y,
            time: Date.now()
        });
    });

    tagpro.socket.on('end', function (msg) {
        data.gameEnd = {
            winner: msg.winner,
            time: Date.now()
        };
    });

    tagpro.socket.on('time', function (msg) {
        if (msg.hasOwnProperty('time')) {
            data.endTimes.push(Date.now() + msg.time);
        } else {
            // TODO: Handle case where required parameter is missing.
        }
    });

    // Find the index of the first value in an array that satisfies the
    // condition, or -1 if none satisfy it.
    function findIndex(array, fn) {
        for (var i = 0; i < array; i++) {
            if (fn(array[i])) {
                return i;
            }
        }
        return -1;
    }

    // function to save game data
    var saveFrame = function () {
        for (var id in tagpro.players) {
            // Create player if needed.
            if (!data.players.hasOwnProperty(id)) {
                data.players[id] = {
                    angle: createNullArray(numFrames),
                    auth: createNullArray(numFrames),
                    bomb: createNullArray(numFrames),
                    dead: createNullArray(numFrames),
                    degree: createNullArray(numFrames),
                    draw: createNullArray(numFrames),
                    flair: createNullArray(numFrames),
                    flag: createNullArray(numFrames),
                    grip: createNullArray(numFrames),
                    id: Number(id),
                    name: createNullArray(numFrames),
                    tagpro: createNullArray(numFrames),
                    team: createNullArray(numFrames),
                    x: createNullArray(numFrames),
                    y: createNullArray(numFrames)
                };
            }
            var player = data.players[id];
            // Update player properties.
            for (var prop in player) {
                // Update properties, disregard 'id'.
                if (prop !== "id") {
                    var frames = player[prop];

                    frames.shift();
                    if (tagpro.players.hasOwnProperty(id)) {
                        frames.push(tagpro.players[id][prop]);
                    } else {
                        // Default value if player has left.
                        frames.push(null);
                    }
                }
            }
        }

        // Update state of dynamic tiles.
        data.dynamicTiles.forEach(function(tile) {
            tile.value.shift();
            tile.value.push(tagpro.map[tile.x][tile.y]);
        });
        data.time.shift();
        data.time.push(Date.now());
        data.score.shift();
        data.score.push({
            b: tagpro.score.b,
            r: tagpro.score.r
        });
    };

    thing = setInterval(saveFrame, 1000 / fps);
}

function emit(event, data) {
    var e = new CustomEvent(event, {detail: data});
    window.dispatchEvent(e);
}

// this function sets up a listener wrapper
function listen(event, listener) {
    window.addEventListener(event, function (e) {
        listener(e.detail);
    });
}

// Send replay data to content script.
function saveReplayData(data) {
    // Create the info.
    var info = {
        mapName: $('#mapInfo').text().replace('Map: ', '').replace(/ by.*/, ''),
        fps: options.fps,
        teamNames: {
            "1": tagpro.teamNames.redTeamName || "Red",
            "2": tagpro.teamNames.blueTeamName || "Blue"
        },
        player: tagpro.playerId,
        dateRecorded: Date.now(),
        name: 'replay-' + Date.now()
    };
    console.log('Sending replay data from injected script to content script.');
    var replay = {
        data: data,
        info: info,
        version: "2"
    };
    // DEBUG
    //localStorage.setItem("test_replay", data);
    emit('saveReplay', replay);
}

// Listen for content script save confirmation/failure.
listen('replaySaved', function(err) {
    console.log('Got confirmation message.');
    if (err) {
        $("#savedFeedback").text("Failed!");
        $("#savedFeedback").css({
            color: "red"
        });
        console.warn("Saving failed because: " + err.reason);
    } else {
        $("#savedFeedback").text("Saved!");
        $("#savedFeedback").css({
            color: "green"
        });
    }
    $(savedFeedback).fadeIn(300);
    setTimeout(function() {
        $(savedFeedback).fadeOut(900);
    }, 1e3);
});

// function to add button to record replay data AND if user has turned on key recording, add listener for that key.
function recordButton(data) {
    var button = document.createElement("img");
    button.id = 'recordButton';
    button.src = 'http://i.imgur.com/oS1bPqR.png';
    button.onclick = function () {
        saveReplayData(data);
    };
    button.style.position = "absolute";
    button.style.margin = "auto";
    button.style.right = "30px";
    button.style.top = "65px";
    button.style.cursor = "pointer";
    $('body').append(button);

    var savedFeedback = document.createElement('a');
    savedFeedback.id = 'savedFeedback';
    savedFeedback.textContent = 'Saved!';
    savedFeedback.style.right = '20px';
    savedFeedback.style.top = '100px';
    savedFeedback.style.position = "absolute";
    savedFeedback.style.color = '#00CC00';
    savedFeedback.style.fontSize = '20px';
    savedFeedback.style.fontWeight = 'bold';
    $('body').append(savedFeedback);
    $(savedFeedback).hide();

    if (options.record_key_enabled) {
        $(document).on("keypress", function (e) {
            if (e.which == options.record_key) {
                saveReplayData(data);
            }
        });
    }
}

// Run specified function when tagpro map is available.
function onTagProMap(fn) {
    if (typeof tagpro !== "undefined"  && tagpro.map && tagpro.wallMap) {
        fn();
    } else {
        setTimeout(function() {
            onTagProMap(fn);
        }, 250);
    }
}

if (options.record) {
    onTagProMap(function() {
        tagpro.ready(function() {
            var data = {};
            recordButton(data);
            recordReplayData(data);
        });
    });
}

})(window, document);

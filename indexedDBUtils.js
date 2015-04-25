(function(window) {

// Name of table holding replay data.
var STORE_NAME = "positions";

// Script-global database object.
var db;

var idbMigrations = new Migrations();

// Whether or not this is the initial version of the database.
function isUpgrade(version) {
    return version !== 0;
}

/**
 * @callback MigrationCallback
 * @param {boolean} err - Whether or not the migration failed.
 */
/**
 * @callback MigrationFunction
 * @param {IndexedDB} db - The database.
 * @param {MigrationCallback} callback - The function called when the
 *   migration function completes.
 */
/**
 * Add a migration function from one version to another
 * @param {integer} from - The starting version of the database the
 *   migration function operates on.
 * @param {(integer|Array.<integer>)} to - The version(s) of the
 *   database the migration function brings the database to.
 * @param {MigrationFunction} fn - The function to 
 */
window.idbAddMigration = function(from, to, fn) {
    idbMigrations.add(from, to, fn);
};

// Functions to initialize the database.
var initialize = {};

/**
 * @callback IDBInitialization
 * @param {} db - The database to initialize.
 */
/**
 * Function to add an initialization function for IndexedDB.
 * @param {IDBInitialization} fn - The function to initialize the
 *   database.
 */
window.idbAddInitialization = function(version, fn) {
    initialize[version] = fn;
};

// Initialize the IndexedDB.
window.idbOpen = function(name, version) {
    // Set up indexedDB
    var openRequest = indexedDB.open(name, version);
    openRequest.onupgradeneeded = function (e) {
        var db = e.target.result;
        var transaction = e.target.transaction;
        // listen for versionchange transaction end.
        transaction.onabort = function() {
            console.log("abort");
        };

        transaction.oncomplete = function() {
            console.log("complete");
        };

        transaction.onerror = function() {
            console.log("error");
        };

        // Upgrade from old version of database.
        if (isUpgrade(e.oldVersion)) {
            // Run relevant upgrade functions.
            var patch = idbMigrations.getPatchFunction(e.oldVersion, e.newVersion);
            if (patch) {
                patch(db, transaction, function(err) {
                    console.log("Error: " + err);
                    if (err) {
                        // Abort versionchange transaction.
                        e.target.transaction.abort();
                    }
                });
                // Run function.
            } else {
                // error.
                console.error("No patch function found.");
                // Abort versionchange transaction.
                e.target.transaction.abort();
            }
        } else {
            // Initiailize database.
            if (initialize[version]) {
                initialize[version].call(null, db);
            }
        }
    };

    openRequest.onsuccess = function (e) {
        // Assign to function global.
        db = e.target.result;
        db.onerror = function (e) {
            alert("Sorry, an unforseen error was thrown.");
            console.log("***ERROR***");
            console.dir(e.target);
        };
    };

    openRequest.onerror = function(e) {
        console.error("Error!");
    };
};

// Close the database.
window.idbClose = function() {
    if (db) {
        db.close();
    }
};

function idbGet(name, callback) {
    var transaction = db.transaction([STORE_NAME], "readonly");
    var store = transaction.objectStore(STORE_NAME);
    var request = store.get(name);
    request.onsuccess = function() {
        var data = request.result;
        callback(data);
    };
}

/**
 * Add data to data store with given name. The callback function is
 * invoked on successful storage of the data.
 * @param  {string} name - The name to store the data under.
 * @param  {*} data - The data to store.
 * @param  {Function} callback - Function called after successful
 *   storage of the data.
 */
window.idbPut = function(name, data, callback) {
    var transaction = db.transaction([STORE_NAME], "readwrite");
    var store = transaction.objectStore(STORE_NAME);
    var request = store.put(data, name);
    request.onsuccess = callback;
};

/**
 * Delete name/names from object store.
 * @param  {(string|Array.<string>)} name - The string or array of
 *   strings with the ids of the items to delete.
 * @param  {Function} callback - The callback function that will be
 *   called when the data has been deleted.
 */
window.idbDelete = function(names, callback) {
    if (typeof names == 'string') {
        names = [names];
    } else {
        // Ensure we don't alter the original array.
        names = names.slice();
    }
    function getNextSuccess() {
        if (names.length > 0) {
            return function() {
                name = names.shift();
                request = store.delete(name);
                request.onsuccess = getNextSuccess();
            };
        } else {
            return callback;
        }
    }
    var transaction = db.transaction(["positions"], "readwrite");
    var store = transaction.objectStore("positions");
    var name = names.shift();
    var request = store.delete(name);
    request.onsuccess = getNextSuccess();
};

function idbRename(oldName, newName, callback) {
    var transaction = db.transaction([STORE_NAME], "readwrite");
    var store = transaction.objectStore(STORE_NAME);
    var request = store.get(oldName);
    request.onsuccess = function() {
        var data = request.result;
        request = store.delete(oldName);
        request.onsuccess = function() {
            request = store.add(data, newName);
            request.onsuccess = callback;
        };
    };
}

/**
 * Iterate over the entries in the database, passing each entry to the
 * `each` function. Once all entries have been passed over, call `end`.
 * @param  {Function} each - The callback which will receive the value
 *   of each entry.
 * @param  {Function} end - The function to be called when all
 *   entries have been passed over.
 */
window.idbIterate = function(each, end) {
    var transaction = db.transaction([STORE_NAME], "readonly");
    var store = transaction.objectStore(STORE_NAME);
    var request = store.openCursor(null);
    request.onsuccess = function() {
        if (request.result) {
            each(request.result);
            request.result.continue();
        } else {
            end();
        }
    };
};

window.renameData = function(oldName, newName, callback) {
    idbRename(oldName, newName, callback);
};

// TODO
window.deleteData2 = function(name) {

}

window.iterateData = function(each, end) {
    idbIterate(each, end);
};

window.getData = function(name, callback) {
    idbGet(name, callback);
};

})(window);

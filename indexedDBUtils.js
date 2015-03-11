(function(window) {

// Database name.
var DB_NAME = "ReplayDatabase";
var DB_VERS = 1;

// Name of table holding replay data.
var STORE_NAME = "positions";

// Script-global database object.
var db;

// Holds information about the migrations that can be applied to the
// indexedDB.
var Migrations = {};

// Holds list of database versions and the patch necessary to get to
// the next version.
Migrations.patch = {};

// Number of patches.
Migrations.patches = 0;

// Container for the migration functions.
Migrations.functions = {};

Migrations.getFunctionName = function(from, to) {
    return "p" + from + "_" + to;
};

/**
 * Add the given function as a migration from the given version to the
 * given version.
 * @param {(integer|Array.<integer>)} from - The version(s) the
 *  function migrates from.
 * @param {integer} to - The version the function migrates to.
 * @param {MigrationFunction} fn
 */
Migrations.add = function(from, to, fn) {
    if (typeof from == "number") from = [from];
    from.forEach(function(version) {
        Migrations.patch[version] = to;
        Migrations.functions[getFunctionName(version, to)] = fn;
    });
};

// Retrieve the patch function for your upgrade event.
// Returns a function if ok or null if not ok.
Migrations.getPatchFunction = function(event) {
    // get the name of the function that will patch the from version
    // to the to verison.
    var fns = [];
    var from = event.oldVersion;
    var to = event.newVersion;
    var next = PatchPath[from];
    var patch = 1;
    fns.push(Patches[getPatchName(from, next)]);
    while (next !== to) {
        // Sanity check.
        if (patch > MAX_PATCHES) {
            return null;
        }
        from = next;
        next = PatchPath[from];
        fns.push(Patches[getPatchName(from, next)]);
    }

    function runPatchFunctions(fns, db, callback) {
        // Completed successfully.
        if (fns.length === 0) {
            callback(true);
        } else {
            var fn = fns.pop();
            fn(db, function(success) {
                if (success) {
                    runPatchFunctions(fns, db, callback);
                } else {
                    callback(false);
                }
            });
        }
    }

    return function(db, callback) {
        runPatchFunctions(fns, db, callback);
    };
};

// Whether or not this is the initial version of the database.
function isUpgrade(version) {
    return version !== 0;
}

/**
 * @callback MigrationCallback
 * @param {boolean} success - Whether or not the migration succeeded.
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
    Migrations.add(from, to, fn);
};

// Initialize the IndexedDB.
window.idbOpen = function() {
    // Set up indexedDB
    var openRequest = indexedDB.open(DB_NAME, DB_VERS);
    openRequest.onupgradeneeded = function (e) {
        _TPR_IDBUpgrading = true;
        if (isUpgrade(e.oldVersion)) {
            // Run relevant upgrade functions.
            var patch = Migrations.getPatchFunction(e);
        }

        // Ensure database contains correct object stores.
        var db = e.target.result;
        if (!db.objectStoreNames.contains("positions")) {
            console.log("Creating positions object store.");
            var objectStore = db.createObjectStore("positions", {
                autoIncrement: true
            });
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

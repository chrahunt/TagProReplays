(function(window) {

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
        //setStatus("upgrading");
        var db = e.target.result;
        var transaction = e.target.transaction;
        // listen for versionchange transaction end.
        transaction.onabort = function() {
            console.error("versionchange aborted.");
        };

        transaction.oncomplete = function() {
            console.log("versionchange completed");
        };

        transaction.onerror = function() {
            console.error("versionchange error");
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
        setStatus("loaded");
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

// Get database, for debugging.
window.getDb = function() {
    return db;
};

})(window);

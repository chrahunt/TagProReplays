var Migrations = require('./migrations');

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
exports.addMigration = function(from, to, fn) {
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
exports.addInitialization = function(version, fn) {
    if (!initialize.hasOwnProperty(version)) {
        initialize[version] = [];
    }
    initialize[version].push(fn);
};

// Functions to call after database is initialized.
var ready = [];

exports.ready = function(fn) {
    ready.push(fn);
};

// Initialize the IndexedDB.
exports.open = function(name, version) {
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
            // Initialize database.
            if (initialize.hasOwnProperty(version)) {
                initialize[version].forEach(function(initialization) {
                    initialization.call(null, db);
                });
            }
        }
    };

    openRequest.onsuccess = function (e) {
        // Assign to function global.
        db = e.target.result;
        ready.forEach(function(fn) {
            fn.call(null);
        });
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
exports.close = function() {
    if (db) {
        db.close();
    }
};

// Get database, for debugging.
exports.getDb = function() {
    return db;
};

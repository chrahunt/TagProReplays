(function(window) {

// Holds information about the migrations that can be applied
// sequentially to an object or objects.
var Migrations = function() {
    // Holds list of object versions.
    this.patch = {};
    // Number of patches.
    this.patches = 0;
    // Container for the migration functions.
    this.functions = {};
};

window.Migrations = Migrations;

Migrations.prototype.getFunctionName = function(from, to) {
    return "p" + from + "_" + to;
};

/**
 * @callback MigrationCallback
 * @param {boolean} err - Whether or not the migration failed.
 */
/**
 * @callback MigrationFunction
 * @param {*...} - Any arguments needed for conversion.
 * @param {MigrationCallback} callback - The function called when the
 *   migration function completes.
 */
/**
 * Add the given function as a migration from the given version to the
 * given version.
 * @param {(integer|Array.<integer>)} from - The version(s) the
 *  function migrates from.
 * @param {integer} to - The version the function migrates to.
 * @param {MigrationFunction} fn
 */
Migrations.prototype.add = function(from, to, fn) {
    if (typeof from == "number") from = [from];
    from.forEach(function(version) {
        this.patch[version] = to;
        this.functions[this.getFunctionName(version, to)] = fn;
    }, this);
    this.patches++;
};

// Retrieve the patch function for your upgrade event.
// Returns a function if ok or null if not ok.
Migrations.prototype.getPatchFunction = function(event) {
    // get the name of the function that will patch the from version
    // to the to verison.
    var fns = [];
    var from = event.oldVersion;
    var to = event.newVersion;
    if (from >= to) {
        return null;
    }
    var next = this.patch[from];
    var patch = 1;
    var fn = this.functions[this.getFunctionName(from, next)];
    fns.push(fn);
    while (next !== to) {
        // Sanity check.
        if (patch > this.patches) {
            return null;
        } else {
            patch++;
        }
        from = next;
        next = this.patch[from];
        fns.push(this.functions[this.getFunctionName(from, next)]);
    }

    function runPatchFunctions() {
        // Completed successfully.
        var args = Array.prototype.slice.call(arguments);
        var fns = args.shift();
        var fn = fns.shift();
        var callback = args.pop();
        args.push(function(err) {
            if (err) {
                callback(err);
            } else {
                if (fns.length !== 0) {
                    args.unshift(fns);
                    args.pop();
                    args.push(callback);
                    runPatchFunctions.apply(null, args);
                } else {
                    // Success
                    callback();
                }
            }
        });
        fn.apply(null, args);
    }

    return function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.slice(-1)[0];
        if (fns.length === 0) {
            // Nothing to run, success.
            callback();
        } else {
            args.unshift(fns);
            runPatchFunctions.apply(null, args);
        }
    };
};

})(window);

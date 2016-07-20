/**
 * Upgrade from one version to another.
 */
function Upgrade() {
  this.versions = {};
  this.n_versions = 0;
  this.upgrade_fns = {};
}

module.exports = Upgrade;

Upgrade.prototype.from = function (v) {

};

Upgrade.prototype.to = function (v) {

};


// Holds information about the migrations that can be applied
// sequentially to an object or objects.
var Migrations = function () {
    // Holds list of object versions.
  this.patch = {};
    // Number of patches.
  this.patches = 0;
    // Container for the migration functions.
  this.functions = {};
};

module.exports = Migrations;

Migrations.prototype.getFunctionName = function (from, to) {
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
 * @param {((integer|string)|Array.<(integer|string)>)} from - The version(s)
 *   the function migrates from.
 * @param {(integer|string)} to - The version the function migrates to.
 * @param {MigrationFunction} fn
 */
Migrations.prototype.add = function (from, to, fn) {
  if (typeof from == "number" || typeof from == "string") from = [from];
  from.forEach(function (version) {
    this.patch[version] = to;
    this.functions[this.getFunctionName(version, to)] = fn;
  }, this);
  this.patches++;
};

/**
 * Creates the function that will make incremental changes to the
 * objects expected by the individual migration functions. If a
 * migration is not needed then null is returned.
 * @param {(integer|string)} from - The version transitioning from.
 * @param {(integer|string)} to - The version transitioning to.
 * @return {Function?} - The function to use to transition the object(s).
 */
Migrations.prototype.getPatchFunction = function (from, to) {
  // get the name of the function that will patch the from version
  // to the to verison.
  var fns = [];
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
    var args = [...arguments];
    var fns = args.shift();
    var fn = fns.shift();
    var callback = args.pop();
    args.push((err) => {
      if (err) {
        callback(err);
      } else {
        if (fns.length !== 0) {
          args.unshift(fns);
          args.pop();
          args.push(callback);
          runPatchFunctions(...args);
        } else {
          // Success
          callback();
        }
      }
    });
    fn(...args);
  }

  return function () {
    var args = [...arguments];
    var callback = args.slice(-1)[0];
    if (fns.length === 0) {
      // Nothing to run, success.
      callback();
    } else {
      args.unshift(fns);
      runPatchFunctions(...args);
    }
  };
};

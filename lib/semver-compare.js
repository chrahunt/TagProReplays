/**
 * Compare version numbers. Copied from
 * https://github.com/substack/semver-compare
 */
(function(window) {

function cmp (a, b) {
    var pa = a.split('.');
    var pb = b.split('.');
    for (var i = 0; i < 3; i++) {
        var na = Number(pa[i]);
        var nb = Number(pb[i]);
        if (na > nb) return 1;
        if (nb > na) return -1;
        if (!isNaN(na) && isNaN(nb)) return 1;
        if (isNaN(na) && !isNaN(nb)) return -1;
    }
    return 0;
}

window.semver = {
  lt: function(a, b) {
    return cmp(a, b) === -1;
  },
  gt: function(a, b) {
    return cmp(a, b) === 1;
  },
  lte: function(a, b) {
    return cmp(a, b) <= 0;
  },
  gte: function(a, b) {
    return cmp(a, b) >= 0;
  }
};

})(window);

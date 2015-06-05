/**
 * Functions for reading and writing cookies.
 */

// Get URL for setting cookies, assumes a domain of *.hostname.tld:*/etc
var cookieDomain = document.URL.match(/https?:\/\/[^\/]+?(\.[^\/.]+?\.[^\/.]+?)(?::\d+)?\//)[1];

/**
 * Get the cookie with the given name, or null if no cookie with that
 * value is found.
 * @param {string} name - The name of the cookie to retrieve.
 * @return {string?} - The retrieved value, or null if not found.
 */
exports.read = function(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
};

function setCookieInternal(name, value, domain) {
    var now = new Date();
    var time = now.getTime();
    var expireTime = time + 1000 * 60 * 60 * 24 * 365;
    now.setTime(expireTime);
    document.cookie = name + '=' + value + ';expires=' + now.toGMTString() + ';path=/; domain=' + domain;
    //console.log('cookie: name=' + name + ' value=' + value + ' expires=' + now.toGMTString() + ' domain=' + domain);
}

/**
 * Set a cookie with the given name to the provided value on the
 * current domain.
 * @param {string} name - The name of the cookie to set.
 * @param {(string|number)} value - The value to set for the cookie.
 */
exports.set = function(name, value) {
    return setCookieInternal(name, value, cookieDomain);
};

(function(window) {

/**
 * @callback LoopCallback
 * @param {integer} i - The iteration number.
 */
/**
 * Holds options, limits to impose on the execution of the
 * `processNonBlocking` function.
 * @typedef ProcessOptions
 * @type {object}
 * @property {boolean} limit - Whether or not to limit the processing.
 * @property {integer} [max_iterations] - If `limit` is set, then this
 *   field dictates a maximum number of consecutive loops to be
 *   executed.
 */
/**
 * Execute looping process without 
 * @param {integer} start - The iteration at which to start the loop.
 * @param {integer} end - The iteration at which to stop the loop.
 * @param {LoopCallback} loop - The function to execute once for each
 *   value between start and end.
 * @param {Function} then - The function called when execution is
 *   complete.
 * @param {ProcessOptions} options - Options here dictate parameters
 *   such as the maximum number of consecutive loops that will be
 *   executed before relinquishing thread control.
 */
window.processNonBlocking = function(start, end, loop, then, options) {
    if (typeof options == 'undefined') options = {};
    // Limit indicated.
    if (options.limit) {
        // Max number of iterations in a single stretch of
        // execution.
        if (options.max_iterations) {
            var iterations = end - start;
            if (iterations > options.max_iterations) {
                var oldEnd = end;
                end = start + options.max_iterations;
                var nextStart = end;
                var oldThen = then;
                then = function() {
                    setTimeout(function() {
                        processNonBlocking(
                            nextStart,
                            oldEnd,
                            loop,
                            oldThen,
                            options);
                    });
                };
            }
        }
    }
    for (var i = start; i < end; i++) {
        loop(i);
    }
    then();
}

})(window);

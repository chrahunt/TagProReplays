describe("Barrier", function() {
    it("should not proceed before all tasks are completed", function(done) {
        var tasks = 3;
        function errorIfNotComplete() {
            if (tasks !== 0) {
                return new Error();
            }
        }
        // Ensure all read operations are complete before continuing.
        var barrier = new Barrier();
        barrier.onComplete(function() {
            done(errorIfNotComplete());
        });
        [1, 2, 3].forEach(function(i) {
            var id = barrier.start();
            setTimeout(function() {
                tasks--;
                barrier.stop(id);
            });
        });
    });
});

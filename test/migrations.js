/*
 * Test basic migration functionality.
 */
describe("Migrations", function() {
    // Local migration object.
    var migrations;
    // Mock indexedDB.
    var db;

    // Fixtures
    // Functions used to test migrations.
    var migration_functions = {
        // Function to go from version 1 to version 2.
        '1->2': function(db, transaction, callback) {
            db.data = db.data + ':1->2';
            callback();
        },
        // Function expected to fail when going from version 1 to
        // version 2.
        'fail:1->2': function(db, transaction, callback) {
            callback(true);
        },
        // Function to go from version 2 to version 3.
        '2->3': function(db, transaction, callback) {
            db.data = db.data + ':2->3';
            callback();
        },
        // Function throws error if called, should be used with
        // fail:1->2
        'fail:2->3': function(db, transaction, callback) {
            throw new Error("Should not have been called!");
        },
        // Function to go from either version 1 or 2 to version 3.
        '[1,2]->3': function(db, transaction, callback) {
            db.data = db.data + ':[1,2]->3';
            callback();
        }
    };

    // Initial value of 'data' property on mock db object.
    var initial_db_data = {
        '1:1->2': '1',
        '1:1->2->3': '1',
        '2:1->2->3': '2',
        '1:[1,2]->3': '1',
        '2:[1,2]->3': '2'
    };

    // Expected value of 'data' property on mock db object.
    var resulting_db_data = {
        '1:1->2': '1:1->2',
        '1:1->2->3': '1:1->2:2->3',
        '2:1->2->3': '2:2->3',
        '1:[1,2]->3': '1:[1,2]->3',
        '2:[1,2]->3': '2:[1,2]->3'
    };

    beforeEach(function() {
        // Set up migration object.
        migrations = new Migrations();
        db = {};
    });

    it("should accept functions", function() {
        migrations.add(1, 2, migration_functions['1->2']);
    });

    it("should run simple migrations", function(done) {
        migrations.add(1, 2, migration_functions['1->2']);
        db.data = initial_db_data['1:1->2'];
        var ev = createEvent(1, 2);
        var fn = migrations.getPatchFunction(ev);
        fn(db, {}, function(err) {
            expect(db.data).to.equal(resulting_db_data['1:1->2']);
            done(err);
        });

        ev = createEvent(2, 2);
        fn = migrations.getPatchFunction(ev);
        expect(fn).to.be(null);
    });

    it("should fail appropriately", function(done) {
        migrations.add(1, 2, migration_functions['fail:1->2']);
        var ev = createEvent(1, 2);
        var fn = migrations.getPatchFunction(ev);
        fn(db, {}, function(err) {
            expect(err).to.be(true);
            done();
        });
    });

    it("should do multiple migrations", function(done) {
        migrations.add(1, 2, migration_functions['1->2']);
        migrations.add(2, 3, migration_functions['2->3']);
        var ev = createEvent(1, 3);
        var fn = migrations.getPatchFunction(ev);

        db.data = initial_db_data['1:1->2->3'];
        fn(db, {}, function(err) {
            expect(db.data).to.equal(resulting_db_data['1:1->2->3']);
            done();
        });
    });

    it("should do only the appropriate migrations", function(done) {
        migrations.add(1, 2, migration_functions['1->2']);
        migrations.add(2, 3, migration_functions['2->3']);
        var ev = createEvent(2, 3);
        var fn = migrations.getPatchFunction(ev);

        db.data = initial_db_data['2:1->2->3'];
        fn(db, {}, function(err) {
            expect(db.data).to.equal(resulting_db_data['2:1->2->3']);
            done();
        });
    });

    it("should not call further functions after failing", function(done) {
        migrations.add(1, 2, migration_functions['fail:1->2']);
        migrations.add(2, 3, migration_functions['fail:2->3']);
        var ev = createEvent(1, 3);
        var fn = migrations.getPatchFunction(ev);

        fn(db, {}, function(err) {
            expect(err).to.equal(true);
            done();
        });
    });

    it("should handle a single function for multiple migrations", function(done) {
        migrations.add([1, 2], 3, migration_functions['[1,2]->3']);
        var ev = createEvent(1, 3);
        var fn = migrations.getPatchFunction(ev);

        db.data = initial_db_data['1:[1,2]->3'];
        fn(db, {}, function(err) {
            expect(db.data).to.equal(resulting_db_data['1:[1,2]->3']);
        });

        ev = createEvent(2, 3);
        fn = migrations.getPatchFunction(ev);
        db.data = initial_db_data['2:[1,2]->3'];
        fn(db, {}, function(err) {
            expect(db.data).to.equal(resulting_db_data['2:[1,2]->3']);
            done();
        });
    });

    // Helper functions.
    // Given an old version and a new version, create an event object
    // with the same properties as the event passed to onupgradeneeded.
    function createEvent(from, to) {
        return {
            oldVersion: from,
            newVersion: to
        };
    }
});

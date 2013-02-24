"use strict";
var _ = require('underscore');
var test = require('tap').test;
var async = require('async');
var insertModes = require('../util/insertModes.js');
var harness = require('./helpers/harness.js');
var dateHelper = require('../util/dateHelper.js');

test("Connects to the database", function (t) {
	harness.connect(function (err, res) {
		t.end();
	});
});

test('Setup', setup);

test('a bulk insert using hilo works', function (t) {
	var items = generateTestItems(40001);

	harness.db.insert('tmp', items, function (err, result) {
		t.notOk(err, "no errors were thrown on bulk insert");
		t.equal(items.length, result.length, "all inserted items were returned");
		t.end();
	});
});

test('Teardown', tearDown);
test('Setup', setup);

test('an insert using hilo works', function (t) {
	var newItem = { created: new Date(), name: "This is a test" };

	harness.db.insert('tmp', newItem, function (err, result) {
		t.notOk(err, "no errors were thrown on insert, got: " + err);
		t.end();
	});
});

test('Teardown', tearDown);
test('Setup', setup);

test('an insert supplied with a UTC date persists that date without altering it', function (t) {
	var nowUtc = dateHelper.utcNow();
	var newItem = {created: nowUtc, name: "This is a test"};
	var newId = -1;

	async.series([
		function doInsert(seriesCb) {
			harness.db.insert('tmp', newItem, function (err, result) {
				t.notOk(err, "no errors were thrown on insert, got: " + err);
				t.ok(result.insertId, "insertId was passed back after insert");
				newId = result.insertId;
				seriesCb();
			});
		},
		function checkInsert(seriesCb) {
			harness.db.queryOne('SELECT * FROM tmp WHERE id = ?', [newId], function (selectErr, selectResult) {
				t.equal(Date.parse(selectResult.created.toString()), Date.parse(nowUtc.toString()), "utc date was inserted without alterations");
				seriesCb();
			});
		}
	], function (err, res) {
		t.end();
	})
});

test('Teardown', tearDown);
test('Setup', setup);

test('inserts are not written within transactions that have been rolled back', {skip: true}, function (t) {
	var newItem = {created: new Date(), name: "This is a test"};

	async.series([
		function (seriesCb) {
			harness.db.startTransaction(seriesCb);
		},
		function test(seriesCb) {
			harness.db.insert('tmp', newItem, seriesCb);
		},
		function checkInsert(seriesCb) {
			harness.db.query('SELECT * FROM tmp', [], function (err, result1) {
				t.equal(result1.length, 1, "a row was inserted.");
				seriesCb();
			});
		},
		function (seriesCb) {
			harness.db.rollback(seriesCb);
		},
		function checkInsert(seriesCb) {
			harness.db.query('SELECT * FROM tmp', [], function (err, result2) {
				t.equal(result2.length, 0, "no rows were inserted after the transaction was rolled back.");
				seriesCb();
			});
		}
	], function (err, res) {
		t.end();
	});
});

test('Teardown', tearDown);
test('Setup', setup);

test('an insert returns an insertId', function (t) {
	harness.db.insert('tmp', {name: 'test ', created: new Date()}, function (err, result) {
		t.ok(result.insertId, "insertId was passed back after insert");
		t.end();
	});
});

test('Teardown', tearDown);
test('Setup', setup);

test('a bulk insert returns an insertId per inserted item', function (t) {
	var items = generateTestItems(1000);

	var insertIdMissing = false;
	harness.db.insert('tmp', items, function (err, results) {
		_.each(results, function (result) {
			if (!insertIdMissing && !result.insertId)
				insertIdMissing = true;
		});
		t.notOk(insertIdMissing, "an insertId was passed back for each result after insert");
		t.end();
	});
});

test('Teardown', tearDown);

test("Disconnects from the database", function (t) {
	harness.disconnect(function (err, res) {
		t.end();
	});
});

function generateTestItems(amt) {
	var items = [];
	for (var i = 0; i < amt; i++)
		items[i] = {id: i, name: 'test ' + i, created: dateHelper.utcNow()};
	return items;
}

function setup(t, createTableOptions) {
	createTableOptions = createTableOptions || {tempTable: true};
	t.test("Drops test table", function (t) {
		harness.dropTable(function (err, res) {
			t.end();
		});
	});
	t.test("Creates test table", function (t) {
		harness.createTable(createTableOptions, function (err, res) {
			t.end();
		});
	});
	t.end();
}

function tearDown(t) {
	t.test("Drops test table", function (t) {
		harness.dropTable(function (err, res) {
			t.end();
		});
	});
	t.end();
}

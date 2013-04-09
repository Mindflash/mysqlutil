"use strict";
var _ = require('lodash');
var test = require('tap').test;
var harness = require('./helpers/harness.js');

test("Connects to the database", harness.connect);
test("Setup test table", harness.createTestTempTable);

test("query() supplied SQL with logically impossible WHERE clause returns []", function (t) {
	harness.db.query('SELECT 1 FROM tmp WHERE 1 != 1', function (err, result) {
		t.ok(_.isArray(result) && _.isEmpty(result), "Result be an empty array");
		t.end();
	});
});

test("query() with empty result returns []", function (t) {
	harness.db.query('SELECT * FROM tmp', function (err, result) {
		t.ok(_.isArray(result) && _.isEmpty(result), "Result be an empty array");
		t.end();
	});
});

test("query() with invalid sql returns [] result", function (t) {
	harness.db.query('SELECT 1 FROM~ tmp', function (err, result) {
		t.ok(_.isArray(result) && _.isEmpty(result), "Result be an empty array");
		t.end();
	});
});

test("queryOne() supplied SQL with logically impossible WHERE clause returns null", function (t) {
	harness.db.queryOne('SELECT 1 FROM tmp WHERE 1 != 1', function (err, result) {
		t.equal(result, null, "Result should be null");
		t.end();
	});
});

test("queryOne() with empty result returns null", function (t) {
	harness.db.queryOne('SELECT * FROM tmp', function (err, result) {
		t.equal(result, null, "Result should be null");
		t.end();
	});
});

test("queryOne() with invalid sql returns null result", function (t) {
	harness.db.queryOne('SELECT 1 FROM~ tmp', function (err, result) {
		t.equal(result, null, "Result should be null");
		t.end();
	});
});

test("Drops test table", harness.dropTestTable);
test("Disconnects from the database", harness.disconnect);

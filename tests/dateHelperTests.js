"use strict";
var _ = require('lodash');
var test = require('tap').test;
var harness = require('./helpers/harness.js');
var dateHelper = require('../lib/dateHelper.js');

test("Connects to the database", harness.connect);
test("Drops Hilo table and proc", harness.dropHiLoTableAndProc);
test("Creates Hilo table and proc", harness.createHiLoTableAndProc);
test("Setup test table", harness.createTestTempTable);

test("Can select items by dateHelper-generated date", function (t) {
	var amt = 5;
	var items = harness.generateTestItems(amt);
	var now = dateHelper.utcNow();

	items = _.map(items, function(item) {
		item.created = now;
		return item;
	});

	harness.db.insert('tmp', items, function (err, result) {
		t.notOk(err, "no errors were thrown on insert, received: " + err);

		harness.db.query('SELECT * FROM tmp WHERE created = ?', [now], function (err, result) {
			t.equal(result.length, amt, "Should return ("+amt+") items");
			t.end();
		});
	});
});

test("Drops test table", harness.dropTestTable);
test("Drops Hilo table and proc", harness.dropHiLoTableAndProc);
test("Disconnects from the database", harness.disconnect);

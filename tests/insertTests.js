"use strict";
var _ = require('underscore');
var test = require('tap').test;
var async = require('async');
var insertModes = require('../lib/insertModes.js');
var harness = require('./helpers/harness.js');
var dateHelper = require('../lib/dateHelper.js');

test("Connects to the database", harness.connect);
test("Setup", harness.setupTmpTable);

test("an insert using hilo works", function (t) {
	var items = harness.generateTestItems(5);

	harness.db.insert('tmp', items, function (err, result) {
		t.notOk(err, "no errors were thrown on insert, received: " + err);
		t.equal(items.length, result.length, "all inserted items were returned");
		t.end();
	});
});

test("Teardown", harness.tearDown);
test("Setup", harness.setupTmpTable);

test("inserts are not written within transactions that have been rolled back", {skip: true}, function (t) {
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

test("Teardown", harness.tearDown);
test("Setup", harness.setupTmpTable);

test("an insert returns an insertId per inserted item", function (t) {
	var items = harness.generateTestItems(5);

	var insertIdMissing = false;
	harness.db.insert('tmp', items, function (err, results) {
		t.notOk(err, "no errors were thrown on insert, received: " + err);
		
		_.each(results, function (result) {
			if (!insertIdMissing && !result.insertId)
				insertIdMissing = true;
		});
		t.notOk(insertIdMissing, "an insertId was passed back for each result after insert");
		t.end();
	});
});

test("Teardown", harness.tearDown);
test("Setup", harness.setupTmpTable);

test("insert-ignore doesn't error on duplicate row inserts", function (t) {
	var items = harness.generateTestItems(5);

	async.series([
		function(cb) {
			harness.db.insert('tmp', items, cb, {insertMode: insertModes.custom});
		},
		function(cb) {
			harness.db.insert('tmp', items, cb, {insertMode: insertModes.custom, ignore: true});
		}
	], function(err) {
		t.notOk(err, "no errors were thrown on insert-ignore, received: " + err);
		harness.getItemsInTmpTable(function(err,res) {
			t.equal(res.length, items.length, "no additional rows were inserted.");
			t.end();
		});
	});
});

test("Teardown", harness.tearDown);
test("Setup", harness.setupTmpTable);

test("upsert modifies values on key present", function (t) {
	var items = harness.generateTestItems(5);
	var namePostfix = 'test';

	async.series([
		function(cb) {
			harness.db.insert('tmp', items, cb, {insertMode: insertModes.custom});
		},
		function(cb) {
			var items2 = _.map(items, function(item) {
				item.name += namePostfix;
				return item;
			});
			harness.db.insert('tmp', items, cb, {insertMode: insertModes.custom, upsert: true});
		}
	], function(err) {
		t.notOk(err, "no errors were thrown on insert-ignore, received: " + err);
		harness.getItemsInTmpTable(function(err,res) {
			t.equal(res.length, items.length, "no additional rows were inserted.");

			var unchangedRecord = _.find(res, function(rec){
				return !~rec.name.indexOf(namePostfix);
			});
			t.notOk(unchangedRecord, "All records were updated");
			t.end();
		});
	});
});

test("upsert inserts values if key not present", function (t) {
	var items = harness.generateTestItems(5);

	harness.db.insert('tmp', items, function (err, results) {
		t.notOk(err, "no errors were thrown on upsert, received: " + err);

		harness.getItemsInTmpTable(function(err,res) {
			t.equal(res.length, items.length, "All rows were inserted.");
			t.end();
		});
	}, {insertMode: insertModes.custom, upsert: true});
});

test("Disconnects from the database", harness.disconnect);

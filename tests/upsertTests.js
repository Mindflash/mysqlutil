"use strict";
var _ = require('underscore');
var test = require('tap').test;
var async = require('async');
var insertModes = require('../util/insertModes.js');
var harness = require('./helpers/harness.js');
var dateHelper = require('../util/dateHelper.js');

test("Connects to the database", harness.connect);

test('a simple upsert works', function (t) {
	var item = harness.generateTestItems(1)[0];

	t.test('Setup', harness.setupTmpTable);

	t.test('Creates test item', function (t) {
		harness.db.insert('tmp', item, function (err, result) {
			t.notOk(err, "no errors were thrown on insert, received: " + err);
			t.end();
		}, {insertMode: insertModes.custom});
	});

	t.test('Upsert test item', function (t) {
		item = _.extend(item, {
			name: 'Test Name Updated'
		});
		delete item.insertId;

		harness.db.upsert('tmp', item, function (err, result) {
			t.notOk(err, "no errors were thrown on upsert, received: " + err);

			harness.db.query("SELECT name FROM tmp WHERE id = ?", [item.id], function (err, res) {
				t.equal(item.name, res[0].name, "upsert updated test item's name");
				t.end();
			});
		}, {
			insertMode: insertModes.custom
		});
	});

	t.test('Teardown', harness.tearDown);
});

test('a multiple upsert works', function (t) {
	var items = harness.generateTestItems(5);

	t.test('Setup', harness.setupTmpTable);

	t.test('Creates test item', function (t) {
		harness.db.insert('tmp', items, function (err, result) {
			t.notOk(err, "no errors were thrown on insert, received: " + err);
			t.end();
		}, {insertMode: insertModes.custom});
	});

	t.test('Upsert test item', function (t) {
		var newName = 'Test Name Updated';
		items = _.map(items, function (item) {
			delete item.insertId;
			item.name = newName;
			return item;
		});
		harness.db.insert('tmp', items, function (err, result) {
			t.notOk(err, "no errors were thrown on upsert, received: " + err);

			harness.db.upsert("SELECT name FROM tmp", [], function (err, res) {
				_.each(res, function (newItem) {
					t.equal(newItem.name, newName, "upsert updated test item's name");
				});
				t.end();
			});
		}, {
			insertMode: insertModes.custom
		});
	});

	t.test('Teardown', harness.tearDown);
});

test("Disconnects from the database", harness.disconnect);


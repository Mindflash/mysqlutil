"use strict";
var _ = require('underscore');
var test = require('tap').test;
var async = require('async');
var insertModes = require('../util/insertModes.js');
var harness = require('./helpers/harness.js');
var dateHelper = require('../util/dateHelper.js');

test("Connects to the database", harness.connect);

test('a simple update works', function (t) {
	var item = harness.generateTestItems(1)[0];

	t.test('Setup', harness.setupTmpTable);

	t.test('Creates test item', function(t) {
		harness.db.insert('tmp', item, function (err, result) {
			t.notOk(err, "no errors were thrown on insert");
			t.end();
		}, {insertMode:insertModes.custom});
	});

	t.test('Updates test item', function(t) {
		item = _.extend(item, {
			name: 'Test Name Updated',
			$key: 'id'
		});
		delete item.insertId;

		harness.db.update('tmp', item, function (err, res) {
			t.notOk(err, "no errors were thrown on update");
			t.end();
		}, {enforceRules: false});
	});

	t.test('Teardown', harness.tearDown);
});

test("Disconnects from the database", harness.disconnect);

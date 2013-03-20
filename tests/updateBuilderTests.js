"use strict";
var test = require('tap').test;
var _ = require('underscore');
var dateHelper = require('../lib/dateHelper.js');
var updateBuilder = require('../lib/updateBuilder.js');

test('Constructs a simple update using $where', function (t) {
	var item = { name: 'Test', color: 'Blue', $where: 'id = 1' };
	var expectedSQL = 'UPDATE test SET name = ?, color = ? WHERE id = 1;';
	var expectedValues = _.values(item).slice(0, 2);

	updateBuilder({
		item: item,
		tableName: 'test'
	}, function (err, res) {
		t.notOk(err, "Does not return an error, received: " + err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple update using $key', function (t) {
	var item = { name: 'Test', color: 'Blue', $key: 1 };
	var expectedSQL = 'UPDATE test SET name = ?, color = ? WHERE id = ?;';
	var expectedValues = _.values(item);

	updateBuilder({
		item: item,
		tableName: 'test',
		defaultKeyName: 'id'
	}, function (err, res) {
		t.notOk(err, "Does not return an error, received: " + err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple update using $where with rules', function (t) {
	var now = dateHelper.utcNow();
	var item = { name: 'Test', color: 'Blue', $where: 'id = 1' };
	var expectedValues = _.values(item).slice(0, 2).concat(now);
	var expectedSQL = 'UPDATE test SET name = ?, color = ?, modified = ? WHERE id = 1;';

	var rules = [function (_item, tableName) {
		if (!_item.modified)
			_item.modified = now;
	}];

	updateBuilder({
		item: item,
		tableName: 'test',
		rules: rules
	}, function (err, res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple update using $key with rules', function (t) {
	var now = dateHelper.utcNow();
	var item = { name: 'Test', color: 'Blue', $key: 1 };
	var expectedSQL = 'UPDATE test SET name = ?, color = ?, modified = ? WHERE id = ?;';
	var expectedValues = _.values(item).slice(0,2).concat(now, 1);

	var rules = [function (_item, tableName) {
		if (!_item.modified)
			_item.modified = now;
	}];

	updateBuilder({
		item: item,
		tableName: 'test',
		defaultKeyName: 'id',
		rules: rules
	}, function (err, res) {
		t.notOk(err, "Does not return an error, received: " + err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

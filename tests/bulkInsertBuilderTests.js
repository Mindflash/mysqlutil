"use strict";
var test = require('tap').test;
var _ = require('underscore');
var dateHelper = require('../lib/dateHelper.js');
var bulkInsertBuilder = require('../lib/bulkInsertBuilder.js');


test('Constructs a simple bulk insert', function (t) {
	var items = [
		{ id: 1, name: 'Test 1', color: 'Blue' },
		{ id: 2, name: 'Test 2', color: 'Red' }
	];
	var expectedValues = [_.chain(items.concat()).map(function(item) {
		return _.values(item);
	}).value()];
	var expectedSQL = 'INSERT INTO test (id, name, color) VALUES ?';

	bulkInsertBuilder({
		items: items,
		tableName: 'test'
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple bulk upsert', function (t) {
	var items = [
		{ id: 1, name: 'Test 1', color: 'Blue' },
		{ id: 2, name: 'Test 2', color: 'Red' }
	];
	var expectedValues = [_.chain(items.concat()).map(function(item) {
		return _.values(item);
	}).value()];
	var expectedSQL = 'INSERT INTO test (id, name, color) VALUES ? ON DUPLICATE KEY UPDATE id = VALUES(id), '+
		'name = VALUES(name), color = VALUES(color)';

	bulkInsertBuilder({
		items: items,
		tableName: 'test',
		upsert:true
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple bulk insert ignore', function (t) {
	var items = [
		{ id: 1, name: 'Test 1', color: 'Blue' },
		{ id: 2, name: 'Test 2', color: 'Red' }
	];
	var expectedValues = [_.chain(items.concat()).map(function(item) {
		return _.values(item);
	}).value()];
	var expectedSQL = 'INSERT IGNORE INTO test (id, name, color) VALUES ?';

	bulkInsertBuilder({
		items: items,
		ignore: true,
		tableName: 'test'
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple bulk insert with rules', function (t) {
	var now = dateHelper.utcNow();
	var items = [
		{ id: 1, name: 'Test 1', color: 'Blue' },
		{ id: 2, name: 'Test 2', color: 'Red' }
	];

	var expectedValues = [_.chain(items.concat()).map(function(item) {
		var values = _.values(item);
		values.push(now);
		return values;
	}).value()];
	var expectedSQL = 'INSERT INTO test (id, name, color, modified) VALUES ?';

	var insertRules = [function(_items, tableName) {
		_items = _.map(_items, function(item) {
			item.modified = now;
			return item;
		});
	}];

	bulkInsertBuilder({
		items: items,
		tableName: 'test',
		insertRules: insertRules
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple bulk upsert with rules', function (t) {
	var now = dateHelper.utcNow();
	var items = [
		{ id: 1, name: 'Test 1', color: 'Blue' },
		{ id: 2, name: 'Test 2', color: 'Red' }
	];

	var expectedValues = [_.chain(items.concat()).map(function(item) {
		var values = _.values(item);
		values.push(now);
		values.push("fun")
		return values;
	}).value()];
	var expectedSQL = 'INSERT INTO test (id, name, color, modified, fun) VALUES ? ON DUPLICATE KEY UPDATE id = VALUES(id), '+
		'name = VALUES(name), color = VALUES(color), modified = VALUES(modified), fun = VALUES(fun)';

	var insertRules = [function(_items, tableName) {
		_items = _.map(_items, function(item) {
			if(!item.modified)
				item.modified = now;
			return item;
		});
	}];
	var updateRules = [function(_items, tableName) {
		_items = _.map(_items, function(item) {
			if(!item.fun)
				item.fun = "fun";
			return item;
		});
	}];

	bulkInsertBuilder({
		items: items,
		tableName: 'test',
		upsert: true,
		insertRules: insertRules,
		updateRules: updateRules
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

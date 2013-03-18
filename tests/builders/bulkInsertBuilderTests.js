"use strict";
var test = require('tap').test;
var _ = require('underscore');
var dateHelper = require('../../util/dateHelper.js');
var bulkInsertBuilder = require('../../sqlBuilders/bulkInsertBuilder.js');

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
		tableName: 'test',
		defaultKeyName: 'id'
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

	var rules = [function(_items, fields, values, expressions, tableName) {
		fields.push('modified');
		_items = _.map(_items, function(item) {
			item.modified = now;
			return item;
		});
	}];

	bulkInsertBuilder({
		items: items,
		tableName: 'test',
		defaultKeyName: 'id',
		rules: rules
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

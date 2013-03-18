"use strict";
var test = require('tap').test;
var _ = require('underscore');
var dateHelper = require('../../util/dateHelper.js');
var insertBuilder = require('../../sqlBuilders/insertBuilder.js');

test('Constructs a simple insert', function (t) {
	var item = { id: 1, name: 'Test', color: 'Blue' };
	var expectedValues = _.values(item);
	var expectedSQL = 'INSERT INTO test (id, name, color) VALUES (?, ?, ?)';

	insertBuilder({
		item: item,
		tableName: 'test',
		defaultKeyName: 'id'
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

test('Constructs a simple insert with rules', function (t) {
	var now = dateHelper.utcNow();
	var item = { id: 1, name: 'Test', color: 'Blue' };
	var expectedValues = _.values(item).concat(now);
	var expectedSQL = 'INSERT INTO test (id, name, color, modified) VALUES (?, ?, ?, '+now+')';

	var rules = [function(_item, fields, values, expressions, tableName) {
		fields.push('modified');
		if(expressions)
			expressions.push(now);
		if(values)
			values.push(now);
	}];

	insertBuilder({
		item: item,
		tableName: 'test',
		rules: rules,
		defaultKeyName: 'id'
	}, function(err,res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});

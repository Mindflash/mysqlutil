"use strict";
var test = require('tap').test;
var _ = require('underscore');
var dateHelper = require('../../util/dateHelper.js');
var updateBuilder = require('../../sqlBuilders/updateBuilder.js');

test('Constructs a simple update using $where', function (t) {
	var item = { name: 'Test', color: 'Blue', $where: 'id = 1' };
	var expectedSQL = 'UPDATE test SET name = ?, color = ? WHERE id = 1;';
	var expectedValues = _.values(item).slice(0, 2);

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

// TODO
test('Constructs a simple update using $key', {skip:true}, function (t) {
	//
});

test('Constructs a simple update using $where with rules', function (t) {
	var now = dateHelper.utcNow();
	var item = { name: 'Test', color: 'Blue', $where: 'id = 1' };
	var expectedValues = _.values(item).slice(0, 2).concat(now);
	var expectedSQL = 'UPDATE test SET name = ?, color = ?, modified = ' + now + ' WHERE id = 1;';

	var rules = [function (_item, fields, values, expressions, tableName) {
		fields.push('modified');
		if (expressions)
			expressions.push(now);
		if (values)
			values.push(now);
	}];

	updateBuilder({
		item: item,
		tableName: 'test',
		rules: rules,
		defaultKeyName: 'id'
	}, function (err, res) {
		t.notOk(err, "Does not return an error, received: "+err);
		t.equal(res.sql, expectedSQL, "Returns the expected SQL");
		t.deepEqual(res.values, expectedValues, "Return the expected values");
		t.end();
	});
});


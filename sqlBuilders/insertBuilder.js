"use strict";
var _ = require('underscore');

module.exports = function(params, cb) {
	var sql = [];
	if (params.replace) {
		sql.push('REPLACE');
	} else {
		sql.push('INSERT', (params.ignore ? 'IGNORE' : ''));
	}
	sql.push(' INTO ', params.tableName, ' (');

	var fields = [];
	var values = [];
	var expressions = [];

	_.each(params.item, function (value, field) {
		if (field.charAt(0) !== '$') {
			fields.push(field);
			expressions.push('?');
			values.push(value);
		}
	});

	if (params.rules) {
		_.each(params.rules, function (rule) {
			rule(params.item, fields, values, expressions, params.tableName);
		});
	}

	sql.push(fields.join(', '), ') VALUES (', expressions.join(', '), ')');

	cb(null, {
		sql: sql.join(''),
		values: values
	});
};

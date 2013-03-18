"use strict";
var _ = require('underscore');

module.exports = function (params, cb) {
	var sql = [];
	if (params.replace) {
		sql.push('REPLACE');
	} else {
		sql.push('INSERT', (params.ignore ? 'IGNORE' : ''));
	}
	sql.push(' INTO ', params.tableName, ' ');

	// use the 1st item to get our fields
	var fields = _.filter(_.keys(params.items[0]), function (key) {
		return key.charAt(0) !== '$';
	});

	if (params.rules) {
		_.each(params.rules, function (rule) {
			rule(params.items, fields, null, null, params.tableName);
		});
	}

	sql.push('(', fields.join(', '), ') VALUES ?');

	var rows = []; // values needs to be a 2-d array for bulk INSERT
	_.each(params.items, function (item) {
		rows.push(
			_.map(fields, function (field) {
				return item[field];
			})
		);
	});

	cb(null, {
		sql: sql.join(''),
		values: [rows]
	});
};

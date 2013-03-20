"use strict";
var _ = require('underscore');

module.exports = function (params, cb) {

	if (params.insertRules) {
		_.each(params.insertRules, function (rule) {
			rule(params.items, params.tableName);
		});
	}

	if (params.upsert) {
		if (params.updateRules) {
			_.each(params.updateRules, function (rule) {
				rule(params.items, params.tableName);
			});
		}
	}

	var sql = ['INSERT'];

	if (params.ignore)
		sql.push(' IGNORE');

	sql.push(' INTO ', params.tableName, ' ');

	// use the 1st item to get our fields, dollar-sign prefixed $fields are ignroed
	var fields = _.filter(_.keys(params.items[0]), function (key) {
		return key.charAt(0) !== '$';
	});

	sql.push('(', fields.join(', '), ') VALUES ? ');

	if (params.upsert)
		sql.push('ON DUPLICATE KEY UPDATE ');

	var rows = []; // values needs to be a 2-d array for bulk INSERT
	_.each(params.items, function (item) {
		rows.push(
			_.map(fields, function (field) {
				return item[field];
			})
		);
	});

	if (params.upsert) {
		// col = VALUES(col)
		for (var i = fields.length; i--;)
			fields[i] += ' = VALUES(' + fields[i] + ')';

		sql.push(fields.join(', '));
	}

	cb(null, {
		sql: sql.join('').trim(),
		values: [rows]
	});
};

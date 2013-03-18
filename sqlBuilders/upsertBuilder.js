"use strict";
var _ = require('underscore');

module.exports = function(params, cb) {
	var sql = ['INSERT INTO ', params.tableName, ' ('];

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

	if (params.insertRules) {
		_.each(params.insertRules, function (rule) {
			rule(params.item, fields, values, expressions, params.tableName);
		});
	}

	sql.push(fields.join(','), ') VALUES (', expressions.join(','), ') ON DUPLICATE KEY UPDATE ');

	if (params.updateRules) {
		_.each(params.updateRules, function (rule) {
			rule(params.item, fields, values, expressions, params.tableName);
		});
	}

	for (var i = fields.length; i--;)
		fields[i] += '=' + expressions[i];

	sql.push(fields.join(','));

	cb(null, {
		sql: sql.join(''),
		values: values.concat(values)
	});
};

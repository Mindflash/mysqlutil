"use strict";
var _ = require('underscore');

module.exports = function (params, cb) {
	if (!params.item.$where && !params.item.$key)
		return cb(new Error('Either $key or $where should be passed'));

	var sql = [];
	var fields = [];
	var values = [];
	var expressions = [];

	sql.push('UPDATE ', params.tableName, ' SET ');

	// col = value clause
	_.each(params.item, function (value, field) {
		if (field.charAt(0) === '$') return;
		fields.push(field);
		expressions.push('?');
		values.push(value);
	});

	if (params.rules) {
		_.each(params.rules, function (rule) {
			rule(params.item, fields, values, expressions, params.tableName);
		});
	}

	for (var i = fields.length; i--;)
		fields[i] += ' = ' + expressions[i];

	sql.push(fields.join(', '));

	// WHERE clause
	if (!params.item.$where) {
		params.item.$where = params.defaultKeyName + '=?';
		values.push(params.item.$key);
	} else if (_.isArray(params.item.$where)) {
		values = values.concat(_.rest(params.item.$where));
		params.item.$where = params.item.$where[0];
	}

	sql.push(' WHERE ', params.item.$where, ';');

	cb(null, {
		sql: sql.join(''),
		values: values
	});
};

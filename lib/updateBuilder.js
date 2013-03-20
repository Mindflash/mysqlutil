"use strict";
var _ = require('underscore');

module.exports = function (params, cb) {
	if (!params.item.$where && !params.item.$key)
		return cb(new Error('Either $key or $where should be passed'));
	if(params.item.$key && !params.defaultKeyName)
		return cb(new Error('defaultKeyName when $key is provided'));

	if (params.rules) {
		_.each(params.rules, function (rule) {
			rule(params.item, params.tableName);
		});
	}

	var sql = ['UPDATE ', params.tableName, ' SET '];
	var fields = [];
	var values = [];
	var expressions = [];

	// col = value clause
	_.each(params.item, function (value, field) {
		if (field.charAt(0) === '$') return;
		fields.push(field);
		expressions.push('?');
		values.push(value);
	});

	for (var i = fields.length; i--;)
		fields[i] += ' = ' + expressions[i];

	sql.push(fields.join(', '));

	// WHERE clause
	if (!params.item.$where) {
		params.item.$where = params.defaultKeyName + ' = ?';
		values.push(params.item.$key);
	} else if (_.isArray(params.item.$where)) {
		values = values.concat(_.rest(params.item.$where));
		params.item.$where = params.item.$where[0];
	}

	sql.push(' WHERE ', params.item.$where, ';');

	cb(null, {
		sql: sql.join('').trim(),
		values: values
	});
};

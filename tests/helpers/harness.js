"use strict";
var mysqlUtil = require('../../');
var dateHelper = require('../../lib/dateHelper.js');
exports.db = null;

exports.createTable = function(options, cb) {
	var sql = [
		'CREATE'+(options.tmpTable ? ' TEMPORARY ' : ' ')+'TABLE IF NOT EXISTS tmp (',
		'id BIGINT(20) NOT NULL,',
		'created datetime NOT NULL,',
		'name varchar(150) COLLATE utf8_unicode_ci NOT NULL,',
		'PRIMARY KEY (id)',
		') ENGINE=InnoDB DEFAULT CHARSET=utf8'
	].join('\n');
	exports.db.query(sql, cb);
}

exports.connect = function(t) {
	mysqlUtil.setup({
		host: process.env.MYSQL_HOST || 'vm',
		user: process.env.MYSQL_USER || 'root',
		password: process.env.MYSQL_PASSWORD || '',
		database: process.env.MYSQL_DATABASE || 'mysqlutil_test'
	}, function (err, session) {
		exports.db = session;
		//exports.db.logging = true;
		t.end();
	});
};

exports.dropTable = function(cb) {
	exports.db.query('DROP TABLE IF EXISTS tmp;', cb);
};

exports.getItemsInTmpTable = function(cb) {
	exports.db.query('SELECT * FROM tmp', [], cb);
};

exports.disconnect = function(t) {
	exports.db.disconnect(function(err,res) {
		t.end();
	});
};

exports.generateTestItems = function(amt) {
	var items = [];
	for (var i = 0; i < amt; i++)
		items[i] = {id: i, name: 'test ' + i, created: dateHelper.utcNow()};
	return items;
}

exports.setupTmpTable = function(t) {
	t.test("Drops test table", function (t) {
		exports.dropTable(function (err, res) {
			t.end();
		});
	});
	t.test("Creates test table", function (t) {
		exports.createTable({tempTable: true}, function (err, res) {
			t.end();
		});
	});
	t.end();
}

exports.tearDown = function(t) {
	t.test("Drops test table", function (t) {
		exports.dropTable(function (err, res) {
			t.end();
		});
	});
	t.end();
}

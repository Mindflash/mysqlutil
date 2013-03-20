var _ = require('underscore');
var mysql = require('mysql');
var session = require('./lib/session');

exports.setup = function (settings, cb) {
	console.log("mysqlutil setup");

	settings = _.defaults(settings, {host:'localhost', port:3306, user:'root', multipleStatements:true, waitForConnections:true});
	exports.session = session(settings);

	cb(null, exports.session);
};
exports.insertModes = require('./lib/insertModes.js');
exports.utils = require('./lib/dateHelper.js');
exports.session = {};

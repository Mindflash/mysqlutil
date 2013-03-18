var _ = require('underscore');
var mysql = require('mysql');
var session = require('./session');

exports.setup = function (settings, cb) {
	console.log("mysqlutil setup");

	settings = _.defaults(settings, {host:'localhost', port:3306, user:'root', multipleStatements:true, waitForConnections:true});
	exports.session = session(settings);

	cb(null, exports.session);
};
exports.insertModes = require('./util/insertModes.js');
exports.utils = require('./util/dateHelper.js');
exports.session = {};

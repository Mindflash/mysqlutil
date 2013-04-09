var dateFormat = require('dateformat');

exports.utcNow = function() {
	var now = new Date();
	return dateFormat(now, "yyyy-mm-dd HH:MM:ss", true);
};

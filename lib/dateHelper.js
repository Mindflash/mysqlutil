exports.utcNow = function() {
	var now = new Date();
	return now.getUTCFullYear() + '-' + (now.getUTCMonth() + 1) + '-' + now.getUTCDate() + ' ' + now.getUTCHours() + ':' +
		now.getUTCMinutes() + ':' + now.getUTCSeconds();
};

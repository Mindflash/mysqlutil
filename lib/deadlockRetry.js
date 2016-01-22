var util = require('util');

module.exports = function (params, cb) {
	var fn = params.fn;
	var args = params.args;
	var retryAmount = params.retryAmount || 2;

	if (!fn || !cb)
		return cb(new Error('Expected params not passed, param fn and a callback are required.'));

	if (!args || !util.isArray(args))
		args = [];

	var fx = function () {
		// assumes that the last argument to params.fn is a callback
		args.push(function retryCb(err, res) {
			if (!err) return cb(err, res);

			if (err.code && err.code === 'ER_LOCK_DEADLOCK' && --retryAmount > 0) {
				console.log(err.code + ' returned, retrying, (' + retryAmount + ') tries remaining: ' + util.inspect(args, {depth:2}));
				return setTimeout(fx, 10);
			}

			return cb(err, res);
		});
		fn.apply(fn, args);
	};

	fx();
};

var _ = require('underscore');
var async = require('async');
var util = require('util');
var fs = require('fs');
var insertModes = require('./insertModes.js');

var concurrencyLimit = 10;

module.exports = function (conn) {
	var transactions = require('./transactions.js')(conn);

	function log() {
		if (!obj.logging)
			return;
		fs.writeSync(1, util.inspect(arguments) + '\n');
	}

	function error() {
		fs.writeSync(2, util.inspect(arguments) + '\n');
	}

	function query(sql, queryParams, queryCb) {
		log(sql, queryParams);
		conn.query(sql, queryParams, function (err, result) {
			if (err) {
				err.result = result;
				err.sql = sql;
				err.queryParams = queryParams;
			}

			if (result && !util.isArray(result) && result.columnLength === 0)
				result = [];

			log(err, result);
			queryCb(err, result);
		});
	}

	var hiloRef = hilo();

	function bulkInsert(tableName, items, insertCb, options) {
		async.forEach(items,
			function (item, forEachCb) {
				hiloRef.computeNextKey(obj, function hiloCb(nextKey) {
					item.$insertId = item[hiloRef.keyName] = nextKey;
					forEachCb();
				});
			},
			function insertItems(err) {
				if (err) return insertCb(err);
				var sql = [];
				sql.push('INSERT ', (options.ignore ? 'IGNORE ' : ' '), 'INTO ', tableName, ' ');

				// use the 1st item to get our fields
				var fields = _.filter(_.keys(items[0]), function (key) {
					return key.charAt(0) !== '$';
				});

				sql.push('(', fields.join(','), ') VALUES ? ');

				var rows = []; // values needs to be a 2-d array for bulk INSERT
				_.each(items, function (item) {
					// TODO
//				if (options.enforceRules) {
//					_.each(obj.insertRules, function (rule) {
//						rule(item, fields, _.values(item), expressions, tableName); // created, modified set to now etc
//					});
//				}
					rows.push(
						_.map(fields, function (field) {
							return item[field];
						})
					);
				});

				query(sql.join(''), rows, function queryCb(err, result) {
//				if (result) //Return the new id in a consistent way no matter the insertMode
//					result.insertId = item.$insertId || result.insertId;
					insertCb(err, result);
				});
			}
		);
	}

	function insert(tableName, items, insertCb, options) {
		items = _.isArray(items) ? items : [items];
		options = _.defaults(options || {}, {
			insertMode: obj.defaultInsertMode,
			enforceRules: true,
			ignore: false
		});

//		if (items.length > 1)
//			return bulkInsert(tableName, items, insertCb, options);

		var stack = [];
		async.forEachLimit(items, concurrencyLimit,
			function (item, forEachCb) {
				if (options.insertMode === insertModes.hilo) {
					hiloRef.computeNextKey(obj, function hiloCb(nextKey) {
						item.$insertId = item[hiloRef.keyName] = nextKey;
						insertItem(function insertItemCb(err, result) {
							if (err) return insertCb(err);
							stack.push(result);
							forEachCb();
						}, item, options);
					});
				} else {
					insertItem(function insertItemCb(err, result) {
						if (err) return insertCb(err);
						stack.push(result);
						forEachCb();
					}, item, options);
				}
			},
			function foreachFinalCb(err) {
				insertCb(err, stack.length > 1 ? stack : stack[0]);
			}
		);

		function insertItem(insertItemCb, item, options) {
			var sql = [];
			sql.push('INSERT ', (options.ignore ? 'IGNORE ' : ' '), 'INTO ', tableName, ' (');

			var fields = [];
			var values = [];
			var expressions = [];

			_.each(item, function (value, field) {
				if (field.charAt(0) !== '$') {
					fields.push(field);
					expressions.push('?');
					values.push(value);
				}
			});

			if (options.enforceRules) {
				_.each(obj.insertRules, function (rule) {
					rule(item, fields, values, expressions, tableName);
				});
			}

			sql.push(fields.join(','), ') VALUES (', expressions.join(','), ');');
			sql = sql.join('');

			query(sql, values, function queryCb(err, result) {
				if (result) //Return the new id in a consistent way no matter the insertMode
					result.insertId = item.$insertId || result.insertId;
				insertItemCb(err, result);
			});
		}
	}

	function update(tableName, items, updateCb, options) {
		items = _.isArray(items) ? items : [items];
		options = _.defaults(options || {}, {
			enforceRules: true
		});

		var stack = [];

		async.forEachLimit(items, concurrencyLimit,
			function (item, forEachCb) {
				if (!item.$key && !item.$where)
					return updateCb(new Error("either $key or $where is required on each item"));

				var sql = [];
				sql.push('UPDATE ', tableName, ' SET ');
				var fields = [];
				var values = [];
				var expressions = [];

				_.each(item, function (value, field) {
					if (field.charAt(0) !== '$') {
						fields.push(field);
						expressions.push('?');
						values.push(value);
					}
				});

				if (options.enforceRules) {
					_.each(obj.updateRules, function (rule) {
						rule(item, fields, values, expressions, tableName);
					});
				}

				for (var i = fields.length; i--;)
					fields[i] += '=' + expressions[i];

				if (!item.$where) {
					item.$where = obj.defaultKeyName + '=?';
					values.push(item.$key);
				} else if (_.isArray(item.$where)) {
					values = values.concat(_.rest(item.$where));
					item.$where = item.$where[0];
				}

				sql.push(fields.join(','), ' WHERE ', item.$where, ';');

				sql = sql.join('');
				query(sql, values, function queryCb(err, result) {
					if (err) updateCb(err);
					stack.push(result);
					forEachCb();
				});
			},
			function finalForeachCb(err) {
				if (err) updateCb(err);
				updateCb(err, stack.length > 1 ? stack : stack[0]);
			}
		);
	}

	function upsert(tableName, items, upsertCb, options) {
		update(tableName, items, function updateCb(err, updateResults) {
			if (err) return upsertCb(err);
			updateResults = _.isArray(updateResults) ? updateResults : [updateResults];
			// throw an index onto each updateResult so we can trace it back to its item
			var tmp = [];
			_.each(updateResults, function (updateResult, index, list) {
				updateResult.$index = index;
				tmp[index] = updateResult;
			});
			updateResults = tmp;
			var stack = [];

			async.forEach(updateResults,
				function (updateResult, forEachCb) {
					if (updateResult.affectedRows === 0) {
						insert(tableName, items[updateResult.$index], function insertCb(err, result) {
							if (err) return upsertCb(err);
							stack.push(updateResult);
							forEachCb();
						}, options);
					}
					else {
						stack.push(updateResult);
						forEachCb();
					}
				},
				function forEachCompleteCb(err) {
					if (err) return upsertCb(err);
					upsertCb(null, stack.length > 1 ? stack : stack[0]);
				}
			);
		}, options);
	}

	function disconnect(cb) {
		conn.end(function (err) {
			if (cb) cb(err);
		});
	}

	function hilo() {
		var nextID = 0;
		var lastBatchID = -1;
		var deferredCallbacks = [];
		var queryPending = false;
		var batchSize = 10100;

		return {
			keyName: 'id',
			type: 'hilo',
			computedKey: true,
			computeNextKey: function computeNextKey(mysql, cb) {
				if (nextID <= lastBatchID) {
					log('*** Handing out id ' + nextID);
					var currentID = nextID;
					nextID++;
					return cb(currentID);
				}

				deferredCallbacks.push(cb);

				log('*** deferring while waiting for a new ID', deferredCallbacks.length, queryPending);
				if (!queryPending) {
					queryPending = true;
					mysql.queryOne('call nextHiLo(?)', [batchSize], function (err, result) {
						if (err) return cb(err);
						result = result[0][0]; // \[0]_[0]/
						log('*** New id range', result);

						nextID = result.start;
						lastBatchID = result.end;
						queryPending = false;

						var runnableCallbacks = deferredCallbacks;
						deferredCallbacks = [];
						log('*** Running deferred: ', runnableCallbacks.length);
						_.each(runnableCallbacks, function (cb) {
							computeNextKey(mysql, cb);
						});
					});
				}

			}
		};
	}

	function disableKeyChecks(cb) {
		query("SET unique_checks=0;", null, function (err, result) {
			query("SET foreign_key_checks=0;", cb)
		});
	}

	function enableKeyChecks(cb) {
		query("SET unique_checks=1;", null, function (err, result) {
			query("SET foreign_key_checks=1;", cb)
		});
	}

	var obj = _.defaults({
		defaultInsertMode: insertModes.hilo,
		defaultKeyName: 'id',

		insertRules: [],
		updateRules: [],

		query: function (sql, queryParams, cb) {
			query(sql, queryParams, cb);
		},
		queryOne: function (sql, queryParams, cb) {
			query(sql, queryParams, function (err, result) {
				cb(err, (result && result.length === 1) ? result[0] : result)
			});
		},
		insert: insert,
		update: update,
		upsert: upsert,

		startTransaction: transactions.startTransaction,
		commit: transactions.commit,
		rollback: transactions.rollback,

		disableKeyChecks: disableKeyChecks,
		enableKeyChecks: enableKeyChecks,

		disconnect: disconnect,

		logging: false
	}, conn);
	return obj;
};

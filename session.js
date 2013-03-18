"use strict";
var _ = require('underscore');
var async = require('async');
var util = require('util');
var mysql = require('mysql');

var insertModes = require('./util/insertModes.js');
var updateBuilder = require('./sqlBuilders/updateBuilder.js');
var insertBuilder = require('./sqlBuilders/insertBuilder.js');
var bulkInsertBuilder = require('./sqlBuilders/bulkInsertBuilder.js');
var upsertBuilder = require('./sqlBuilders/upsertBuilder.js');
var uuidHelper = require('./util/uuidHelper.js');

var _connectionParams = {};
var concurrencyLimit = 10;
var bulkInsertBatchSize = 1000;
var hiLoBatchSize = 101;
var minBatchCount = 100;

module.exports = function (connectionParams) {
	var pool = mysql.createPool(connectionParams);
	var openTransaction = false;
	var hiloRef = hilo();

	function log() {
		if (!obj.logging)
			return;
		util.debug(util.inspect(arguments));
	}

	function error() {
		util.error(util.inspect(arguments));
	}

	function query(sql, queryParams, queryCb) {
		queryCb = queryCb || function() {};
		log(sql, queryParams);

		pool.getConnection(function(err, conn) {
			if(err) return queryCb(err);
			if(!conn.connId)
				conn.connId = uuidHelper.generateUUID();

			conn.query(sql, queryParams, function (err, result) {
				if (err) {
					err.result = result;
					err.sql = sql;
					err.queryParams = queryParams;
				}

				if (result && !util.isArray(result) && result.columnLength === 0)
					result = [];

				log(err, result);
				conn.end();

				queryCb(err, result);
			});
		});
	}

	function bulkInsert(tableName, items, insertCb, options) {
		async.forEach(items,
			function (item, eachCb) {
				hiloRef.computeNextKey(obj, function hiloCb(nextKey) {
					item.$insertId = item[hiloRef.keyName] = nextKey;
					eachCb();
				});
			},
			function insertItems(err) {
				if (err) return insertCb(err);
				bulkInsertBuilder({
					replace:options.replace,
					ignore:options.ignore,
					tableName:tableName,
					items: items,
					rules: options.enforceRules ? obj.insertRules : null
				}, function(err, insertInfo) {
					if(err) return insertCb(err);

					query(insertInfo.sql, insertInfo.values, function queryCb(err, result) {
						// $insertId -> insertId
						items = _.map(items, function (item) {
							if(item.$insertId) {
								item.insertId = item.$insertId;
								delete item.$insertId;
							}
							return item;
						});
						insertCb(err, items);
					});
				});

			}
		);
	}

	function insert(tableName, items, insertCb, options) {
		items = _.isArray(items) ? items : [items];
		options = _.defaults(options || {}, {
			insertMode: obj.defaultInsertMode,
			enforceRules: true,
			ignore: false,
			replace: false
		});

		if (items.length > 1 && !options.upsert) {
			var idx = 0;
			var insertedItems = [];
			async.whilst(
				function () {
					return idx < items.length;
				},
				function (wCb) {
					var chunk = items.slice(idx, idx + bulkInsertBatchSize);
					bulkInsert(tableName, chunk, function (err, result) {
						if (err) return wCb(err);
						insertedItems = insertedItems.concat(result);
						idx += bulkInsertBatchSize;
						wCb();
					}, options);
				},
				function (err) {
					insertCb(err, insertedItems);
				}
			);
			return;
		}

		var item = items[0];
		async.series([
			function (sCb) {
				hiloRef.computeNextKey(obj, function hiloCb(nextKey) {
					item.$insertId = item[hiloRef.keyName] = nextKey;
					sCb();
				});
			},
			function (sCb) {
				insertItem(sCb, item, options);
			}
		], function (err, res) {
			item.insertId = item.$insertId;
			delete item.$insertId;
			insertCb(err, item);
		});

		function insertItem(insertItemCb, item, options) {
			insertBuilder({
				item:item,
				tableName:tableName,
				rules: options.enforceRules ? obj.insertRules : null,
				replace: options.replace,
				ignore: options.ignore
			}, function(err, insertInfo) {
				if(err) return insertItemCb(err);

				query(insertInfo.sql, insertInfo.values, function queryCb(err, result) {
					insertItemCb(err, result);
				});
			});
		}
	}

	function update(tableName, items, updateCb, options) {
		items = _.isArray(items) ? items : [items];
		options = _.defaults(options || {}, {
			enforceRules: true
		});

		var stack = [];

		async.eachLimit(items, concurrencyLimit,
			function (item, eachCb) {
				updateBuilder({
					item: item,
					tableName: tableName,
					rules: options.enforceRules ? obj.updateRules : null,
					defaultKeyName: obj.defaultKeyName
				}, function(err, updateInfo) {
					if(err) return updateCb(err);

					query(updateInfo.sql, updateInfo.values, function queryCb(err, result) {
						if (err) updateCb(err);
						stack.push(result);
						eachCb();
					});
				});
			},
			function finalEachCb(err) {
				if (err) updateCb(err);
				updateCb(err, stack.length > 1 ? stack : stack[0]);
			}
		);
	}

	function upsert(tableName, items, insertCb, options) {
		items = _.isArray(items) ? items : [items];
		options = _.defaults(options || {}, {
			insertMode: obj.defaultInsertMode,
			enforceRules: true
		});

		var stack = [];
		async.eachLimit(items, concurrencyLimit,
			function (item, eachCb) {
				if (options.insertMode === insertModes.hilo) {
					hiloRef.computeNextKey(obj, function hiloCb(nextKey) {
						item.$insertId = item[hiloRef.keyName] = nextKey;
						upsertItem(function upsertItemCb(err, result) {
							if (err) return insertCb(err);
							result.insertId = item.$insertId;
							stack.push(result);
							eachCb();
						}, item, options);
					});
				} else {

					upsertItem(function upsertItemCb(err, result) {
						if (err) return insertCb(err);
						stack.push(result);
						eachCb();
					}, item, options);
				}
			},
			function eachFinalCb(err) {
				insertCb(null, stack.length > 1 ? stack : stack[0]);
			}
		);

		function upsertItem(upsertItemCb, item, options) {
			upsertBuilder({
				item: item,
				insertRules: options.enforceRules ? obj.insertRules : null,
				updateRules: options.enforceRules ? obj.updateRules : null,
				tableName: tableName
			}, function(err, upsertInfo) {
				query(upsertInfo.sql, upsertInfo.values, function queryCb(err, result) {
					upsertItemCb(err, result);
				});
			});
		}
	}

	function hilo() {
		var defaultMaxLo = hiLoBatchSize - 1;
		var maxLo = defaultMaxLo;
		var lo = maxLo + 1;
		var hi = 0;

		var deferredCallbacks = [];
		var queryPending = false;

		return {
			keyName: 'id',
			type: 'hilo',
			computedKey: true,
			computeNextKey: function computeNextKey(mysql, cb) {
				if (lo <= maxLo) {
					var result = hi + lo;
					lo++;
					log('*** Handing out id ' + result);
					return cb(result);
				}

				deferredCallbacks.push(cb);

				log('*** deferring while waiting for a new ID', deferredCallbacks.length, queryPending);
				if (!queryPending) {
					queryPending = true;
					mysql.queryOne('call getNextHi(?)', [minBatchCount], function (err, result) {
						if (err) return cb(err);

						var hival = result[0][0].NextHi; // \[0]_[0]/
						log('*** New id range', hival);

						lo = hival == 0 ? 1 : 0;
						hi = hival * (defaultMaxLo + 1);
						maxLo = minBatchCount * hiLoBatchSize - 1;

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
		var sql = ["SET SESSION unique_checks=0;", "SET SESSION foreign_key_checks=0;"];
		query(sql.join('\n'), null, cb);
	}

	function enableKeyChecks(cb) {
		var sql = ["SET SESSION unique_checks=1;", "SET SESSION foreign_key_checks=1;"];
		query(sql.join('\n'), null, cb);
	}

	/**
	 * TODO - fix transactions with connection pooling
	 */
	function startTransaction(cb) {
		return cb(); //TODO
		query("START TRANSACTION", function (err, res) {
			if (err) {
				openTransaction = false;
				return cb(err);
			}
			openTransaction = true;
			cb();
		});
	}

	function commit(cb) {
		if (!openTransaction)
			return cb(new Error('No transaction found to commit'));
		return cb(); //TODO
		query("COMMIT", function (err, res) {
			if (err) return cb(err);
			openTransaction = false;
			cb();
		});
	}

	function rollback(cb) {
		return cb(); //TODO
		if (!openTransaction)
			return cb(new Error('No transaction found to rollback'));
		query("ROLLBACK", function (err, res) {
			if (err) return cb(err);
			openTransaction = false;
			cb();
		});
	}

	var obj = {
		defaultInsertMode: insertModes.hilo,
		defaultKeyName: 'id',

		insertRules: [],
		updateRules: [],

		query: function (sql, queryParams, cb) {
			if(_.isFunction(queryParams) && !cb) {
				cb = queryParams;
				queryParams = null;
			}
			cb = cb || function() {};
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

		startTransaction: startTransaction,
		commit: commit,
		rollback: rollback,

		disableKeyChecks: disableKeyChecks,
		enableKeyChecks: enableKeyChecks,

		disconnect: function(cb) {
			if(!pool) return cb();
			pool.end(cb);
		}, // for tests

		logging: false
	};
	return obj;
};

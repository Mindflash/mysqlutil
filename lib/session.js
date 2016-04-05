"use strict";
var _ = require('lodash');
var util = require('util');
var events = require('events');
var async = require('async');
var mysql = require('mysql');

var insertModes = require('./insertModes.js');
var updateBuilder = require('./updateBuilder.js');
var insertBuilder = require('./insertBuilder.js');
var deadlockRetry = require('./deadlockRetry.js');

var concurrencyLimit = 2;
var bulkInsertBatchSize = 1000;
var hiLoBatchSize = 101;
var defaultMaxLo = hiLoBatchSize - 1;
var minBatchCount = 100;

function MysqlutilEvents() { }
util.inherits(MysqlutilEvents, events.EventEmitter);
var mysqlutilEvents = new MysqlutilEvents();

module.exports = function (settings) {
	var id = -1;
	var pool = mysql.createPool(settings);
	var openTransaction = false;
	var hiloRef = hilo();

	function preFillPool(cb) {
		async.each(
			new Array(settings.amtToPrefill + 1).join(0).split(''),
			function (i, eCb) {
				query("SELECT 1", null, eCb);
			}, cb);
	}

	function addPingToConnection(conn) {
		conn.pingIntervalId = setInterval(function () {
			if (settings.debugging.ping)
				console.log('conn', conn.id, 'ping');
			conn.ping.apply(conn);
		}, settings.connectionPingIntervalSeconds * 1000);

		conn.on('error', function (err) {
			clearInterval(conn.pingIntervalId);
			if (settings.debugging.connectionError)
				console.error('conn', conn.id, err);
			throw err;
		});

		conn.on('end', function (err) {
			if (settings.debugging.connectionEnd)
				console.log('conn', conn.id, 'end, err', err);
			clearInterval(conn.pingIntervalId);
		});
	}

	function getConnection(cb) {
		if (settings.debugging.poolPerf)
			console.time('Get connection from pool');

		pool.getConnection(function (err, conn) {
			if (settings.debugging.poolPerf)
				console.timeEnd('Get connection from pool');

			if (err) return cb(err);
			if (!conn) return cb(new Error('Could not get a connection from the pool'));

			if (!conn.id)
				conn.id = ++id;
			if (!conn.pingIntervalId)
				addPingToConnection(conn);

			return cb(null, conn);
		});
	}

	function query(sql, queryParams, queryCb) {
		if (_.isFunction(queryParams) && !queryCb) {
			queryCb = queryParams;
			queryParams = null;
		}
		queryCb = queryCb || function () {
		};

		getConnection(function (err, conn) {
			if (err) return queryCb(err);

			var queryStart;
			if (settings.debugging.queryPerf)
				queryStart = Date.now();

			var eventInfo = {
				sql: sql,
				params: queryParams
			};
			mysqlutilEvents.emit('query', eventInfo);

			conn.query(sql, queryParams, function (err, result) {
				if (settings.debugging.queryPerf) {
					var queryEnd = (Date.now() - queryStart) / 1000;
					if (queryEnd > settings.debugging.queryPerfSlowQueryThresholdSec)
						console.log('Slow query (' + queryEnd + ' s), conn.id', conn.id, 'Query:', sql);
					else
						console.log('Query (' + queryEnd + ' s), conn.id', conn.id);
				}

				conn.release();

				if (err) {
					err.result = result;
					err.sql = sql;
					err.queryParams = queryParams;
					result = [];
				}

				if (result) {
					if (!_.isArray(result) && result.columnLength === 0)
						result = [];
				}

				if (settings.debugging.queryResult)
					console.log('query:', sql, 'params:', queryParams, 'err:', err, 'result:', result);

				mysqlutilEvents.emit('queryResult', {
					trace: eventInfo.userData,
					sql: sql,
					params: queryParams,
					result: result,
					err: err
				});
				queryCb(err, result);
			});
		});
	}

	function queryWithDeadlockRetry(sql, queryParams, retryAmount, queryCb) {
		deadlockRetry({
			fn: query,
			args: [sql, queryParams],
			retryAmount: retryAmount
		}, queryCb);
	}

	function insert(tableName, items, insertCb, options) {
		items = _.isArray(items) ? items : [items];
		options = _.defaults(options || {}, {
			insertMode: obj.defaultInsertMode,
			enforceRules: true,
			ignore: false,
			upsert: false
		});

		var idx = 0;
		var insertedItems = [];
		async.whilst(
			function () {
				return idx < items.length;
			},
			function (wCb) {
				var chunk = items.slice(idx, idx + bulkInsertBatchSize);
				_insert(tableName, chunk, function (err, result) {
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
	}

	function _insert(tableName, items, insertCb, options) {
		async.each(items,
			function (item, eachCb) {
				if (options.insertMode !== insertModes.hilo)
					return eachCb();

				hiloRef.computeNextKey(obj, function hiloCb(nextKey) {
					item.$insertId = item[hiloRef.keyName] = nextKey;
					eachCb();
				});
			},
			insertItems
		);

		function insertItems(err) {
			if (err) return insertCb(err);
			insertBuilder({
				upsert: options.upsert,
				ignore: options.ignore,
				tableName: tableName,
				items: items,
				insertRules: options.enforceRules ? obj.insertRules : null,
				updateRules: options.enforceRules ? obj.updateRules : null
			}, function (err, insertInfo) {
				if (err) return insertCb(err);

				queryWithDeadlockRetry(insertInfo.sql, insertInfo.values, 5, function (err, result) {
					if (err) return insertCb(err);

					// InnoDB guarantees sequential numbers for AUTO INCREMENT when doing bulk inserts
					var startingInsertId = result.insertId - 1;

					// $insertId -> insertId
					items = _.map(items, function (item) {
						if (item.$insertId) {
							item.insertId = item.$insertId;
							delete item.$insertId;
						}
						else if (options.insertMode === insertModes.identity) {
							item.insertId = ++startingInsertId;
						}
						return item;
					});
					insertCb(err, items);
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
				}, function (err, updateInfo) {
					if (err) return updateCb(err);

					queryWithDeadlockRetry(updateInfo.sql, updateInfo.values, 5, function (err, result) {
						if (err) return updateCb(err);

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

	function reserveHiLoIds(amount, cb) {
		var batchesCount = Math.floor(amount / hiLoBatchSize);
		if (amount % hiLoBatchSize != 0) {
			batchesCount++;
		}
		obj.queryOne('CALL getNextHi(?);', [batchesCount], function (err, dbResult) {
			if (err) return cb(err);
			var lo = dbResult[0].NextHi == 0 ? 1 : 0;
			var hi = dbResult[0].NextHi * (defaultMaxLo + 1);
			var startId = hi + lo;
			cb(null, startId);
		});
	}

	function hilo() {
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
					if (settings.debugging.hilo)
						console.log('Handing out id ' + result);
					return cb(result);
				}

				deferredCallbacks.push(cb);
				if (settings.debugging.hilo)
					console.log('Deferring while waiting for a new ID', deferredCallbacks.length, queryPending);

				if (!queryPending) {
					queryPending = true;
					mysql.queryOne('CALL getNextHi(?)', [minBatchCount], function (err, result) {
						if (err) return cb(err);

						var hival = result[0].NextHi;
						if (settings.debugging.hilo)
							console.log('New id range', hival);

						lo = hival == 0 ? 1 : 0;
						hi = hival * (defaultMaxLo + 1);
						maxLo = minBatchCount * hiLoBatchSize - 1;

						queryPending = false;

						var runnableCallbacks = deferredCallbacks;
						deferredCallbacks = [];
						if (settings.debugging.hilo)
							console.log('Running deferred', runnableCallbacks.length);
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
		return cb(); //TODO
		query("COMMIT", function (err, res) {
			if (err) return cb(err);
			openTransaction = false;
			cb();
		});
	}

	function rollback(cb) {
		return cb(); //TODO
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
			if (_.isFunction(queryParams) && !cb) {
				cb = queryParams;
				queryParams = null;
			}
			cb = cb || function () {};

			queryWithDeadlockRetry(sql, queryParams, 5, cb);
		},
		queryWithDeadlockRetry: function (sql, queryParams, retryAmount, cb) {
			queryWithDeadlockRetry(sql, queryParams, retryAmount, cb);
		},
		getConnection: getConnection,
		queryOne: function (sql, queryParams, cb) {
			if (_.isFunction(queryParams) && !cb) {
				cb = queryParams;
				queryParams = null;
			}
			cb = cb || function () {
			};

			queryWithDeadlockRetry(sql, queryParams, 5, function (err, result) {
				result = _.isEmpty(result) ? null : result[0];
				cb(err, result)
			});
		},
		insert: insert,
		update: update,
		upsert: function (tableName, items, insertCb, options) {
			options = options || {};
			options.upsert = true;
			insert(tableName, items, insertCb, options);
		},

		startTransaction: startTransaction,
		commit: commit,
		rollback: rollback,

		disableKeyChecks: disableKeyChecks,
		enableKeyChecks: enableKeyChecks,

		disconnect: function (cb) {
			if (!pool) return cb();
			pool.end(cb);
		}, // for tests

		logging: false,
		preFillPool: preFillPool,
		reserveHiLoIds: reserveHiLoIds,
		events: mysqlutilEvents
	};
	return obj;
};

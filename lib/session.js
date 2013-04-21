"use strict";
var _ = require('lodash');
var async = require('async');
var util = require('util');
var mysql = require('mysql');

var insertModes = require('./insertModes.js');
var updateBuilder = require('./updateBuilder.js');
var insertBuilder = require('./insertBuilder.js');

var concurrencyLimit = 2;
var bulkInsertBatchSize = 1000;
var hiLoBatchSize = 101;
var minBatchCount = 100;

module.exports = function (settings) {
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
		conn.pingIntervalId = setInterval(function() {
			if(settings.debugging)
				console.log('conn', conn.id, 'ping');
			conn.ping.apply(conn);
		}, settings.connectionPingIntervalSeconds * 1000);

		conn.on('error', function (err) {
			clearInterval(conn.pingIntervalId);
			if(settings.debugging)
				console.error('conn', conn.id, err);
			throw err;
		});

		conn.on('end', function (err) {
			if(settings.debugging)
				console.log('conn', conn.id, 'end, err',err);
			clearInterval(conn.pingIntervalId);
		});
	}

	var id = -1;
	function query(sql, queryParams, queryCb) {
		if (_.isFunction(queryParams) && !queryCb) {
			queryCb = queryParams;
			queryParams = null;
		}
		queryCb = queryCb || function () {};

		if(settings.debugging)
			console.time('Get connection from pool');

		pool.getConnection(function (err, conn) {
			if(settings.debugging)
				console.timeEnd('Get connection from pool');

			if (err) return queryCb(err);
			if(!conn) return queryCb(new Error('Could not get a connection from the pool'));

			if(!conn.id)
				conn.id = ++id;
			if (!conn.pingIntervalId)
				addPingToConnection(conn);

			if(settings.debugging)
				console.time('conn: ' + conn.id + ' - query');
			conn.query(sql, queryParams, function (err, result) {
				if(settings.debugging)
					console.timeEnd('conn: ' + conn.id + ' - query');
				conn.end();

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

				if(settings.debugging)
					console.log('query, err:', err, 'result', result);

				queryCb(err, result);
			});
		});
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

					query(insertInfo.sql, insertInfo.values, function queryCb(err, result) {
						// $insertId -> insertId
						items = _.map(items, function (item) {
							if (item.$insertId) {
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
					if(settings.debugging)
						console.log('Handing out id ' + result);
					return cb(result);
				}

				deferredCallbacks.push(cb);
				if(settings.debugging)
					console.log('Deferring while waiting for a new ID', deferredCallbacks.length, queryPending);

				if (!queryPending) {
					queryPending = true;
					mysql.queryOne('CALL getNextHi(?)', [minBatchCount], function (err, result) {
						if (err) return cb(err);

						var hival = result[0].NextHi;
						if(settings.debugging)
							console.log('New id range', hival);

						lo = hival == 0 ? 1 : 0;
						hi = hival * (defaultMaxLo + 1);
						maxLo = minBatchCount * hiLoBatchSize - 1;

						queryPending = false;

						var runnableCallbacks = deferredCallbacks;
						deferredCallbacks = [];
						if(settings.debugging)
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
			query(sql, queryParams, cb);
		},
		queryOne: function (sql, queryParams, cb) {
			if (_.isFunction(queryParams) && !cb) {
				cb = queryParams;
				queryParams = null;
			}
			cb = cb || function () {
			};

			query(sql, queryParams, function (err, result) {
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
		preFillPool: preFillPool
	};
	return obj;
};

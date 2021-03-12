const assert = require('assert');
const config = require('../../config.json');
const MySQLSync = require('sync-mysql')
const mysqlPromise = require('mysql2/promise')
const DB = require('../kernel/database');
const poolSync = new MySQLSync({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database
});
const pool = mysqlPromise.createPool(config.mysql);
const userDb = new DB(pool, poolSync, mysqlPromise);

describe('Database:', () => {
    describe('Querying Synchronous mysql request.', () => {
        it('It should return object or error', () => {
            let qry = 'SELECT * FROM live_fixture LIMIT 1';
            let result = userDb.executeQrySync(qry);
            assert.equal(typeof result, 'object');
            done()
        });
    });

    describe('Querying 200 Asynchronous mysql request.', () => {
        it('It should return true on every request.', async () => {
            try {
                for (let i = 0; i < 200; i++) {
                    let qry = 'SELECT * FROM live_fixture LIMIT 1';
                    let testResult = await userDb.executeQry(qry, []);
                    assert.equal(typeof testResult, 'object');
                }
            } catch (e) {
                done()
            }
        });
    });
});
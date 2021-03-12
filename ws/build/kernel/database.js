const config = require('../../config.json')
class Database {
    constructor(pool = null, poolSync = null, asyncMysql = null) {
        if (poolSync !== null) {
            this.poolSync = poolSync
        }

        if (pool !== null) {
            this.pool = pool;
        }

        if (asyncMysql !== null) {
            this.asyncMysql = asyncMysql
        }
    }

    // Execute function Asynchronously
    async executeQry(sql, arrayData = []) {
        const connection = await this.asyncMysql.createConnection(config.mysql);

        // query database
        const [rows, fields] = await connection.execute(sql, arrayData);

        await connection.end();
        
        if (rows.length > 0) {
            return rows[0];
        } else {
            throw `DB: No result found. (${sql})`;
        }
    }

    // Execute function Synchronously
    executeQrySync(sql) {
        let result = this.poolSync.query(sql)
        this.poolSync.dispose();
        return result;
    }


    async execAsync() {
        const connection = await this.asyncMysql.createConnection({

        })
    }
}


module.exports = Database
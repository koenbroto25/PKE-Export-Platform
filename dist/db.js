"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pool = void 0;
const pg_1 = require("pg");
Object.defineProperty(exports, "Pool", { enumerable: true, get: function () { return pg_1.Pool; } });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
}
const pool = new pg_1.Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
});
exports.default = pool;
//# sourceMappingURL=db.js.map
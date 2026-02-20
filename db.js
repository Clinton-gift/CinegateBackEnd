const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || "./data/demo.db";
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
db.exec(schema);

module.exports = db;

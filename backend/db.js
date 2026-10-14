// db.js — koneksi ke MySQL
// Mendukung environment variables untuk hosting (Render.com, Railway, dll.)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host    : process.env.DB_HOST     || 'localhost',
  port    : Number(process.env.DB_PORT) || 3306,
  user    : process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'ruangtemu_db',
  waitForConnections: true,
  connectionLimit   : 5,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;

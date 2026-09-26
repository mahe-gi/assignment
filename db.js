const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgrespassword',
  database: process.env.DB_NAME || 'remo_tenants',
});

// Helper to ensure tables are initialized
async function initDB() {
  try {
    const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf-8');
    await pool.query(initSql);
    console.log('✓ Database initialized with tables and seed data.');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDB,
};

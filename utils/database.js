import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'table_tennis_tournament',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Verify pool has execute method
if (typeof pool.execute !== 'function') {
  console.error('ERROR: pool.execute is not a function. Pool type:', typeof pool);
}

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
  });

export default pool;


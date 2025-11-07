import mysql from 'mysql2/promise';
import 'dotenv/config';

// Validate required environment variables (check raw env vars before parsing)
const requiredEnvVars = {
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASS: process.env.DB_PASS, // Note: empty string is valid for MySQL (no password)
  DB_NAME: process.env.DB_NAME
};

// Check for undefined/null (but allow empty strings for password)
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => {
    // DB_PASS can be empty string (no password), but other vars cannot
    if (key === 'DB_PASS') {
      return value === undefined || value === null;
    }
    return value === undefined || value === null || value === '';
  })
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please set all database environment variables in your .env file');
  console.error('Current values:', Object.entries(requiredEnvVars).map(([k, v]) => {
    if (v === undefined) return `${k}=undefined`;
    if (v === '') return `${k}=(empty)`;
    if (k === 'DB_PASS') return `${k}=***`;
    return `${k}=${v}`;
  }).join(', '));
  process.exit(1);
}

// Parse and validate port
const dbPort = parseInt(process.env.DB_PORT);
if (isNaN(dbPort) || dbPort <= 0 || dbPort > 65535) {
  console.error(`Invalid DB_PORT value: "${process.env.DB_PORT}". Must be a number between 1 and 65535.`);
  process.exit(1);
}

const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS || ''; // Allow empty password
const dbName = process.env.DB_NAME;

// Create connection pool
const pool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPass,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper function to get user-friendly error message
const getConnectionErrorMessage = (error) => {
  if (!error) return 'Unknown connection error';

  const errorCode = error.code || '';
  const errorMessage = error.message || '';

  // Check for specific MySQL error codes
  if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
    return 'MySQL server is not running. Please start MySQL service and try again.';
  }

  if (errorCode === 'ETIMEDOUT' || errorMessage.includes('ETIMEDOUT')) {
    return 'Connection timeout. Please check if MySQL server is running and accessible.';
  }

  if (errorCode === 'ER_ACCESS_DENIED_ERROR' || errorMessage.includes('Access denied')) {
    return 'Access denied. Please check your database username and password in backend/.env file.';
  }

  if (errorCode === 'ER_BAD_DB_ERROR' || errorMessage.includes("Unknown database")) {
    return 'Database does not exist. The system will try to create it when needed.';
  }

  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
    return 'Cannot connect to MySQL server. Please check the host address in backend/.env file.';
  }

  // Generic error
  return 'Failed to connect to MySQL. Please verify your database configuration in backend/.env file.';
};

// Verify pool has execute method
if (typeof pool.execute !== 'function') {
  console.error('ERROR: pool.execute is not a function. Pool type:', typeof pool);
}

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('✓ Database connected successfully');
    console.log(`  Host: ${dbHost}:${dbPort}`);
    // console.log(`  Database: ${dbName}`);
    connection.release();
  })
  .catch(err => {
    const friendlyMessage = getConnectionErrorMessage(err);
    console.error('\n❌ Database connection failed');
    console.error(`  ${friendlyMessage}`);
    // console.error(`\n  Connection details:`);
    // console.error(`    Host: ${dbHost}`);
    // console.error(`    Port: ${dbPort}`);
    // console.error(`    User: ${dbUser}`);
    // console.error(`    Database: ${dbName}`);
    console.error(`\n  Technical details:`);
    console.error(`    Error code: ${err.code || 'N/A'}`);
    console.error(`    Error message: ${err.message || 'N/A'}`);
    if (err.errno) {
      console.error(`    Error number: ${err.errno}`);
    }
    
    // Provide troubleshooting steps for ECONNREFUSED
    if (err.code === 'ECONNREFUSED') {
      console.error(`\n  Troubleshooting steps:`);
      console.error(`    1. Check if MySQL server is running:`);
      console.error(`       - Windows: Open Services (services.msc), find MySQL, and start it`);
      console.error(`       - Mac/Linux: Run: sudo service mysql start (or sudo systemctl start mysql)`);
      console.error(`    2. Verify MySQL is running: mysql --version`);
      console.error(`    3. Test connection manually: mysql -h ${dbHost} -P ${dbPort} -u ${dbUser} -p`);
      console.error(`    4. Check if MySQL is listening on port ${dbPort}:`);
      console.error(`       - Windows: netstat -an | findstr ${dbPort}`);
      console.error(`       - Mac/Linux: netstat -an | grep ${dbPort} or lsof -i :${dbPort}`);
    }
  });

export default pool;


// Script to create a default admin user
// Usage: node backend/scripts/createAdmin.js
// Or: npm run create-admin (if added to package.json)

import bcrypt from 'bcryptjs';
import pool from '../utils/database.js';
import 'dotenv/config';

const createAdmin = async () => {
  let connection = null;
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const email = process.env.ADMIN_EMAIL || 'muazzam.y@ebitlogix.com';
    const password = process.env.ADMIN_PASSWORD || 'admin@1234';
    const role = 'admin';

    console.log('\n🔧 Creating admin user...');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);

    // First, check if users table exists, if not create it
    try {
      const [tables] = await pool.execute(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
        [process.env.DB_NAME]
      );

      if (tables.length === 0) {
        console.log('⚠️  Users table not found. Creating users table...');
        
        // Get a connection to create the table
        connection = await pool.getConnection();
        
        await connection.query(`
          CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('admin', 'user') DEFAULT 'user',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_username (username),
            INDEX idx_email (email),
            INDEX idx_role (role)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        console.log('✅ Users table created successfully!');
        connection.release();
        connection = null;
      }
    } catch (tableError) {
      console.error('❌ Error checking/creating users table:', tableError.message);
      throw tableError;
    }

    // Check if admin already exists
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      console.log('⚠️  Admin user already exists!');
      console.log(`   Existing user ID: ${existing[0].id}`);
      console.log(`   You can login with:`);
      console.log(`   Username: ${username}`);
      console.log(`   Password: ${password}`);
      return;
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert admin user
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, password_hash, role]
    );

    console.log('\n✅ Admin user created successfully!');
    console.log(`   User ID: ${result.insertId}`);
    console.log(`\n📋 Login Credentials:`);
    console.log(`   Username: ${username}`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`\n⚠️  Please change the default password after first login!`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating admin user:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error('\n💡 Tip: Make sure all database tables exist.');
      console.error('   You can recreate tables by calling the seed/setup endpoint or running schema.sql');
    }
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

createAdmin();


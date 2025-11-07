// Script to create a default admin user
// Usage: node backend/scripts/createAdmin.js

import bcrypt from 'bcryptjs';
import pool from '../utils/database.js';
import dotenv from 'dotenv';

dotenv.config();

const createAdmin = async () => {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const email = process.env.ADMIN_EMAIL || 'admin@tabletennis.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const role = 'admin';

    console.log('Creating admin user...');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);

    // Check if admin already exists
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      console.log('Admin user already exists!');
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

    console.log('✅ Admin user created successfully!');
    console.log(`User ID: ${result.insertId}`);
    console.log(`Default credentials:`);
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${password}`);
    console.log('\n⚠️  Please change the default password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
};

createAdmin();


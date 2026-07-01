// Script to create a default admin user
// Usage: npm run create-admin

import bcrypt from 'bcryptjs';
import pool from '../utils/database.js';
import 'dotenv/config';

const createAdmin = async () => {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'admin@1234';
    const role = 'admin';

    console.log('\n🔧 Creating admin user...');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);

    const [tables] = await pool.execute(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'`
    );

    if (tables.length === 0) {
      console.error('❌ Users table not found. Run: npm run db:migrate');
      process.exit(1);
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      const resetPassword = process.argv.includes('--reset');
      if (resetPassword) {
        const password_hash = await bcrypt.hash(password, 10);
        await pool.execute(
          'UPDATE users SET password_hash = ?, email = ?, role = ? WHERE id = ?',
          [password_hash, email, role, existing[0].id]
        );
        console.log('✅ Admin password reset successfully!');
        console.log(`   User ID: ${existing[0].id}`);
        console.log(`\n📋 Login Credentials:`);
        console.log(`   Username: ${username}`);
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        return;
      }

      console.log('⚠️  Admin user already exists!');
      console.log(`   Existing user ID: ${existing[0].id}`);
      console.log(`   To reset the password, run: npm run create-admin -- --reset`);
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);

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
    if (error.code === '42P01') {
      console.error('\n💡 Run database migrations first: npm run db:migrate');
    }
    process.exit(1);
  }
};

createAdmin();

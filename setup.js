// setup.js — Run this ONCE after npm install to initialize database
// Usage: node setup.js
require('dotenv').config();
const pg = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('\n🚀 Editone HRMS — Database Setup\n');
  
  let conn;
  try {
    // Connect WITHOUT database first
    conn = new pg.Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    });
    await conn.connect();
    
    console.log('✓ Connected to PostgreSQL');
    
    // Read schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('✓ Loaded schema.sql');
    
    // Execute schema
    await conn.query(schema);
    console.log('✓ Database & tables created');
    
    // Now connect to the new database
    await conn.end();
    conn = new pg.Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'editone_hrms',
    });
    await conn.connect();
    
    // Update admin password hash (proper bcrypt for the actual password)
    const adminPwd = process.env.ADMIN_PASSWORD || 'admin123';
    const adminHash = await bcrypt.hash(adminPwd, 10);
    await conn.query(
      'UPDATE admin SET password_hash = $1, username = $2, name = $3, email = $4 WHERE id = 1',
      [adminHash, process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_NAME || 'Dr. Pankaj Jagya', process.env.ADMIN_EMAIL || 'admin@editone.in']
    );
    console.log('✓ Admin password hashed');
    
    // Update demo employee password hash
    const demoHash = await bcrypt.hash('demo123', 10);
    await conn.query('UPDATE employees SET password_hash = $1 WHERE email = $2', [demoHash, 'demo@editone.in']);
    console.log('✓ Demo employee password hashed');
    
    console.log('\n✅ Setup Complete!\n');
    console.log('Default Credentials:');
    console.log('  Admin:    username=' + (process.env.ADMIN_USERNAME || 'admin') + '  password=' + adminPwd);
    console.log('  Employee: email=demo@editone.in  password=demo123');
    console.log('\nStart the server: npm start');
    console.log('Then open: http://localhost:' + (process.env.PORT || 3000) + '\n');
    
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    if (err.code === '28000') {
      console.error('\nPostgreSQL credentials galat hain. .env file mein DB_USER aur DB_PASSWORD check karein.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('\nPostgreSQL server chal nahi raha. PostgreSQL start karein.');
    }
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();

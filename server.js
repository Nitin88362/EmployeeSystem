// ============================================================
// EDITONE HRMS — Backend Server (PostgreSQL Version)
// Express + PostgreSQL + JWT
// ============================================================
require('dotenv').config();
const express = require('express');
const pg = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'editone-fallback-secret';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database pool
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'editone_hrms',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helpers
const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const todayStr = () => new Date().toISOString().split('T')[0];

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function auth(allowedRoles = ['admin', 'employee']) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!allowedRoles.includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' });
      req.user = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM admin WHERE username = $1', [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const admin = rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin', name: admin.name }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ token, user: { id: admin.id, username: admin.username, name: admin.name, email: admin.email, role: 'admin' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/employee-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM employees WHERE email = $1', [email.toLowerCase()]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const emp = rows[0];
    const ok = await bcrypt.compare(password, emp.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: emp.id, email: emp.email, role: 'employee', name: emp.name }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ token, user: empToJSON(emp) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth(), async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { rows } = await pool.query('SELECT id, username, name, email FROM admin WHERE id = $1', [req.user.id]);
      return res.json({ ...rows[0], role: 'admin' });
    } else {
      const { rows } = await pool.query('SELECT * FROM employees WHERE id = $1', [req.user.id]);
      return res.json(empToJSON(rows[0]));
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CONFIG
// ============================================================
app.get('/api/config', auth(), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM config WHERE id = $1', [1]);
  const c = rows[0] || {};
  res.json({
    officeIn: c.office_in?.substring(0,5) || '09:00',
    officeOut: c.office_out?.substring(0,5) || '17:30',
    overtimeCap: c.overtime_cap?.substring(0,5) || '21:00',
    gracePeriod: c.grace_period || 10,
    workingDays: c.working_days || 6,
    otRate: parseFloat(c.ot_rate) || 1.5,
    officeName: c.office_name || '',
    officeLat: parseFloat(c.office_lat) || null,
    officeLng: parseFloat(c.office_lng) || null,
    maxDistance: c.max_distance || 500,
  });
});

app.put('/api/config', auth(['admin']), async (req, res) => {
  try {
    const c = req.body;
    await pool.query(
      `UPDATE config SET office_in=$1, office_out=$2, overtime_cap=$3, grace_period=$4, working_days=$5, ot_rate=$6,
        office_name=$7, office_lat=$8, office_lng=$9, max_distance=$10 WHERE id=$11`,
      [c.officeIn, c.officeOut, c.overtimeCap, c.gracePeriod, c.workingDays, c.otRate,
       c.officeName, c.officeLat, c.officeLng, c.maxDistance, 1]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Leave Types
app.get('/api/leave-types', auth(), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM leave_types ORDER BY sort_order');
  res.json(rows.map(r => ({ id: r.id, name: r.name, annual: r.annual_quota, color: r.color, paid: !!r.is_paid })));
});

// ============================================================
// DEPARTMENTS
// ============================================================
app.get('/api/departments', auth(), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM departments ORDER BY name');
  res.json(rows);
});

app.post('/api/departments', auth(['admin']), async (req, res) => {
  try {
    const id = uid();
    await pool.query('INSERT INTO departments (id, name) VALUES ($1, $2)', [id, req.body.name]);
    res.json({ id, ...req.body });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/departments/:id', auth(['admin']), async (req, res) => {
  try {
    await pool.query('UPDATE departments SET name=$1 WHERE id=$2', [req.body.name, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/departments/:id', auth(['admin']), async (req, res) => {
  await pool.query('DELETE FROM departments WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// EMPLOYEES
// ============================================================
function empToJSON(emp) {
  return {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    phone: emp.phone,
    department: emp.department,
    designation: emp.designation,
    ctc: parseFloat(emp.ctc) || 0,
    doj: emp.doj,
    isActive: !!emp.is_active,
  };
}

app.get('/api/employees', auth(['admin']), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM employees ORDER BY name');
  res.json(rows.map(empToJSON));
});

app.get('/api/employees/:id', auth(), async (req, res) => {
  if (req.user.role === 'employee' && req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await pool.query('SELECT * FROM employees WHERE id=$1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(empToJSON(rows[0]));
});

app.post('/api/employees', auth(['admin']), async (req, res) => {
  try {
    const e = req.body;
    const id = uid();
    const pwHash = await bcrypt.hash(e.password || 'changeme123', 10);
    await pool.query(
      `INSERT INTO employees (id, name, email, phone, department, designation, ctc, doj, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, e.name, e.email.toLowerCase(), e.phone, e.department, e.designation, e.ctc, e.doj, pwHash, true]
    );
    res.json({ id, ...e });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/employees/:id', auth(), async (req, res) => {
  try {
    const e = req.body;
    if (req.user.role === 'admin') {
      const fields = [];
      const params = [];
      
      if (e.name !== undefined) { fields.push('name = $' + (fields.length + 1)); params.push(e.name); }
      if (e.phone !== undefined) { fields.push('phone = $' + (fields.length + 1)); params.push(e.phone); }
      if (e.department !== undefined) { fields.push('department = $' + (fields.length + 1)); params.push(e.department); }
      if (e.designation !== undefined) { fields.push('designation = $' + (fields.length + 1)); params.push(e.designation); }
      if (e.ctc !== undefined) { fields.push('ctc = $' + (fields.length + 1)); params.push(e.ctc); }
      if (e.doj !== undefined) { fields.push('doj = $' + (fields.length + 1)); params.push(e.doj); }
      if (e.is_active !== undefined) { fields.push('is_active = $' + (fields.length + 1)); params.push(e.is_active); }
      if (e.password) {
        fields.push('password_hash = $' + (fields.length + 1));
        params.push(await bcrypt.hash(e.password, 10));
      }
      
      params.push(req.params.id);
      await pool.query(`UPDATE employees SET ${fields.join(', ')} WHERE id = $${fields.length + 1}`, params);
    } else {
      // Employee self-edit (limited fields)
      const fields = [];
      const params = [];
      
      if (e.phone !== undefined) { fields.push('phone = $' + (fields.length + 1)); params.push(e.phone); }
      if (e.password) {
        fields.push('password_hash = $' + (fields.length + 1));
        params.push(await bcrypt.hash(e.password, 10));
      }
      
      params.push(req.params.id);
      await pool.query(`UPDATE employees SET ${fields.join(', ')} WHERE id = $${fields.length + 1}`, params);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/employees/:id', auth(['admin']), async (req, res) => {
  await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// QR CODES
// ============================================================
app.get('/api/qr/today', auth(), async (req, res) => {
  const t = todayStr();
  let { rows } = await pool.query('SELECT * FROM qr_codes WHERE qr_date = $1', [t]);
  if (rows.length === 0) {
    const code = 'EDITONE-' + t + '-' + uid().toUpperCase();
    await pool.query('INSERT INTO qr_codes (id, qr_date, qr_secret) VALUES ($1, $2, $3)', [uid(), t, code]);
    return res.json({ date: t, code });
  }
  res.json({ date: rows[0].qr_date.toISOString().split('T')[0], code: rows[0].qr_secret });
});

app.post('/api/qr/refresh', auth(['admin']), async (req, res) => {
  const t = todayStr();
  const code = 'EDITONE-' + t + '-' + uid().toUpperCase();
  await pool.query('INSERT INTO qr_codes (id, qr_date, qr_secret) VALUES ($1, $2, $3) ON CONFLICT (qr_date) DO UPDATE SET qr_secret = $3', [uid(), t, code]);
  res.json({ date: t, code });
});

// ============================================================
// ATTENDANCE
// ============================================================
function attToJSON(a) {
  return {
    id: a.id,
    employeeId: a.employee_id,
    date: a.date,
    checkIn: a.check_in?.substring(0,5) || '',
    checkOut: a.check_out?.substring(0,5) || '',
    locationLat: parseFloat(a.location_lat) || null,
    locationLng: parseFloat(a.location_lng) || null,
    locationAccuracy: a.location_accuracy || null,
    qrId: a.qr_id,
    lateBy: a.late_by || null,
    earlyBy: a.early_by || null,
    overtime: a.overtime || null,
    status: a.status,
  };
}

app.get('/api/attendance', auth(), async (req, res) => {
  let sql = 'SELECT * FROM attendance WHERE 1=1';
  let params = [];
  
  if (req.user.role === 'employee') {
    sql += ' AND employee_id = $1';
    params.push(req.user.id);
  }
  if (req.query.employeeId) {
    sql += ' AND employee_id = $' + (params.length + 1);
    params.push(req.query.employeeId);
  }
  if (req.query.from) { 
    sql += ' AND date >= $' + (params.length + 1); 
    params.push(req.query.from); 
  }
  if (req.query.to) { 
    sql += ' AND date <= $' + (params.length + 1); 
    params.push(req.query.to); 
  }
  sql += ' ORDER BY date DESC';
  
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(attToJSON));
});

app.post('/api/attendance/scan', auth(['employee']), async (req, res) => {
  try {
    const { qrCode, location } = req.body;
    const t = todayStr();
    
    // Verify QR
    const { rows: qrRows } = await pool.query('SELECT qr_secret FROM qr_codes WHERE qr_date = $1', [t]);
    if (qrRows.length === 0 || qrRows[0].qr_secret !== qrCode) {
      return res.status(400).json({ error: 'Invalid or expired QR code' });
    }
    
    // Get config
    const { rows: cfgRows } = await pool.query('SELECT * FROM config WHERE id = $1', [1]);
    const cfg = cfgRows[0] || {};
    
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    // Check existing
    const { rows: existing } = await pool.query('SELECT * FROM attendance WHERE employee_id = $1 AND date = $2', [req.user.id, t]);
    
    if (existing.length === 0) {
      // Check-in
      const lateBy = now > cfg.office_in ? Math.floor((new Date('2023-01-01 ' + now) - new Date('2023-01-01 ' + cfg.office_in)) / 60000) : 0;
      await pool.query(
        `INSERT INTO attendance (employee_id, date, check_in, location_lat, location_lng, location_accuracy, qr_id, late_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [req.user.id, t, now, location?.lat, location?.lng, location?.accuracy, qrCode, lateBy, 'present']
      );
      res.json({ action: 'check-in', time: now, lateBy });
    } else {
      // Check-out
      const earlyBy = now < cfg.office_out ? Math.floor((new Date('2023-01-01 ' + cfg.office_out) - new Date('2023-01-01 ' + now)) / 60000) : 0;
      const overtime = now > cfg.overtime_cap ? Math.floor((new Date('2023-01-01 ' + now) - new Date('2023-01-01 ' + cfg.overtime_cap)) / 60000) : 0;
      await pool.query(
        `UPDATE attendance SET check_out = $1, location_lat = $2, location_lng = $3, location_accuracy = $4, early_by = $5, overtime = $6
         WHERE employee_id = $7 AND date = $8`,
        [now, location?.lat, location?.lng, location?.accuracy, earlyBy, overtime, req.user.id, t]
      );
      res.json({ action: 'check-out', time: now, earlyBy, overtime });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// LEAVES
// ============================================================
app.get('/api/leaves', auth(), async (req, res) => {
  let sql = 'SELECT * FROM leaves WHERE 1=1';
  let params = [];
  
  if (req.user.role === 'employee') {
    sql += ' AND employee_id = $1';
    params.push(req.user.id);
  }
  if (req.query.status) {
    sql += ' AND status = $' + (params.length + 1);
    params.push(req.query.status);
  }
  sql += ' ORDER BY created_at DESC';
  
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.post('/api/leaves', auth(['employee']), async (req, res) => {
  try {
    const l = req.body;
    const days = Math.ceil((new Date(l.end) - new Date(l.start)) / (1000*60*60*24)) + 1;
    await pool.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, l.type, l.start, l.end, days, l.reason, 'pending']
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leaves/:id/decision', auth(['admin']), async (req, res) => {
  await pool.query(
    'UPDATE leaves SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP WHERE id = $3',
    [req.body.decision, req.user.id, req.params.id]
  );
  res.json({ success: true });
});

// ============================================================
// HOLIDAYS
// ============================================================
app.get('/api/holidays', auth(), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM holidays ORDER BY date');
  res.json(rows);
});

app.post('/api/holidays', auth(['admin']), async (req, res) => {
  await pool.query('INSERT INTO holidays (name, date, type) VALUES ($1, $2, $3)', [req.body.name, req.body.date, req.body.type || 'national']);
  res.json({ success: true });
});

app.delete('/api/holidays/:id', auth(['admin']), async (req, res) => {
  await pool.query('DELETE FROM holidays WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// PAYROLL
// ============================================================
app.get('/api/payroll', auth(), async (req, res) => {
  let sql = 'SELECT * FROM payroll WHERE 1=1';
  let params = [];
  
  if (req.user.role === 'employee') {
    sql += ' AND employee_id = $1';
    params.push(req.user.id);
  }
  if (req.query.employeeId) {
    sql += ' AND employee_id = $' + (params.length + 1);
    params.push(req.query.employeeId);
  }
  if (req.query.month) {
    sql += ' AND month = $' + (params.length + 1);
    params.push(req.query.month);
  }
  if (req.query.year) {
    sql += ' AND year = $' + (params.length + 1);
    params.push(req.query.year);
  }
  sql += ' ORDER BY year DESC, month DESC';
  
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.post('/api/payroll/process', auth(['admin']), async (req, res) => {
  try {
    const { employeeId, month, year } = req.body;
    const emp = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId]);
    
    if (emp.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    
    const e = emp.rows[0];
    const basic = parseFloat(e.ctc) * 0.4;
    const hra = basic * 0.4;
    const conveyance = 1600;
    const medical = 1250;
    const special = parseFloat(e.ctc) - basic - hra - conveyance - medical;
    const gross = basic + hra + conveyance + medical + special;
    
    const pf = basic * 0.12;
    const esi = Math.min(gross * 0.0075, 7500);
    const pt = 200;
    const tds = 0;
    const total = pf + esi + pt + tds;
    const net = gross - total;
    
    await pool.query(
      `INSERT INTO payroll (employee_id, month, year, basic_salary, hra, conveyance, medical, special_allowance, 
       gross_salary, pf_deduction, esi_deduction, professional_tax, tds, other_deductions, total_deductions, net_salary, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (employee_id, month, year) DO UPDATE SET
       basic_salary = $4, hra = $5, conveyance = $6, medical = $7, special_allowance = $8,
       gross_salary = $9, pf_deduction = $10, esi_deduction = $11, professional_tax = $12, tds = $13,
       other_deductions = $14, total_deductions = $15, net_salary = $16, status = $17`,
      [employeeId, month, year, basic, hra, conveyance, medical, special, gross, pf, esi, pt, tds, 0, total, net, 'draft']
    );
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/payroll/:id/pay', auth(['admin']), async (req, res) => {
  await pool.query('UPDATE payroll SET status = $1, paid_at = CURRENT_TIMESTAMP WHERE id = $2', ['paid', req.params.id]);
  res.json({ success: true });
});

app.delete('/api/payroll/:id', auth(['admin']), async (req, res) => {
  await pool.query('DELETE FROM payroll WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// NOTICES
// ============================================================
app.get('/api/notices', auth(), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM notices ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/notices', auth(['admin']), async (req, res) => {
  await pool.query(
    'INSERT INTO notices (title, content, priority, valid_from, valid_until, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.body.title, req.body.content, req.body.priority || 'normal', req.body.validFrom, req.body.validUntil, req.user.id]
  );
  res.json({ success: true });
});

app.delete('/api/notices/:id', auth(['admin']), async (req, res) => {
  await pool.query('DELETE FROM notices WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// REGULARIZATIONS
// ============================================================
app.get('/api/regularizations', auth(), async (req, res) => {
  let sql = 'SELECT * FROM regularizations WHERE 1=1';
  let params = [];
  
  if (req.user.role === 'employee') {
    sql += ' AND employee_id = $1';
    params.push(req.user.id);
  }
  sql += ' ORDER BY created_at DESC';
  
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.post('/api/regularizations', auth(['employee']), async (req, res) => {
  await pool.query(
    'INSERT INTO regularizations (employee_id, date, check_in, check_out, reason, status) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.user.id, req.body.date, req.body.checkIn, req.body.checkOut, req.body.reason, 'pending']
  );
  res.json({ success: true });
});

app.put('/api/regularizations/:id/decision', auth(['admin']), async (req, res) => {
  await pool.query(
    'UPDATE regularizations SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP WHERE id = $3',
    [req.body.decision, req.user.id, req.params.id]
  );
  res.json({ success: true });
});

// ============================================================
// FALLBACK
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START
// ============================================================
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✓ Database connected');
    app.listen(PORT, () => {
      console.log(`\n🚀 Editone HRMS Server Running\n`);
      console.log(`   Local:    http://localhost:${PORT}`);
      console.log(`   Network:  http://<your-ip>:${PORT}`);
      console.log(`\n   Admin login: admin / admin123`);
      console.log(`   Demo emp:    demo@editone.in / demo123\n`);
    });
  } catch (e) {
    console.error('\n❌ Database connection failed:', e.message);
    console.error('Did you run: npm run setup?\n');
    process.exit(1);
  }
})();

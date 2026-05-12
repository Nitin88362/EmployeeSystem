// ============================================================
// EDITONE HRMS — Backend Server
// Express + MySQL + JWT
// ============================================================
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
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
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'editone_hrms',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
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
    const [rows] = await pool.execute('SELECT * FROM admin WHERE username = ?', [username]);
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
    const [rows] = await pool.execute('SELECT * FROM employees WHERE email = ?', [email.toLowerCase()]);
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
      const [rows] = await pool.execute('SELECT id, username, name, email FROM admin WHERE id = ?', [req.user.id]);
      return res.json({ ...rows[0], role: 'admin' });
    } else {
      const [rows] = await pool.execute('SELECT * FROM employees WHERE id = ?', [req.user.id]);
      return res.json(empToJSON(rows[0]));
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CONFIG
// ============================================================
app.get('/api/config', auth(), async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM config WHERE id = 1');
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
    await pool.execute(
      `UPDATE config SET office_in=?, office_out=?, overtime_cap=?, grace_period=?, working_days=?, ot_rate=?,
        office_name=?, office_lat=?, office_lng=?, max_distance=? WHERE id=1`,
      [c.officeIn, c.officeOut, c.overtimeCap, c.gracePeriod, c.workingDays, c.otRate,
       c.officeName, c.officeLat, c.officeLng, c.maxDistance]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Leave Types
app.get('/api/leave-types', auth(), async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM leave_types ORDER BY sort_order');
  res.json(rows.map(r => ({ id: r.id, name: r.name, annual: r.annual_quota, color: r.color, paid: !!r.is_paid })));
});

// ============================================================
// DEPARTMENTS
// ============================================================
app.get('/api/departments', auth(), async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM departments ORDER BY name');
  res.json(rows);
});

app.post('/api/departments', auth(['admin']), async (req, res) => {
  try {
    const id = uid();
    await pool.execute('INSERT INTO departments (id, name, head) VALUES (?, ?, ?)', [id, req.body.name, req.body.head || '']);
    res.json({ id, ...req.body });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/departments/:id', auth(['admin']), async (req, res) => {
  try {
    await pool.execute('UPDATE departments SET name=?, head=? WHERE id=?', [req.body.name, req.body.head || '', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/departments/:id', auth(['admin']), async (req, res) => {
  await pool.execute('DELETE FROM departments WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// EMPLOYEES
// ============================================================
function empToJSON(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeCode: r.employee_code,
    name: r.name,
    email: r.email,
    phone: r.phone,
    department: r.department,
    designation: r.designation,
    joinDate: r.join_date ? new Date(r.join_date).toISOString().split('T')[0] : null,
    dob: r.dob ? new Date(r.dob).toISOString().split('T')[0] : null,
    gender: r.gender,
    address: r.address,
    emergency: { name: r.emergency_name, phone: r.emergency_phone, relation: r.emergency_relation },
    salary: { basic: parseFloat(r.basic), hra: parseFloat(r.hra), allowances: parseFloat(r.allowances), total: parseFloat(r.basic) + parseFloat(r.hra) + parseFloat(r.allowances) },
    leaveBalance: typeof r.leave_balance === 'string' ? JSON.parse(r.leave_balance) : (r.leave_balance || {}),
    status: r.status,
    role: 'employee',
  };
}

app.get('/api/employees', auth(['admin']), async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM employees ORDER BY name');
  res.json(rows.map(empToJSON));
});

app.get('/api/employees/:id', auth(), async (req, res) => {
  // Employees can only fetch themselves; admins can fetch anyone
  if (req.user.role === 'employee' && req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
  const [rows] = await pool.execute('SELECT * FROM employees WHERE id=?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(empToJSON(rows[0]));
});

app.post('/api/employees', auth(['admin']), async (req, res) => {
  try {
    const e = req.body;
    const id = uid();
    const pwHash = await bcrypt.hash(e.password || 'changeme123', 10);
    const leaveBalance = JSON.stringify(e.leaveBalance || { casual: 12, sick: 12, earned: 15, lop: 0 });
    await pool.execute(
      `INSERT INTO employees (id, employee_code, name, email, password_hash, phone, department, designation,
       join_date, dob, gender, address, emergency_name, emergency_phone, emergency_relation,
       basic, hra, allowances, leave_balance, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, e.employeeCode || '', e.name, e.email.toLowerCase(), pwHash, e.phone || '',
       e.department || '', e.designation || '', e.joinDate || null, e.dob || null, e.gender || '',
       e.address || '', e.emergency?.name || '', e.emergency?.phone || '', e.emergency?.relation || '',
       e.salary?.basic || 0, e.salary?.hra || 0, e.salary?.allowances || 0,
       leaveBalance, 'active']
    );
    res.json({ id, success: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/employees/:id', auth(), async (req, res) => {
  try {
    // Employees can edit their own profile (limited); admins can edit anyone
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' });
    const e = req.body;
    
    if (isAdmin) {
      // Full update
      const fields = ['employee_code = ?', 'name = ?', 'email = ?', 'phone = ?', 'department = ?', 'designation = ?',
        'join_date = ?', 'dob = ?', 'gender = ?', 'address = ?',
        'emergency_name = ?', 'emergency_phone = ?', 'emergency_relation = ?',
        'basic = ?', 'hra = ?', 'allowances = ?', 'status = ?'];
      const params = [e.employeeCode || '', e.name, e.email.toLowerCase(), e.phone || '', e.department || '',
        e.designation || '', e.joinDate || null, e.dob || null, e.gender || '', e.address || '',
        e.emergency?.name || '', e.emergency?.phone || '', e.emergency?.relation || '',
        e.salary?.basic || 0, e.salary?.hra || 0, e.salary?.allowances || 0, e.status || 'active'];
      if (e.password) {
        fields.push('password_hash = ?');
        params.push(await bcrypt.hash(e.password, 10));
      }
      if (e.leaveBalance) {
        fields.push('leave_balance = ?');
        params.push(JSON.stringify(e.leaveBalance));
      }
      params.push(req.params.id);
      await pool.execute(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`, params);
    } else {
      // Employee self-edit (limited fields)
      const fields = ['phone = ?', 'address = ?', 'emergency_name = ?', 'emergency_phone = ?', 'emergency_relation = ?'];
      const params = [e.phone || '', e.address || '', e.emergency?.name || '', e.emergency?.phone || '', e.emergency?.relation || ''];
      if (e.password) {
        fields.push('password_hash = ?');
        params.push(await bcrypt.hash(e.password, 10));
      }
      params.push(req.params.id);
      await pool.execute(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`, params);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/employees/:id', auth(['admin']), async (req, res) => {
  await pool.execute('DELETE FROM employees WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// QR CODE
// ============================================================
app.get('/api/qr/today', auth(), async (req, res) => {
  const t = todayStr();
  let [rows] = await pool.execute('SELECT * FROM qr_codes WHERE date = ?', [t]);
  if (rows.length === 0) {
    const code = 'EDITONE-' + t + '-' + uid().toUpperCase();
    await pool.execute('INSERT INTO qr_codes (date, code) VALUES (?, ?)', [t, code]);
    return res.json({ date: t, code });
  }
  res.json({ date: rows[0].date.toISOString().split('T')[0], code: rows[0].code });
});

app.post('/api/qr/refresh', auth(['admin']), async (req, res) => {
  const t = todayStr();
  const code = 'EDITONE-' + t + '-' + uid().toUpperCase();
  await pool.execute('REPLACE INTO qr_codes (date, code) VALUES (?, ?)', [t, code]);
  res.json({ date: t, code });
});

// ============================================================
// ATTENDANCE
// ============================================================
function attToJSON(r) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    date: new Date(r.date).toISOString().split('T')[0],
    checkIn: r.check_in?.substring(0,5) || null,
    checkOut: r.check_out?.substring(0,5) || null,
    inStatus: r.in_status,
    outStatus: r.out_status,
    lateMinutes: r.late_minutes || 0,
    overtimeMinutes: r.overtime_minutes || 0,
    earlyOutMinutes: r.early_out_minutes || 0,
    workedMinutes: r.worked_minutes || 0,
    location: typeof r.check_in_location === 'string' ? JSON.parse(r.check_in_location) : r.check_in_location,
    checkOutLocation: typeof r.check_out_location === 'string' ? JSON.parse(r.check_out_location) : r.check_out_location,
    qrCode: r.qr_code,
    mode: r.mode,
    manualBy: r.manual_by,
    manualReason: r.manual_reason,
  };
}

app.get('/api/attendance', auth(), async (req, res) => {
  let sql = 'SELECT * FROM attendance WHERE 1=1';
  const params = [];
  if (req.user.role === 'employee') { sql += ' AND employee_id = ?'; params.push(req.user.id); }
  else if (req.query.employeeId) { sql += ' AND employee_id = ?'; params.push(req.query.employeeId); }
  if (req.query.from) { sql += ' AND date >= ?'; params.push(req.query.from); }
  if (req.query.to) { sql += ' AND date <= ?'; params.push(req.query.to); }
  sql += ' ORDER BY date DESC';
  const [rows] = await pool.execute(sql, params);
  res.json(rows.map(attToJSON));
});

function computeAtt(checkIn, checkOut, cfg) {
  const tm = t => { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+(m||0); };
  const oI = tm(cfg.officeIn), oO = tm(cfg.officeOut), cap = tm(cfg.overtimeCap);
  const iM = checkIn?tm(checkIn):0, oM = checkOut?tm(checkOut):0;
  const r = { lateMinutes:0, earlyOutMinutes:0, overtimeMinutes:0, workedMinutes:0, inStatus:'on-time', outStatus:'pending' };
  if (checkIn) {
    if (iM > oI + cfg.gracePeriod) { r.lateMinutes = iM - oI; r.inStatus='late'; }
    else if (iM < oI) r.inStatus='early';
  }
  if (checkOut) {
    r.workedMinutes = Math.max(0, Math.min(oM, cap) - Math.max(iM, 0));
    if (oM < oO) { r.earlyOutMinutes = oO - oM; r.outStatus='early-out'; }
    else if (oM > oO) { r.overtimeMinutes = Math.min(oM, cap) - oO; r.outStatus='overtime'; }
    else r.outStatus='on-time';
  }
  return r;
}

// Employee scans QR
app.post('/api/attendance/scan', auth(['employee']), async (req, res) => {
  try {
    const { qrCode, location } = req.body;
    const t = todayStr();
    // Verify QR
    const [qrRows] = await pool.execute('SELECT code FROM qr_codes WHERE date = ?', [t]);
    if (qrRows.length === 0 || qrRows[0].code !== qrCode) return res.status(400).json({ error: 'Invalid or expired QR code' });
    
    // Get config
    const [cfgRows] = await pool.execute('SELECT * FROM config WHERE id = 1');
    const cfg = {
      officeIn: cfgRows[0].office_in.substring(0,5),
      officeOut: cfgRows[0].office_out.substring(0,5),
      overtimeCap: cfgRows[0].overtime_cap.substring(0,5),
      gracePeriod: cfgRows[0].grace_period,
    };
    
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    // Check existing
    const [existing] = await pool.execute('SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [req.user.id, t]);
    
    if (existing.length === 0) {
      // Check-in
      const calc = computeAtt(now, null, cfg);
      const id = uid();
      await pool.execute(
        `INSERT INTO attendance (id, employee_id, date, check_in, in_status, late_minutes, check_in_location, qr_code, mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.id, t, now + ':00', calc.inStatus, calc.lateMinutes, JSON.stringify(location || {}), qrCode, 'office']
      );
      res.json({ action: 'check-in', time: now, ...calc });
    } else if (!existing[0].check_out) {
      // Check-out
      const calc = computeAtt(existing[0].check_in.substring(0,5), now, cfg);
      await pool.execute(
        `UPDATE attendance SET check_out=?, out_status=?, overtime_minutes=?, early_out_minutes=?, worked_minutes=?, check_out_location=? WHERE id=?`,
        [now + ':00', calc.outStatus, calc.overtimeMinutes, calc.earlyOutMinutes, calc.workedMinutes, JSON.stringify(location || {}), existing[0].id]
      );
      res.json({ action: 'check-out', time: now, ...calc });
    } else {
      res.status(400).json({ error: 'Already checked in and out today' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// LEAVES
// ============================================================
function leaveToJSON(r) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    type: r.type,
    fromDate: new Date(r.from_date).toISOString().split('T')[0],
    toDate: new Date(r.to_date).toISOString().split('T')[0],
    halfDay: !!r.half_day,
    reason: r.reason,
    status: r.status,
    appliedAt: r.applied_at,
    processedAt: r.processed_at,
    processedBy: r.processed_by,
  };
}

app.get('/api/leaves', auth(), async (req, res) => {
  let sql = 'SELECT * FROM leaves WHERE 1=1';
  const params = [];
  if (req.user.role === 'employee') { sql += ' AND employee_id = ?'; params.push(req.user.id); }
  sql += ' ORDER BY applied_at DESC';
  const [rows] = await pool.execute(sql, params);
  res.json(rows.map(leaveToJSON));
});

app.post('/api/leaves', auth(['employee']), async (req, res) => {
  try {
    const id = uid();
    await pool.execute(
      `INSERT INTO leaves (id, employee_id, type, from_date, to_date, half_day, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.user.id, req.body.type, req.body.fromDate, req.body.toDate, req.body.halfDay ? 1 : 0, req.body.reason]
    );
    res.json({ id, success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/leaves/:id/decision', auth(['admin']), async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    const [rows] = await pool.execute('SELECT * FROM leaves WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const lv = rows[0];
    
    await pool.execute('UPDATE leaves SET status=?, processed_at=NOW(), processed_by=? WHERE id=?', [status, req.user.name, req.params.id]);
    
    // Deduct leave balance if approved & paid
    if (status === 'approved') {
      const [ltRows] = await pool.execute('SELECT * FROM leave_types WHERE id = ?', [lv.type]);
      if (ltRows.length > 0 && ltRows[0].is_paid) {
        const [empRows] = await pool.execute('SELECT leave_balance FROM employees WHERE id = ?', [lv.employee_id]);
        let lb = typeof empRows[0].leave_balance === 'string' ? JSON.parse(empRows[0].leave_balance) : empRows[0].leave_balance;
        const days = (Math.floor((new Date(lv.to_date) - new Date(lv.from_date))/86400000) + 1) * (lv.half_day ? 0.5 : 1);
        lb[lv.type] = Math.max(0, (lb[lv.type] || 0) - days);
        await pool.execute('UPDATE employees SET leave_balance = ? WHERE id = ?', [JSON.stringify(lb), lv.employee_id]);
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// HOLIDAYS
// ============================================================
app.get('/api/holidays', auth(), async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM holidays ORDER BY date');
  res.json(rows.map(r => ({ id: r.id, date: new Date(r.date).toISOString().split('T')[0], name: r.name, type: r.type })));
});

app.post('/api/holidays', auth(['admin']), async (req, res) => {
  try {
    const id = uid();
    await pool.execute('INSERT INTO holidays (id, date, name, type) VALUES (?, ?, ?, ?)', [id, req.body.date, req.body.name, req.body.type || 'national']);
    res.json({ id, success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/holidays/:id', auth(['admin']), async (req, res) => {
  await pool.execute('DELETE FROM holidays WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// NOTICES
// ============================================================
app.get('/api/notices', auth(), async (req, res) => {
  let sql = 'SELECT * FROM notices';
  const params = [];
  if (req.user.role === 'employee') {
    sql += ' WHERE for_employee_id IS NULL OR for_employee_id = ?';
    params.push(req.user.id);
  }
  sql += ' ORDER BY posted_at DESC';
  const [rows] = await pool.execute(sql, params);
  res.json(rows.map(r => ({
    id: r.id, title: r.title, body: r.body, priority: r.priority,
    forEmployeeId: r.for_employee_id, postedBy: r.posted_by, postedAt: r.posted_at
  })));
});

app.post('/api/notices', auth(['admin']), async (req, res) => {
  try {
    const id = uid();
    await pool.execute(
      'INSERT INTO notices (id, title, body, priority, for_employee_id, posted_by) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.body.title, req.body.body, req.body.priority || 'normal', req.body.forEmployeeId || null, req.user.name]
    );
    res.json({ id, success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notices/:id', auth(['admin']), async (req, res) => {
  await pool.execute('DELETE FROM notices WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// REGULARIZATIONS
// ============================================================
app.get('/api/regularizations', auth(), async (req, res) => {
  let sql = 'SELECT * FROM regularizations WHERE 1=1';
  const params = [];
  if (req.user.role === 'employee') { sql += ' AND employee_id = ?'; params.push(req.user.id); }
  sql += ' ORDER BY applied_at DESC';
  const [rows] = await pool.execute(sql, params);
  res.json(rows.map(r => ({
    id: r.id, employeeId: r.employee_id, date: new Date(r.date).toISOString().split('T')[0],
    checkIn: r.check_in?.substring(0,5), checkOut: r.check_out?.substring(0,5),
    reason: r.reason, status: r.status, appliedAt: r.applied_at, processedAt: r.processed_at, processedBy: r.processed_by
  })));
});

app.post('/api/regularizations', auth(['employee']), async (req, res) => {
  try {
    const id = uid();
    await pool.execute(
      'INSERT INTO regularizations (id, employee_id, date, check_in, check_out, reason, status) VALUES (?, ?, ?, ?, ?, ?, "pending")',
      [id, req.user.id, req.body.date, req.body.checkIn || null, req.body.checkOut || null, req.body.reason]
    );
    res.json({ id, success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/regularizations/:id/decision', auth(['admin']), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM regularizations WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];
    await pool.execute('UPDATE regularizations SET status=?, processed_at=NOW(), processed_by=? WHERE id=?',
      [req.body.status, req.user.name, req.params.id]);
    
    // If approved, create attendance entry
    if (req.body.status === 'approved') {
      const [cfgRows] = await pool.execute('SELECT * FROM config WHERE id = 1');
      const cfg = {
        officeIn: cfgRows[0].office_in.substring(0,5),
        officeOut: cfgRows[0].office_out.substring(0,5),
        overtimeCap: cfgRows[0].overtime_cap.substring(0,5),
        gracePeriod: cfgRows[0].grace_period,
      };
      const inT = r.check_in?.substring(0,5), outT = r.check_out?.substring(0,5);
      const calc = computeAtt(inT, outT, cfg);
      const id = uid();
      try {
        await pool.execute(
          `INSERT INTO attendance (id, employee_id, date, check_in, check_out, in_status, out_status,
           late_minutes, overtime_minutes, early_out_minutes, worked_minutes,
           check_in_location, mode, manual_by, manual_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, r.employee_id, r.date, inT ? inT + ':00' : null, outT ? outT + ':00' : null,
           calc.inStatus, calc.outStatus, calc.lateMinutes, calc.overtimeMinutes, calc.earlyOutMinutes, calc.workedMinutes,
           JSON.stringify({label: 'Manually regularized', lat: 0, lng: 0}), 'manual', req.user.name, r.reason]
        );
      } catch (e) { /* may already exist */ }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PAYROLL
// ============================================================
function payrollToJSON(r) {
  return {
    id: r.id, employeeId: r.employee_id, month: r.month, year: r.year,
    workingDays: r.working_days, presentDays: r.present_days,
    paidLeaveDays: parseFloat(r.paid_leave_days) || 0, lopDays: parseFloat(r.lop_days) || 0,
    totalLateMin: r.total_late_min || 0, totalOTMin: r.total_ot_min || 0,
    earnings: typeof r.earnings === 'string' ? JSON.parse(r.earnings) : r.earnings,
    deductions: typeof r.deductions === 'string' ? JSON.parse(r.deductions) : r.deductions,
    netSalary: parseFloat(r.net_salary) || 0,
    status: r.status, processedAt: r.processed_at, processedBy: r.processed_by,
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString().split('T')[0] : null,
    paymentMode: r.payment_mode, transactionId: r.transaction_id,
    paymentRemarks: r.payment_remarks, paidBy: r.paid_by,
  };
}

app.get('/api/payroll', auth(), async (req, res) => {
  let sql = 'SELECT * FROM payroll WHERE 1=1';
  const params = [];
  if (req.user.role === 'employee') { sql += ' AND employee_id = ?'; params.push(req.user.id); }
  else if (req.query.employeeId) { sql += ' AND employee_id = ?'; params.push(req.query.employeeId); }
  if (req.query.month !== undefined) { sql += ' AND month = ?'; params.push(req.query.month); }
  if (req.query.year !== undefined) { sql += ' AND year = ?'; params.push(req.query.year); }
  sql += ' ORDER BY year DESC, month DESC';
  const [rows] = await pool.execute(sql, params);
  res.json(rows.map(payrollToJSON));
});

// Process payroll for an employee for a month
app.post('/api/payroll/process', auth(['admin']), async (req, res) => {
  try {
    const { employeeId, month, year } = req.body;
    
    // Load employee, config, attendance, leaves, holidays
    const [empRows] = await pool.execute('SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (empRows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRows[0];
    
    const [cfgRows] = await pool.execute('SELECT * FROM config WHERE id = 1');
    const cfg = cfgRows[0];
    
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;
    const [attRows] = await pool.execute('SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?', [employeeId, monthStr + '%']);
    const [lvRows] = await pool.execute('SELECT * FROM leaves WHERE employee_id = ? AND status = "approved" AND (from_date LIKE ? OR to_date LIKE ?)',
      [employeeId, monthStr + '%', monthStr + '%']);
    const [holRows] = await pool.execute('SELECT * FROM holidays WHERE date LIKE ?', [monthStr + '%']);
    const [ltRows] = await pool.execute('SELECT * FROM leave_types');
    
    // Calculate working days
    const daysInMonth = new Date(year, month+1, 0).getDate();
    let workingDays = 0;
    for (let d=1; d<=daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const dow = dt.getDay();
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isOff = cfg.working_days >= 6 ? (dow === 0) : (dow === 0 || dow === 6);
      const isHoliday = holRows.some(h => h.date.toISOString().split('T')[0] === ds);
      if (!isOff && !isHoliday) workingDays++;
    }
    
    const salary = { basic: parseFloat(emp.basic), hra: parseFloat(emp.hra), allowances: parseFloat(emp.allowances) };
    const totalSal = salary.basic + salary.hra + salary.allowances;
    const perDay = workingDays > 0 ? totalSal / workingDays : 0;
    const perHour = perDay / 8;
    
    const presentDays = attRows.length;
    const totalLateMin = attRows.reduce((s,a) => s + (a.late_minutes||0), 0);
    const totalOTMin = attRows.reduce((s,a) => s + (a.overtime_minutes||0), 0);
    
    let paidLeaveDays = 0, lopDays = 0;
    lvRows.forEach(lv => {
      const days = (Math.floor((new Date(lv.to_date) - new Date(lv.from_date))/86400000) + 1) * (lv.half_day ? 0.5 : 1);
      const lt = ltRows.find(t => t.id === lv.type);
      if (lt && lt.is_paid) paidLeaveDays += days; else lopDays += days;
    });
    
    const lopDeduction = Math.round(perDay * lopDays);
    const lateDeduction = totalLateMin > 60 ? Math.round((totalLateMin/60) * perHour * 0.5) : 0;
    const otBonus = Math.round((totalOTMin/60) * perHour * (parseFloat(cfg.ot_rate) || 1.5));
    const pf = Math.round(salary.basic * 0.12);
    
    const earnings = { ...salary, otBonus, total: totalSal + otBonus };
    const deductions = { pf, lop: lopDeduction, late: lateDeduction, total: pf + lopDeduction + lateDeduction };
    const netSalary = earnings.total - deductions.total;
    
    // Check if exists
    const [existing] = await pool.execute('SELECT id, status, paid_at, payment_mode, transaction_id, payment_remarks, paid_by FROM payroll WHERE employee_id = ? AND month = ? AND year = ?', [employeeId, month, year]);
    
    if (existing.length > 0) {
      // Update but preserve payment info
      const e = existing[0];
      await pool.execute(
        `UPDATE payroll SET working_days=?, present_days=?, paid_leave_days=?, lop_days=?, total_late_min=?, total_ot_min=?,
         earnings=?, deductions=?, net_salary=?, processed_at=NOW(), processed_by=? WHERE id=?`,
        [workingDays, presentDays, paidLeaveDays, lopDays, totalLateMin, totalOTMin,
         JSON.stringify(earnings), JSON.stringify(deductions), netSalary, req.user.name, e.id]
      );
      return res.json({ id: e.id, success: true, updated: true });
    }
    
    const id = uid();
    await pool.execute(
      `INSERT INTO payroll (id, employee_id, month, year, working_days, present_days, paid_leave_days, lop_days,
       total_late_min, total_ot_min, earnings, deductions, net_salary, status, processed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, employeeId, month, year, workingDays, presentDays, paidLeaveDays, lopDays,
       totalLateMin, totalOTMin, JSON.stringify(earnings), JSON.stringify(deductions), netSalary, req.user.name]
    );
    res.json({ id, success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Mark payroll as paid
app.put('/api/payroll/:id/pay', auth(['admin']), async (req, res) => {
  try {
    const { paidAt, paymentMode, transactionId, paymentRemarks } = req.body;
    const [pRows] = await pool.execute('SELECT * FROM payroll WHERE id = ?', [req.params.id]);
    if (pRows.length === 0) return res.status(404).json({ error: 'Not found' });
    const p = pRows[0];
    const [empRows] = await pool.execute('SELECT name FROM employees WHERE id = ?', [p.employee_id]);
    
    await pool.execute(
      `UPDATE payroll SET status='paid', paid_at=?, payment_mode=?, transaction_id=?, payment_remarks=?, paid_by=? WHERE id=?`,
      [paidAt, paymentMode, transactionId || null, paymentRemarks || null, req.user.name, req.params.id]
    );
    
    // Auto-create notice for employee
    const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][p.month];
    const inr = n => '₹' + parseFloat(n).toLocaleString('en-IN');
    const noticeId = uid();
    await pool.execute(
      `INSERT INTO notices (id, title, body, priority, for_employee_id, posted_by) VALUES (?, ?, ?, 'medium', ?, ?)`,
      [noticeId,
       `💰 Salary Credited · ${monthName} ${p.year}`,
       `Dear ${empRows[0].name},\n\nAap ki ${monthName} ${p.year} ki salary ${inr(p.net_salary)} ${paymentMode} ke through transfer ho gayi hai${transactionId?` (TXN: ${transactionId})`:''}.\n\nPayslip aap apne Payslips tab mein dekh sakte hain.${paymentRemarks?`\n\nNote: ${paymentRemarks}`:''}\n\n— HR, Editone International`,
       p.employee_id, req.user.name]
    );
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/payroll/:id', auth(['admin']), async (req, res) => {
  await pool.execute('DELETE FROM payroll WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// SERVE FRONTEND
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START
// ============================================================
(async () => {
  try {
    await pool.execute('SELECT 1');
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

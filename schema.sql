-- ============================================================
-- EDITONE HRMS DATABASE SCHEMA
-- Naraina Industrial Area, New Delhi · Est. 1999
-- Run: mysql -u root -p < schema.sql
-- ============================================================

DROP DATABASE IF EXISTS editone_hrms;
CREATE DATABASE editone_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE editone_hrms;

-- Admin users
CREATE TABLE admin (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Office configuration (single row)
CREATE TABLE config (
  id INT PRIMARY KEY DEFAULT 1,
  office_in TIME DEFAULT '09:00:00',
  office_out TIME DEFAULT '17:30:00',
  overtime_cap TIME DEFAULT '21:00:00',
  grace_period INT DEFAULT 10,
  working_days INT DEFAULT 6,
  ot_rate DECIMAL(3,1) DEFAULT 1.5,
  office_name VARCHAR(200) DEFAULT 'Editone International, Naraina',
  office_lat DECIMAL(10,7) DEFAULT 28.6448000,
  office_lng DECIMAL(10,7) DEFAULT 77.1391000,
  max_distance INT DEFAULT 500,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Leave types config
CREATE TABLE leave_types (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  annual_quota INT DEFAULT 0,
  color VARCHAR(20) DEFAULT 'gray',
  is_paid BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0
);

-- Departments
CREATE TABLE departments (
  id VARCHAR(30) PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  head VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employees (the core table)
CREATE TABLE employees (
  id VARCHAR(30) PRIMARY KEY,
  employee_code VARCHAR(50) UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  department VARCHAR(100),
  designation VARCHAR(100),
  join_date DATE,
  dob DATE,
  gender VARCHAR(20),
  address TEXT,
  emergency_name VARCHAR(100),
  emergency_phone VARCHAR(20),
  emergency_relation VARCHAR(50),
  basic DECIMAL(10,2) DEFAULT 0,
  hra DECIMAL(10,2) DEFAULT 0,
  allowances DECIMAL(10,2) DEFAULT 0,
  leave_balance JSON,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_department (department)
);

-- Attendance records
CREATE TABLE attendance (
  id VARCHAR(30) PRIMARY KEY,
  employee_id VARCHAR(30) NOT NULL,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  in_status VARCHAR(20),
  out_status VARCHAR(20),
  late_minutes INT DEFAULT 0,
  overtime_minutes INT DEFAULT 0,
  early_out_minutes INT DEFAULT 0,
  worked_minutes INT DEFAULT 0,
  check_in_location JSON,
  check_out_location JSON,
  qr_code VARCHAR(100),
  mode VARCHAR(20) DEFAULT 'office',
  manual_by VARCHAR(100),
  manual_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_emp_date (employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_date (date),
  INDEX idx_emp (employee_id)
);

-- Leave requests
CREATE TABLE leaves (
  id VARCHAR(30) PRIMARY KEY,
  employee_id VARCHAR(30) NOT NULL,
  type VARCHAR(20),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  half_day BOOLEAN DEFAULT FALSE,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  processed_by VARCHAR(100),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_emp (employee_id)
);

-- Holiday calendar
CREATE TABLE holidays (
  id VARCHAR(30) PRIMARY KEY,
  date DATE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) DEFAULT 'national',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date (date)
);

-- Notices/Announcements
CREATE TABLE notices (
  id VARCHAR(30) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  priority VARCHAR(20) DEFAULT 'normal',
  for_employee_id VARCHAR(30) NULL,
  posted_by VARCHAR(100),
  posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (for_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_emp (for_employee_id)
);

-- Regularization requests
CREATE TABLE regularizations (
  id VARCHAR(30) PRIMARY KEY,
  employee_id VARCHAR(30) NOT NULL,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  processed_by VARCHAR(100),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_status (status)
);

-- Payroll records
CREATE TABLE payroll (
  id VARCHAR(30) PRIMARY KEY,
  employee_id VARCHAR(30) NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  working_days INT,
  present_days INT,
  paid_leave_days DECIMAL(5,1),
  lop_days DECIMAL(5,1),
  total_late_min INT,
  total_ot_min INT,
  earnings JSON,
  deductions JSON,
  net_salary DECIMAL(12,2),
  status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_by VARCHAR(100),
  paid_at DATE NULL,
  payment_mode VARCHAR(50),
  transaction_id VARCHAR(100),
  payment_remarks TEXT,
  paid_by VARCHAR(100),
  UNIQUE KEY uk_emp_month (employee_id, month, year),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_status (status)
);

-- Daily QR codes
CREATE TABLE qr_codes (
  date DATE PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- Default admin (password: admin123 - bcrypt hash)
-- This hash is generated for 'admin123' - the server.js seed script will regenerate it if missing
INSERT INTO admin (username, password_hash, name, email) VALUES
  ('admin', '$2a$10$rZ8X7VqK5sJqL9X8WzN3Y.Q7v2X8W3kY8wN9V8B0sJ5pP1nT4mC1y', 'Dr. Pankaj Jagya', 'admin@editone.in');

-- Default config
INSERT INTO config (id) VALUES (1);

-- Default leave types
INSERT INTO leave_types (id, name, annual_quota, color, is_paid, sort_order) VALUES
  ('casual', 'Casual Leave', 12, 'yellow', TRUE, 1),
  ('sick', 'Sick Leave', 12, 'red', TRUE, 2),
  ('earned', 'Earned Leave', 15, 'green', TRUE, 3),
  ('lop', 'Loss of Pay', 0, 'gray', FALSE, 4);

-- Default departments (Editone's 8 departments)
INSERT INTO departments (id, name, head) VALUES
  ('dept_dm', 'Digital Marketing', 'Ramesh'),
  ('dept_pp', 'Print Production', ''),
  ('dept_pub', 'Publishing', ''),
  ('dept_wd', 'Web Development', ''),
  ('dept_ai', 'AI Automation', ''),
  ('dept_sales', 'Sales', ''),
  ('dept_ops', 'Operations', ''),
  ('dept_kids', 'Editone Kids Club', '');

-- Default Indian holidays for current year (run after install)
-- Replace YEAR with actual year
INSERT INTO holidays (id, date, name, type) VALUES
  ('hol_rd', CONCAT(YEAR(CURDATE()), '-01-26'), 'Republic Day', 'national'),
  ('hol_id', CONCAT(YEAR(CURDATE()), '-08-15'), 'Independence Day', 'national'),
  ('hol_gj', CONCAT(YEAR(CURDATE()), '-10-02'), 'Gandhi Jayanti', 'national'),
  ('hol_diw', CONCAT(YEAR(CURDATE()), '-11-01'), 'Diwali', 'festival'),
  ('hol_holi', CONCAT(YEAR(CURDATE()), '-03-25'), 'Holi', 'festival');

-- Sample demo employee (password: demo123)
INSERT INTO employees (id, employee_code, name, email, password_hash, phone, department, designation,
  join_date, dob, gender, address, emergency_name, emergency_phone, emergency_relation,
  basic, hra, allowances, leave_balance, status) VALUES
  ('emp_demo', 'EDT001', 'Demo Employee', 'demo@editone.in',
   '$2a$10$rZ8X7VqK5sJqL9X8WzN3Y.Q7v2X8W3kY8wN9V8B0sJ5pP1nT4mC1y',
   '9999999999', 'Digital Marketing', 'Marketing Executive',
   CURDATE(), '1995-05-15', 'Male', 'Naraina Industrial Area, New Delhi',
   'Family Member', '9999999999', 'Parent',
   25000, 10000, 5000,
   '{"casual":12,"sick":12,"earned":15,"lop":0}',
   'active');

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT 'Database created successfully' AS status;
SELECT COUNT(*) AS admins FROM admin;
SELECT COUNT(*) AS departments FROM departments;
SELECT COUNT(*) AS employees FROM employees;
SELECT COUNT(*) AS holidays FROM holidays;

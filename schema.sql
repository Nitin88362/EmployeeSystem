-- ============================================================
-- EDITONE HRMS DATABASE SCHEMA - PostgreSQL Version
-- Naraina Industrial Area, New Delhi · Est. 1999
-- Run: psql -U postgres -d postgres -f schema_postgresql.sql
-- ============================================================

DROP DATABASE IF EXISTS editone_hrms;
CREATE DATABASE editone_hrms;
\c editone_hrms;

-- Admin users
CREATE TABLE admin (
  id SERIAL PRIMARY KEY,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employees
CREATE TABLE employees (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20),
  department VARCHAR(30) REFERENCES departments(id),
  designation VARCHAR(100),
  ctc DECIMAL(10,2) DEFAULT 0,
  doj DATE,
  password_hash VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QR codes (daily unique)
CREATE TABLE qr_codes (
  id VARCHAR(50) PRIMARY KEY,
  qr_date DATE UNIQUE NOT NULL,
  qr_secret VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance records
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(20) REFERENCES employees(id),
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  location_lat DECIMAL(10,7),
  location_lng DECIMAL(10,7),
  location_accuracy INT,
  qr_id VARCHAR(50) REFERENCES qr_codes(id),
  late_by INT,
  early_by INT,
  overtime INT,
  status VARCHAR(20) DEFAULT 'present',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, date)
);

-- Leave applications
CREATE TABLE leaves (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(20) REFERENCES employees(id),
  leave_type VARCHAR(20) REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INT NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by VARCHAR(20),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Holidays
CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  date DATE UNIQUE NOT NULL,
  type VARCHAR(20) DEFAULT 'national',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payroll
CREATE TABLE payroll (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(20) REFERENCES employees(id),
  month INT NOT NULL,
  year INT NOT NULL,
  basic_salary DECIMAL(10,2),
  hra DECIMAL(10,2),
  conveyance DECIMAL(10,2),
  medical DECIMAL(10,2),
  special_allowance DECIMAL(10,2),
  gross_salary DECIMAL(10,2),
  pf_deduction DECIMAL(10,2),
  esi_deduction DECIMAL(10,2),
  professional_tax DECIMAL(10,2),
  tds DECIMAL(10,2),
  other_deductions DECIMAL(10,2),
  total_deductions DECIMAL(10,2),
  net_salary DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'draft',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, month, year)
);

-- Notices
CREATE TABLE notices (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal',
  valid_from DATE,
  valid_until DATE,
  created_by VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance regularizations
CREATE TABLE regularizations (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(20) REFERENCES employees(id),
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by VARCHAR(20),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin
INSERT INTO admin (username, password_hash, name, email) 
VALUES ('admin', '$2a$10$placeholder_hash_change_me', 'Dr. Pankaj Jagya', 'admin@editone.in');

-- Insert default departments (Editone ke)
INSERT INTO departments (id, name) VALUES
('HR', 'Human Resources'),
('FIN', 'Finance & Accounts'),
('PROD', 'Production'),
('QA', 'Quality Assurance'),
('SALES', 'Sales & Marketing'),
('IT', 'Information Technology'),
('ADMIN', 'Administration'),
('MAINT', 'Maintenance');

-- Insert leave types
INSERT INTO leave_types (id, name, annual_quota, color, is_paid, sort_order) VALUES
('CL', 'Casual Leave', 12, 'blue', TRUE, 1),
('SL', 'Sick Leave', 12, 'green', TRUE, 2),
('EL', 'Earned Leave', 15, 'purple', TRUE, 3),
('LWP', 'Leave Without Pay', 0, 'gray', FALSE, 4),
('COMP', 'Compensatory Off', 0, 'orange', TRUE, 5);

-- Insert default Indian holidays
INSERT INTO holidays (name, date, type) VALUES
('Republic Day', '2026-01-26', 'national'),
('Independence Day', '2026-08-15', 'national'),
('Gandhi Jayanti', '2026-10-02', 'national'),
('Diwali', '2026-10-20', 'festival'),
('Holi', '2026-03-14', 'festival');

-- Insert demo employee
INSERT INTO employees (id, name, email, phone, department, designation, ctc, doj, password_hash) 
VALUES ('EMP001', 'Demo Employee', 'demo@editone.in', '9876543210', 'IT', 'Software Developer', 480000, '2024-01-01', '$2a$10$demo_hash_change_me');

-- Insert default office config
INSERT INTO config (office_in, office_out, overtime_cap, grace_period, working_days, ot_rate, office_name, office_lat, office_lng, max_distance) 
VALUES ('09:00:00', '17:30:00', '21:00:00', 10, 6, 1.5, 'Editone International, Naraina', 28.6448000, 77.1391000, 500);

-- Create indexes for performance
CREATE INDEX idx_attendance_employee_date ON attendance(employee_id, date);
CREATE INDEX idx_leaves_employee ON leaves(employee_id);
CREATE INDEX idx_payroll_employee_month_year ON payroll(employee_id, month, year);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_qr_codes_date ON qr_codes(qr_date);

COMMIT;

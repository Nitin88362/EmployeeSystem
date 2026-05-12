# Editone HRMS — Production Deployment Guide

Complete workforce management system jisme attendance, payroll, leaves, holidays, notices, reports — sab kuch hai.

**Stack:** Node.js + Express + MySQL + JWT + Vanilla JS Frontend

---

## 📋 Requirements

Server pe yeh installed hone chahiye:

1. **Node.js 18+** — Download: https://nodejs.org/
2. **MySQL 5.7+ / MariaDB 10+** — XAMPP install karenge toh MySQL milta hai included
3. **Git** (optional, for cloning)

Verify karne ke liye:
```bash
node --version
npm --version
mysql --version
```

---

## 🚀 Setup (One-Time, 5 Minutes)

### Step 1: Project Folder

Project folder ko apne computer pe rakhein (e.g., `C:\editone-hrms` ya `/var/www/editone-hrms`).

### Step 2: Dependencies Install

Terminal/Command Prompt open karein, project folder mein jaayein:

```bash
cd path/to/editone-hrms
npm install
```

Yeh `express`, `mysql2`, `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv` install karega.

### Step 3: .env File Banayein

`.env.example` ko copy karke `.env` rakhein, phir MySQL credentials update karein:

**Windows:**
```bash
copy .env.example .env
```

**Linux/Mac:**
```bash
cp .env.example .env
```

`.env` file edit karein:
```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD_HERE
DB_NAME=editone_hrms

JWT_SECRET=editone-secret-key-change-this-to-random-string-2026
JWT_EXPIRY=7d

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_NAME=Dr. Pankaj Jagya
ADMIN_EMAIL=admin@editone.in
```

⚠️ **Important**: 
- `DB_PASSWORD` mein apna MySQL ka password daalein (XAMPP mein default blank hota hai)
- `JWT_SECRET` ko production mein random long string banayein
- `ADMIN_PASSWORD` change karein production ke liye

### Step 4: Database Setup

MySQL chal raha hona chahiye (XAMPP control panel se start kar lein):

```bash
npm run setup
```

Yeh automatically:
- `editone_hrms` database banayega
- Saari tables create karega
- 8 departments insert karega (Editone ke)
- 5 default Indian holidays add karega (Republic Day, Independence Day, etc.)
- Default admin aur demo employee create karega with bcrypt hashed passwords

Successful output dikhna chahiye:
```
✓ Connected to MySQL
✓ Loaded schema.sql
✓ Database & tables created
✓ Admin password hashed
✓ Demo employee password hashed

✅ Setup Complete!
```

### Step 5: Server Start

```bash
npm start
```

Yeh dikhega:
```
✓ Database connected

🚀 Editone HRMS Server Running

   Local:    http://localhost:3000
   Network:  http://<your-ip>:3000

   Admin login: admin / admin123
   Demo emp:    demo@editone.in / demo123
```

### Step 6: Browser Open

Browser mein jayein: **http://localhost:3000**

**Login:**
- Admin: `admin` / `admin123`
- Demo Employee: `demo@editone.in` / `demo123`

---

## 🔧 Manual Database Setup (if `npm run setup` fails)

Agar setup script fail ho jaye toh manual setup karein:

```bash
mysql -u root -p < schema.sql
```

Yeh database aur tables bana dega. Phir server start kar dein (`npm start`).

---

## 🌐 Network Access (Office Mein Sab Computers Se)

Server start hone ke baad, **same WiFi/LAN** pe baaki computers se bhi access kar sakte hain:

1. Server computer ka IP find karein:
   - **Windows:** `ipconfig` → IPv4 Address
   - **Mac/Linux:** `ifconfig` → inet
   - Example: `192.168.1.50`

2. Doosre computers/mobiles pe browser khol kar: `http://192.168.1.50:3000`

3. Firewall mein port 3000 allow karein agar block ho

---

## 📱 Mobile QR Scanning

Employees apne mobile pe browser khol kar (Chrome/Safari):
1. `http://192.168.1.50:3000` jaayein
2. Employee login karein
3. Scan tab → Camera permission allow → QR scan
4. Location permission allow karein (anti-fake verification ke liye)

---

## 🚢 Production Deployment

### Option A: Linux Server (VPS / Cloud)

**Ubuntu/Debian server pe:**

```bash
# Node.js install
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs mysql-server

# Project upload (use scp, rsync, or git)
cd /var/www
git clone <your-repo> editone-hrms
cd editone-hrms

# Install & setup
npm install
cp .env.example .env
nano .env  # update credentials
npm run setup

# PM2 for production (keeps server running)
sudo npm install -g pm2
pm2 start server.js --name editone-hrms
pm2 startup
pm2 save
```

### Option B: Nginx Reverse Proxy + HTTPS

`/etc/nginx/sites-available/editone-hrms`:
```nginx
server {
    listen 80;
    server_name hrms.editone.in;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then enable + SSL:
```bash
sudo ln -s /etc/nginx/sites-available/editone-hrms /etc/nginx/sites-enabled/
sudo certbot --nginx -d hrms.editone.in
sudo systemctl reload nginx
```

### Option C: Shared Hosting (cPanel)

cPanel mein:
1. **Node.js Selector** se naye app create karein
2. Application root: `editone-hrms`
3. Application startup file: `server.js`
4. Node version: 18+
5. Files upload karein (FileManager/FTP)
6. Terminal se `npm install` aur `npm run setup`
7. **MySQL Databases** se database create karein, `.env` mein credentials daalein
8. App start karein cPanel se

---

## 📁 Folder Structure

```
editone-hrms/
├── server.js          ← Backend (Express + MySQL)
├── setup.js           ← One-time database setup
├── schema.sql         ← MySQL database schema
├── package.json       ← Dependencies
├── .env.example       ← Environment template
├── .env               ← Your actual config (DON'T commit to git)
├── README.md          ← This file
└── public/
    └── index.html     ← Frontend (single page app)
```

---

## 🔌 API Endpoints Reference

All endpoints require `Authorization: Bearer <token>` header (except login).

### Auth
- `POST /api/auth/admin-login` — Admin login
- `POST /api/auth/employee-login` — Employee login
- `GET /api/auth/me` — Current user info

### Employees (admin only for CUD)
- `GET /api/employees` — List all
- `GET /api/employees/:id` — Get one
- `POST /api/employees` — Create
- `PUT /api/employees/:id` — Update (employees can edit own limited fields)
- `DELETE /api/employees/:id` — Delete

### Attendance
- `GET /api/attendance?employeeId=X&from=Y&to=Z` — List records
- `POST /api/attendance/scan` — Employee scans QR (with location)
- `GET /api/qr/today` — Today's QR
- `POST /api/qr/refresh` — Regenerate today's QR

### Leaves
- `GET /api/leaves` — List
- `POST /api/leaves` — Apply (employee)
- `PUT /api/leaves/:id/decision` — Approve/reject (admin)

### Payroll
- `GET /api/payroll?employeeId=X&month=M&year=Y` — List
- `POST /api/payroll/process` — Process for employee+month+year
- `PUT /api/payroll/:id/pay` — Mark as paid (creates auto-notice)
- `DELETE /api/payroll/:id` — Delete

### Notices, Holidays, Regularizations, Departments, Config
- Similar REST patterns

---

## 🐛 Troubleshooting

**"Database connection failed"**
- MySQL chal raha hai? XAMPP control panel check karein
- `.env` mein `DB_PASSWORD` sahi hai?
- `npm run setup` chalaya?

**"Port 3000 already in use"**
- `.env` mein `PORT=3001` (or any other) karein
- Ya phir running process kill karein

**"Invalid credentials"**
- Default password change ho gaya? `.env` mein `ADMIN_PASSWORD` check karein
- `npm run setup` dobara chalayein password reset karne ke liye (data delete ho jayega)

**Camera not opening on mobile**
- HTTPS chahiye production mein (camera API HTTPS required hai modern browsers mein)
- Localhost pe HTTP chalega, but network IP pe HTTPS needed

**Location not capturing**
- Browser mein location permission allow karein
- HTTPS pe deploy karna padega remote access ke liye

---

## 🔒 Security Checklist (Production)

- [ ] `.env` ko git mein commit NA karein (already in .gitignore)
- [ ] `JWT_SECRET` ko long random string banayein
- [ ] `ADMIN_PASSWORD` change karein from default
- [ ] HTTPS enable karein (Let's Encrypt free hai)
- [ ] MySQL user ko sirf required permissions dein (not root in production)
- [ ] Regular database backups (`mysqldump -u root -p editone_hrms > backup.sql`)
- [ ] Server firewall configure karein (UFW/iptables)

---

## 📞 Support

Yeh system aapke liye custom-built hai. Customization, features, ya issues ke liye:
- Backend: `server.js` mein routes modify karein
- Frontend: `public/index.html` mein UI change karein
- Database: `schema.sql` mein structure update karein

---

## 📜 License

Built for Editone International Pvt. Ltd. — Naraina Industrial Area, New Delhi
© 2026 · All rights reserved.

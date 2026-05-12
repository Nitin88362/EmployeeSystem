# API Testing Quick Reference

Server start hone ke baad, yeh cURL commands se test kar sakte hain:

## 1. Admin Login
```bash
curl -X POST http://localhost:3000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Response mein `token` milega. Use it in subsequent requests:
```bash
TOKEN="paste-token-here"
```

## 2. List Employees
```bash
curl http://localhost:3000/api/employees -H "Authorization: Bearer $TOKEN"
```

## 3. Add Employee
```bash
curl -X POST http://localhost:3000/api/employees \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeCode":"EDT002",
    "name":"Ramesh Kumar",
    "email":"ramesh@editone.in",
    "password":"ramesh123",
    "phone":"9876543210",
    "department":"Digital Marketing",
    "designation":"Manager",
    "joinDate":"2024-01-15",
    "salary":{"basic":35000,"hra":15000,"allowances":10000}
  }'
```

## 4. Employee Login & Scan QR
```bash
curl -X POST http://localhost:3000/api/auth/employee-login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@editone.in","password":"demo123"}'
```

```bash
EMP_TOKEN="paste-employee-token-here"

# Get today's QR
curl http://localhost:3000/api/qr/today -H "Authorization: Bearer $EMP_TOKEN"

# Scan QR (check-in)
curl -X POST http://localhost:3000/api/attendance/scan \
  -H "Authorization: Bearer $EMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "qrCode":"EDITONE-2026-05-12-XXXXX",
    "location":{"lat":28.6448,"lng":77.1391,"label":"Office","accuracy":15}
  }'
```

## 5. Process Payroll (Admin)
```bash
curl -X POST http://localhost:3000/api/payroll/process \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"emp_demo","month":4,"year":2026}'
```

## 6. Mark Salary Paid
```bash
curl -X PUT http://localhost:3000/api/payroll/PAYROLL_ID/pay \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paidAt":"2026-05-01",
    "paymentMode":"Bank Transfer (NEFT)",
    "transactionId":"UTR123456789",
    "paymentRemarks":"April salary"
  }'
```

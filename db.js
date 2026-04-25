const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// 1. Create Companies Table
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )
`);

// 2. Create Users Table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL, -- 'Super Admin', 'Admin', 'User'
    company_id INTEGER,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  )
`);

// 3. Create Providers Table
db.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    providerId TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    coverage TEXT NOT NULL,
    employees INTEGER NOT NULL,
    contractEnd TEXT NOT NULL,
    status TEXT NOT NULL,
    company_id INTEGER NOT NULL,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  )
`);

// 4. Create Employees Table
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId TEXT NOT NULL,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    department TEXT NOT NULL,
    company_id INTEGER NOT NULL,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  )
`);

// 5. Create Diagnoses Table (Master Data)
db.exec(`
  CREATE TABLE IF NOT EXISTS diagnoses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL
  )
`);

// 6. Create Claims Table
db.exec(`
  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claimId TEXT NOT NULL,
    employee_id INTEGER NOT NULL,
    diagnosis_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    claimDate TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(employee_id) REFERENCES employees(id),
    FOREIGN KEY(diagnosis_id) REFERENCES diagnoses(id),
    FOREIGN KEY(provider_id) REFERENCES providers(id),
    FOREIGN KEY(company_id) REFERENCES companies(id)
  )
`);

// 7. Create Initiatives Table
db.exec(`
  CREATE TABLE IF NOT EXISTS initiatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    budget REAL NOT NULL,
    roi TEXT NOT NULL,
    company_id INTEGER NOT NULL,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  )
`);

// Seed Dummy Data if empty
const companyCount = db.prepare('SELECT COUNT(*) AS count FROM companies').get().count;

if (companyCount === 0) {
  const insertCompany = db.prepare('INSERT INTO companies (name) VALUES (?)');
  const infoABC = insertCompany.run('PT ABC');
  const infoDEF = insertCompany.run('PT DEF');
  const infoGHI = insertCompany.run('PT GHI');

  const idABC = infoABC.lastInsertRowid;
  const idDEF = infoDEF.lastInsertRowid;
  
  // Seed Users
  const insertUser = db.prepare('INSERT INTO users (username, password, name, role, company_id) VALUES (?, ?, ?, ?, ?)');
  const defaultPassword = bcrypt.hashSync('password123', 10);
  
  db.transaction(() => {
    insertUser.run('superadmin', defaultPassword, 'System Administrator', 'Super Admin', null);
    insertUser.run('admin_abc', defaultPassword, 'Admin PT ABC', 'Admin', idABC);
    insertUser.run('admin_def', defaultPassword, 'Admin PT DEF', 'Admin', idDEF);
    insertUser.run('user_abc', defaultPassword, 'HR Staff PT ABC', 'User', idABC);
    insertUser.run('user_def', defaultPassword, 'HR Staff PT DEF', 'User', idDEF);
  })();
  
  // Seed Providers
  const insertProvider = db.prepare('INSERT INTO providers (providerId, name, type, coverage, employees, contractEnd, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  
  db.transaction(() => {
    // PT ABC Providers
    insertProvider.run('INS-001', 'Allianz Life Indonesia', 'Life & Health', 'Comprehensive', 1350, '2025-12-31', 'Active', idABC);
    insertProvider.run('INS-002', 'AXA Mandiri', 'Health', 'Outpatient', 850, '2025-06-30', 'Active', idABC);
    
    // PT DEF Providers
    insertProvider.run('INS-003', 'Prudential', 'Life & Health', 'Inpatient', 500, '2024-12-31', 'Inactive', idDEF);
  })();
  
  // Seed Diagnoses (Master)
  const insertDiag = db.prepare('INSERT INTO diagnoses (code, name, category) VALUES (?, ?, ?)');
  db.transaction(() => {
    insertDiag.run('J06.9', 'Acute upper respiratory infection (ISPA)', 'Respiratory');
    insertDiag.run('A09', 'Infectious gastroenteritis (Diare)', 'Digestive');
    insertDiag.run('I10', 'Essential hypertension', 'Cardiovascular');
    insertDiag.run('E11', 'Type 2 diabetes mellitus', 'Endocrine');
    insertDiag.run('K29.7', 'Gastritis, unspecified', 'Digestive');
    insertDiag.run('A01.0', 'Typhoid fever (Tipes)', 'Infectious');
  })();
  
  // Seed Employees for PT ABC only
  const insertEmp = db.prepare('INSERT INTO employees (employeeId, name, age, gender, department, company_id) VALUES (?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    const depts = ['Sales', 'Engineering', 'HR', 'Marketing', 'Operations'];
    const genders = ['Male', 'Female'];
    for(let i=1; i<=50; i++) {
      const dept = depts[Math.floor(Math.random() * depts.length)];
      const gender = genders[Math.floor(Math.random() * genders.length)];
      const age = Math.floor(Math.random() * 40) + 22; // 22 to 61
      insertEmp.run(`EMP-${i.toString().padStart(3, '0')}`, `Employee ${i}`, age, gender, dept, idABC);
    }
  })();
  
  // Seed Claims for PT ABC only
  const insertClaim = db.prepare('INSERT INTO claims (claimId, employee_id, diagnosis_id, provider_id, company_id, claimDate, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    // Generate claims over the last 12 months
    const now = new Date();
    for(let i=1; i<=200; i++) {
      const empId = Math.floor(Math.random() * 50) + 1;
      const diagId = Math.floor(Math.random() * 6) + 1;
      const provId = Math.floor(Math.random() * 2) + 1; // 1 or 2 (PT ABC's providers)
      
      const pastDays = Math.floor(Math.random() * 365);
      const claimDate = new Date(now.getTime() - pastDays * 24 * 60 * 60 * 1000);
      const dateString = claimDate.toISOString().split('T')[0];
      
      // Amount between 100k and 5m
      const amount = Math.floor(Math.random() * 4900000) + 100000;
      
      const statuses = ['Paid', 'Pending', 'Rejected'];
      // Weigh towards Paid
      const status = Math.random() > 0.2 ? 'Paid' : (Math.random() > 0.5 ? 'Pending' : 'Rejected');
      
      insertClaim.run(`CLM-${i.toString().padStart(4, '0')}`, empId, diagId, provId, idABC, dateString, amount, status);
    }
  })();
  
  // Seed Initiatives for PT ABC only
  const insertInit = db.prepare('INSERT INTO initiatives (name, status, startDate, endDate, budget, roi, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    insertInit.run('Annual MCU Program', 'Completed', '2025-01-01', '2025-02-28', 150000000, '+12% Productivity', idABC);
    insertInit.run('Flu Vaccination Drive', 'Active', '2025-04-01', '2025-04-30', 50000000, 'Est. -15% ISPA Claims', idABC);
    insertInit.run('Mental Health Workshop', 'Planned', '2025-06-01', '2025-06-05', 25000000, 'TBD', idABC);
  })();

  console.log('Database seeded with dummy data successfully!');
}

module.exports = db;

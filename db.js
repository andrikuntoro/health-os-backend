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
  
  const insertUsersTx = db.transaction(() => {
    // Super Admin (Belongs to no specific company, or can be null)
    insertUser.run('superadmin', defaultPassword, 'System Administrator', 'Super Admin', null);
    
    // Admins
    insertUser.run('admin_abc', defaultPassword, 'Admin PT ABC', 'Admin', idABC);
    insertUser.run('admin_def', defaultPassword, 'Admin PT DEF', 'Admin', idDEF);
    
    // Users (Read Only)
    insertUser.run('user_abc', defaultPassword, 'HR Staff PT ABC', 'User', idABC);
    insertUser.run('user_def', defaultPassword, 'HR Staff PT DEF', 'User', idDEF);
  });
  insertUsersTx();
  
  // Seed Providers
  const insertProvider = db.prepare('INSERT INTO providers (providerId, name, type, coverage, employees, contractEnd, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  
  const insertProvidersTx = db.transaction(() => {
    // PT ABC Providers
    insertProvider.run('INS-001', 'Allianz Life Indonesia', 'Life & Health', 'Comprehensive', 1350, '2025-12-31', 'Active', idABC);
    insertProvider.run('INS-002', 'AXA Mandiri', 'Health', 'Outpatient', 850, '2025-06-30', 'Active', idABC);
    
    // PT DEF Providers
    insertProvider.run('INS-003', 'Prudential', 'Life & Health', 'Inpatient', 500, '2024-12-31', 'Inactive', idDEF);
  });
  insertProvidersTx();
  
  console.log('Database seeded with dummy data successfully!');
}

module.exports = db;

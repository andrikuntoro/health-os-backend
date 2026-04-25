const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    providerId TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    coverage TEXT NOT NULL,
    employees INTEGER NOT NULL,
    contractEnd TEXT NOT NULL,
    status TEXT NOT NULL
  )
`);

// Check if empty, insert some dummy data if it is
const count = db.prepare('SELECT COUNT(*) AS count FROM providers').get().count;
if (count === 0) {
  const insert = db.prepare('INSERT INTO providers (providerId, name, type, coverage, employees, contractEnd, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const dummyData = [
    ['INS-001', 'Allianz Life Indonesia', 'Life & Health', 'Comprehensive', 1350, '2025-12-31', 'Active'],
    ['INS-002', 'AXA Mandiri', 'Health', 'Outpatient', 850, '2025-06-30', 'Active']
  ];
  
  const insertMany = db.transaction((providers) => {
    for (const p of providers) insert.run(p);
  });
  
  insertMany(dummyData);
}

module.exports = db;

const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const multer = require('multer');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticateToken);

// Download Excel Template (ONLY Super Admin)
router.get('/template/:type', requireRole(['Super Admin']), (req, res) => {
  const { type } = req.params;
  let headers = [];
  let sheetName = '';
  let filename = '';

  if (type === 'claims') {
    headers = ['Claim ID', 'Employee ID', 'Diagnosis Code', 'Provider ID', 'Claim Date', 'Amount', 'Status'];
    sheetName = 'Claims Template';
    filename = 'Claims_Template.xlsx';
  } else if (type === 'employees') {
    headers = ['Employee ID', 'Name', 'Age', 'Gender', 'Department'];
    sheetName = 'Employees Template';
    filename = 'Employees_Template.xlsx';
  } else {
    return res.status(400).json({ error: 'Invalid template type' });
  }

  const worksheet = xlsx.utils.aoa_to_sheet([headers]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// Upload Data (Admin and Super Admin)
router.post('/upload/:type', requireRole(['Admin', 'Super Admin']), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { type } = req.params;
  const { role, company_id: userCompanyId } = req.user;
  const targetCompanyId = role === 'Super Admin' && req.body.company_id ? req.body.company_id : userCompanyId;

  if (!targetCompanyId) {
    return res.status(400).json({ error: 'Company ID is required for upload' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    if (type === 'employees') {
      const insert = db.prepare('INSERT OR REPLACE INTO employees (employeeId, name, age, gender, department, company_id) VALUES (?, ?, ?, ?, ?, ?)');
      const insertMany = db.transaction((records) => {
        for (const record of records) {
          if (record['Employee ID'] && record['Name']) {
            insert.run(record['Employee ID'], record['Name'], record['Age'] || 30, record['Gender'] || 'Unknown', record['Department'] || 'General', targetCompanyId);
          }
        }
      });
      insertMany(data);
    } else if (type === 'claims') {
      // Very simplified claim insert for dummy purposes
      // Needs to map Employee ID to internal ID, but for dummy we just use random ID or mapping if it exists
      const getEmp = db.prepare('SELECT id FROM employees WHERE employeeId = ? AND company_id = ?');
      const getDiag = db.prepare('SELECT id FROM diagnoses WHERE code = ?');
      const insert = db.prepare('INSERT INTO claims (claimId, employee_id, diagnosis_id, provider_id, company_id, claimDate, amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      
      const insertMany = db.transaction((records) => {
        for (const record of records) {
          const empRow = getEmp.get(record['Employee ID'], targetCompanyId);
          const diagRow = getDiag.get(record['Diagnosis Code']);
          
          if (empRow && diagRow && record['Claim ID']) {
            // Using 1 for provider_id arbitrarily for this demo
            insert.run(record['Claim ID'], empRow.id, diagRow.id, 1, targetCompanyId, record['Claim Date'] || new Date().toISOString().split('T')[0], record['Amount'] || 0, record['Status'] || 'Pending');
          }
        }
      });
      insertMany(data);
    }

    res.json({ message: 'Upload successful', count: data.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

module.exports = router;

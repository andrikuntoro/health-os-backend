const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit-table');
const db = require('../db');

// Setup multer for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// 1. GET /api/providers (with optional filtering)
router.get('/', (req, res) => {
  const { filterName, filterType, filterStatus } = req.query;
  
  let query = 'SELECT * FROM providers WHERE 1=1';
  let params = [];
  
  if (filterName) {
    query += ' AND name LIKE ?';
    params.push(`%${filterName}%`);
  }
  if (filterType) {
    query += ' AND type = ?';
    params.push(filterType);
  }
  if (filterStatus) {
    query += ' AND status = ?';
    params.push(filterStatus);
  }
  
  try {
    const providers = db.prepare(query).all(...params);
    res.json(providers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// 2. GET /api/providers/template (download Excel template)
router.get('/template', (req, res) => {
  const headers = ['Provider ID', 'Name', 'Type', 'Coverage', 'Employees', 'Contract End', 'Status'];
  const worksheet = xlsx.utils.aoa_to_sheet([headers]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Providers Template');
  
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  res.setHeader('Content-Disposition', 'attachment; filename="Providers_Template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// 3. POST /api/providers/upload (Upload Excel and insert to DB)
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    // Validate and insert
    const insert = db.prepare('INSERT OR REPLACE INTO providers (providerId, name, type, coverage, employees, contractEnd, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    
    const insertMany = db.transaction((records) => {
      for (const record of records) {
        // Map Excel headers to database columns
        const providerId = record['Provider ID'];
        const name = record['Name'];
        const type = record['Type'];
        const coverage = record['Coverage'];
        const employees = record['Employees'];
        const contractEnd = record['Contract End'];
        const status = record['Status'];
        
        if (providerId && name && type && coverage) {
          insert.run(providerId, name, type, coverage, employees || 0, contractEnd || '', status || 'Active');
        }
      }
    });
    
    insertMany(data);
    res.json({ message: 'Upload successful', count: data.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

// 4. GET /api/providers/export/pdf (Export All to PDF)
router.get('/export/pdf', (req, res) => {
  const { filterName, filterType, filterStatus } = req.query;
  
  let query = 'SELECT * FROM providers WHERE 1=1';
  let params = [];
  
  if (filterName) {
    query += ' AND name LIKE ?';
    params.push(`%${filterName}%`);
  }
  if (filterType) {
    query += ' AND type = ?';
    params.push(filterType);
  }
  if (filterStatus) {
    query += ' AND status = ?';
    params.push(filterStatus);
  }
  
  try {
    const providers = db.prepare(query).all(...params);
    
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Providers_Report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    
    doc.fontSize(18).text('Insurance Provider Master Data', { align: 'center' });
    doc.moveDown();
    
    const tableData = {
      headers: ['Provider ID', 'Name', 'Type', 'Coverage', 'Employees', 'Contract End', 'Status'],
      rows: providers.map(p => [p.providerId, p.name, p.type, p.coverage, p.employees.toString(), p.contractEnd, p.status])
    };
    
    doc.table(tableData, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
      prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
        doc.font('Helvetica').fontSize(10);
      },
    });
    
    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// 5. GET /api/providers/:id/export/pdf (Export Single row to PDF)
router.get('/:id/export/pdf', (req, res) => {
  const { id } = req.params;
  
  try {
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
    
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Disposition', `attachment; filename="Provider_${provider.providerId}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    
    doc.fontSize(20).text('Provider Details', { align: 'center' });
    doc.moveDown(2);
    
    doc.fontSize(14).text(`Provider ID: ${provider.providerId}`);
    doc.text(`Name: ${provider.name}`);
    doc.text(`Type: ${provider.type}`);
    doc.text(`Coverage: ${provider.coverage}`);
    doc.text(`Employees: ${provider.employees}`);
    doc.text(`Contract End: ${provider.contractEnd}`);
    doc.text(`Status: ${provider.status}`);
    
    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;

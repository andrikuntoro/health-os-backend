const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit-table');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Setup multer for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// Apply authentication to all routes in this router
router.use(authenticateToken);

// 1. GET /api/providers (with optional filtering)
router.get('/', (req, res) => {
  const { filterName, filterType, filterStatus, filterCompanyId } = req.query;
  const { role, company_id } = req.user;
  
  let query = 'SELECT providers.*, companies.name as company_name FROM providers LEFT JOIN companies ON providers.company_id = companies.id WHERE 1=1';
  let params = [];
  
  // RBAC & Multi-Tenancy Logic
  if (role === 'Super Admin') {
    if (filterCompanyId) {
      query += ' AND providers.company_id = ?';
      params.push(filterCompanyId);
    }
  } else {
    // Admin or User can only see their own company
    query += ' AND providers.company_id = ?';
    params.push(company_id);
  }
  
  if (filterName) {
    query += ' AND providers.name LIKE ?';
    params.push(`%${filterName}%`);
  }
  if (filterType) {
    query += ' AND providers.type = ?';
    params.push(filterType);
  }
  if (filterStatus) {
    query += ' AND providers.status = ?';
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
// Anyone authenticated can download the template
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
// Only Admin and Super Admin can upload
router.post('/upload', requireRole(['Admin', 'Super Admin']), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const { role, company_id: userCompanyId } = req.user;
  // If Super Admin, they can pass targetCompanyId in the form data
  const targetCompanyId = role === 'Super Admin' && req.body.company_id ? req.body.company_id : userCompanyId;
  
  if (!targetCompanyId) {
    return res.status(400).json({ error: 'Company ID is required for upload' });
  }
  
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    // Check if the combination of providerId and company_id exists to update
    const insert = db.prepare('INSERT INTO providers (providerId, name, type, coverage, employees, contractEnd, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const update = db.prepare('UPDATE providers SET name=?, type=?, coverage=?, employees=?, contractEnd=?, status=? WHERE providerId=? AND company_id=?');
    const check = db.prepare('SELECT id FROM providers WHERE providerId=? AND company_id=?');
    
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
          const exists = check.get(providerId, targetCompanyId);
          if (exists) {
            update.run(name, type, coverage, employees || 0, contractEnd || '', status || 'Active', providerId, targetCompanyId);
          } else {
            insert.run(providerId, name, type, coverage, employees || 0, contractEnd || '', status || 'Active', targetCompanyId);
          }
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
// Only Admin and Super Admin can export
router.get('/export/pdf', requireRole(['Admin', 'Super Admin']), (req, res) => {
  const { filterName, filterType, filterStatus, filterCompanyId } = req.query;
  const { role, company_id } = req.user;
  
  let query = 'SELECT providers.*, companies.name as company_name FROM providers LEFT JOIN companies ON providers.company_id = companies.id WHERE 1=1';
  let params = [];
  
  if (role === 'Super Admin') {
    if (filterCompanyId) {
      query += ' AND providers.company_id = ?';
      params.push(filterCompanyId);
    }
  } else {
    query += ' AND providers.company_id = ?';
    params.push(company_id);
  }
  
  if (filterName) {
    query += ' AND providers.name LIKE ?';
    params.push(`%${filterName}%`);
  }
  if (filterType) {
    query += ' AND providers.type = ?';
    params.push(filterType);
  }
  if (filterStatus) {
    query += ' AND providers.status = ?';
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
      headers: ['Provider ID', 'Company', 'Name', 'Type', 'Coverage', 'Employees', 'Status'],
      rows: providers.map(p => [p.providerId, p.company_name, p.name, p.type, p.coverage, p.employees.toString(), p.status])
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
// Only Admin and Super Admin can export
router.get('/:id/export/pdf', requireRole(['Admin', 'Super Admin']), (req, res) => {
  const { id } = req.params;
  const { role, company_id } = req.user;
  
  try {
    const provider = db.prepare('SELECT providers.*, companies.name as company_name FROM providers LEFT JOIN companies ON providers.company_id = companies.id WHERE providers.id = ?').get(id);
    
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    
    if (role !== 'Super Admin' && provider.company_id !== company_id) {
      return res.status(403).json({ error: 'Access denied to this provider' });
    }
    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Disposition', `attachment; filename="Provider_${provider.providerId}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    
    doc.fontSize(20).text('Provider Details', { align: 'center' });
    doc.moveDown(2);
    
    doc.fontSize(14).text(`Company: ${provider.company_name}`);
    doc.text(`Provider ID: ${provider.providerId}`);
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

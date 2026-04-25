const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Helper to filter by company unless Super Admin asks for all
const getCompanyFilter = (req, customCompanyId) => {
  const { role, company_id } = req.user;
  if (role === 'Super Admin') {
    return customCompanyId ? `AND c.company_id = ${customCompanyId}` : '';
  }
  return `AND c.company_id = ${company_id}`;
};

// 1. Dashboard High-Level Metrics
router.get('/dashboard', (req, res) => {
  try {
    const companyFilter = getCompanyFilter(req, req.query.companyId);
    
    // Total Employees
    const totalEmployees = db.prepare(`SELECT COUNT(*) as count FROM employees c WHERE 1=1 ${companyFilter}`).get().count;
    
    // Total Claims YTD
    const currentYear = new Date().getFullYear();
    const claimsYtd = db.prepare(`SELECT SUM(amount) as total FROM claims c WHERE claimDate LIKE '${currentYear}-%' ${companyFilter}`).get().total || 0;
    
    // Active Initiatives
    const activeInitiatives = db.prepare(`SELECT COUNT(*) as count FROM initiatives c WHERE status = 'Active' ${companyFilter}`).get().count;
    
    res.json({
      totalEmployees,
      claimsYtd,
      activeInitiatives,
      healthScore: totalEmployees > 0 ? 85 : 0 // Mock score
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Executive Charts Data
router.get('/executive', (req, res) => {
  try {
    const companyFilter = getCompanyFilter(req, req.query.companyId);
    
    // Top Diagnoses by Cost
    const topDiagnoses = db.prepare(`
      SELECT d.name, d.category, SUM(c.amount) as totalCost, COUNT(c.id) as caseCount
      FROM claims c
      JOIN diagnoses d ON c.diagnosis_id = d.id
      WHERE 1=1 ${companyFilter}
      GROUP BY d.id
      ORDER BY totalCost DESC
      LIMIT 5
    `).all();
    
    // Claims Trend (Last 6 Months)
    const trend = db.prepare(`
      SELECT strftime('%Y-%m', claimDate) as month, SUM(amount) as totalCost, COUNT(id) as claimCount
      FROM claims c
      WHERE claimDate >= date('now', '-6 months') ${companyFilter}
      GROUP BY month
      ORDER BY month ASC
    `).all();
    
    // Department Cost Distribution
    const deptCosts = db.prepare(`
      SELECT e.department as name, SUM(c.amount) as value
      FROM claims c
      JOIN employees e ON c.employee_id = e.id
      WHERE 1=1 ${companyFilter}
      GROUP BY e.department
    `).all();
    
    res.json({ topDiagnoses, trend, deptCosts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. AI Recommendations (Simulated)
router.get('/ai-recommendations', (req, res) => {
  try {
    const companyFilter = getCompanyFilter(req, req.query.companyId);
    
    // Fetch top diagnosis to formulate recommendation
    const topDiag = db.prepare(`
      SELECT d.name, d.category, COUNT(c.id) as count
      FROM claims c
      JOIN diagnoses d ON c.diagnosis_id = d.id
      WHERE claimDate >= date('now', '-30 days') ${companyFilter}
      GROUP BY d.id
      ORDER BY count DESC
      LIMIT 1
    `).get();
    
    let recommendations = [];
    
    if (!topDiag) {
      recommendations.push({
        type: 'info',
        title: 'Not Enough Data',
        message: 'Upload more claims data to generate AI insights.'
      });
    } else {
      if (topDiag.category === 'Respiratory') {
        recommendations.push({
          type: 'warning',
          title: `Spike in ${topDiag.name}`,
          message: `We detected a recent spike (${topDiag.count} cases) in respiratory issues. Consider improving office ventilation and offering free flu shots.`
        });
      } else if (topDiag.category === 'Digestive') {
        recommendations.push({
          type: 'warning',
          title: `Increase in ${topDiag.name}`,
          message: `Digestive issues are trending up (${topDiag.count} cases). We recommend auditing the office cafeteria hygiene and providing healthy lunch options.`
        });
      } else {
        recommendations.push({
          type: 'info',
          title: `Focus Area: ${topDiag.name}`,
          message: `This condition is your highest driver of claims recently (${topDiag.count} cases). Engage your wellness provider for targeted health talks.`
        });
      }
      
      // Cost saving opportunity
      recommendations.push({
        type: 'success',
        title: 'Cost Saving Opportunity',
        message: 'By shifting 20% of outpatient visits to telemedicine, you could save approximately Rp 45.000.000 this quarter.'
      });
    }
    
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

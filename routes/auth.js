const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = db.prepare('SELECT users.*, companies.name as company_name FROM users LEFT JOIN companies ON users.company_id = companies.id WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    
    // Create JWT token
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      company_id: user.company_id,
      company_name: user.company_name
    }, JWT_SECRET, { expiresIn: '8h' });
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        company_id: user.company_id,
        company_name: user.company_name
      }
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Utility to get companies for Super Admin
router.get('/companies', (req, res) => {
  try {
    const companies = db.prepare('SELECT * FROM companies').all();
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

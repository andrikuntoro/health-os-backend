const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const providerRoutes = require('./routes/providers');
const analyticsRoutes = require('./routes/analytics');
const dataRoutes = require('./routes/data');
const db = require('./db'); // Initializes and seeds the DB

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/data', dataRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

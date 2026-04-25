const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const providersRoutes = require('./routes/providers');
app.use('/api/providers', providersRoutes);

// Start server
app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

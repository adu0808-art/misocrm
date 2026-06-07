const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/masters', require('./routes/masters'));
app.use('/api/customer-contacts', require('./routes/customer_contacts'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/project-solutions', require('./routes/project_solutions'));
app.use('/api/project-resources', require('./routes/project_resources'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/targets', require('./routes/targets'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/bizno', require('./routes/bizno'));
app.use('/api/nts', require('./routes/nts'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MISO CRM 서버 실행 중: http://localhost:${PORT}`);
});

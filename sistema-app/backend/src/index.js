import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import apptRoutes from './routes/appointments.js';
import saleRoutes from './routes/sales.js';
import inventoryRoutes from './routes/inventory.js';
import catalogRoutes from './routes/catalog.js';
import packageRoutes from './routes/packages.js';
import cashRoutes from './routes/cash.js';
import staffRoutes from './routes/staff.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'SÉRÈN API' }));
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/appointments', apptRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/staff', staffRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`SÉRÈN API en http://localhost:${PORT}`));

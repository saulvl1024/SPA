import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import apptRoutes from './routes/appointments.js';
import saleRoutes from './routes/sales.js';
import inventoryRoutes from './routes/inventory.js';
import warehouseRoutes from './routes/warehouses.js';
import publicRoutes from './routes/public.js';
import catalogRoutes from './routes/catalog.js';
import packageRoutes from './routes/packages.js';
import cashRoutes from './routes/cash.js';
import staffRoutes from './routes/staff.js';
import staffDocRoutes from './routes/staffDocs.js';
import crmRoutes from './routes/crm.js';
import expenseRoutes from './routes/expenses.js';
import promotionRoutes from './routes/promotions.js';
import whatsappRoutes from './routes/whatsapp.js';
import tagRoutes from './routes/tags.js';
import analyticsRoutes from './routes/analytics.js';
import purchaseRoutes from './routes/purchases.js';
import auditRoutes from './routes/audit.js';
import insightsRoutes from './routes/insights.js';
import dealsRoutes from './routes/deals.js';
import systemRoutes from './routes/system.js';
import loyaltyRoutes from './routes/loyalty.js';
import importRoutes from './routes/import.js';
import tablesRoutes from './routes/tables.js';
import kitchenRoutes from './routes/kitchen.js';
import ventasRoutes from './routes/ventas.js';
import companyRoutes from './routes/companies.js';
import projectRoutes from './routes/projects.js';
import waWebhookRoutes from './routes/waWebhook.js';
import { notFound, errorHandler } from './lib/http.js';
import { rateLimit, securityHeaders, sanitizeBody } from './middleware/security.js';

export function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);        // detrás de un reverse proxy/TLS: req.ip y req.secure correctos
  app.disable('x-powered-by');      // no revelar Express
  app.use(securityHeaders);         // cabeceras de endurecimiento (anti-clickjacking, nosniff, HSTS...)

  // CORS restringido: SOLO la app puede llamar al backend. Define CORS_ORIGINS en .env (separados por coma).
  // En desarrollo, sin lista, permite el frontend local de Vite.
  const allowed = (process.env.CORS_ORIGINS || (isProd ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
    .split(',').map(s => s.trim()).filter(Boolean);
  if (isProd && allowed.length === 0) {
    throw new Error('CORS_ORIGINS es obligatorio en producción (orígenes permitidos de la app).');
  }
  app.use(cors({
    origin(origin, cb) {
      // En producción se exige un origen en la lista (no se permiten peticiones sin origen como curl).
      // En desarrollo se permite sin origen para herramientas locales.
      if (origin && allowed.includes(origin)) return cb(null, true);
      if (!origin && !isProd) return cb(null, true);
      return cb(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }));
  app.use(express.json({ limit: '20mb' })); // permite subir documentos y adjuntos de expediente (base64)
  app.use(sanitizeBody);            // limpieza defensiva de body/query (anti prototype-pollution / control chars)

  // Rate limit GLOBAL por IP (protección base contra abuso/DoS ligero).
  app.use('/api', rateLimit({ windowMs: 60_000, max: 300, scope: 'api', message: 'Demasiadas peticiones. Espera un minuto.' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'SÉRÈN API' }));
  app.use('/api/wa-webhook', waWebhookRoutes); // PÚBLICO (sin auth): Meta llama aquí
  app.use('/api/public', publicRoutes);        // PÚBLICO (sin auth): menú para clientes vía NFC/QR

  // Rate limit ESTRICTO en login: frena fuerza bruta de contraseñas (por IP).
  app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 8, scope: 'login', message: 'Demasiados intentos de inicio de sesión. Espera un minuto.' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/appointments', apptRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/warehouses', warehouseRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/packages', packageRoutes);
  app.use('/api/cash', cashRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/staff', staffDocRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/promotions', promotionRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/insights', insightsRoutes);
  app.use('/api/deals', dealsRoutes);
  app.use('/api/system', systemRoutes);
  app.use('/api/loyalty', loyaltyRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/tables', tablesRoutes);
  app.use('/api/kitchen', kitchenRoutes);
  app.use('/api/ventas', ventasRoutes);

  app.use('/api', notFound);   // 404 para rutas de API inexistentes
  app.use(errorHandler);        // manejador global de errores (respuesta JSON limpia)

  return app;
}

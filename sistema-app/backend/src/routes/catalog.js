import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { MODULES, DEFAULT_EMPLOYEE } from '../lib/permissions.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth);

// Lista de módulos para el editor de permisos (Personal)
r.get('/modules', (_req, res) => res.json({ modules: MODULES, defaultEmployee: DEFAULT_EMPLOYEE }));

// Configuración del checador de precios: qué listas de precios se muestran en la card.
r.get('/price-check-config', async (_req, res) => {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  const s = (cfg?.settings && typeof cfg.settings === 'object') ? cfg.settings : {};
  res.json({ lists: Array.isArray(s.checadorListas) ? s.checadorListas : [] });
});

r.put('/price-check-config', adminOnly, async (req, res) => {
  const lists = Array.isArray(req.body.lists) ? req.body.lists.filter(x => typeof x === 'string') : [];
  let cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) cfg = await prisma.systemConfig.create({ data: { id: 'singleton' } });
  const settings = { ...(cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : {}), checadorListas: lists };
  await prisma.systemConfig.update({ where: { id: cfg.id }, data: { settings } });
  logAudit(req, { module: 'inventario', action: 'config_checador', summary: `Configuró ${lists.length} lista(s) en el checador` });
  res.json({ ok: true, lists });
});

// Buscar producto por código de barras (para el escáner del POS).
// Primero por barcode del producto; si no, por SKU de una variante.
r.get('/by-barcode/:code', async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Código vacío' });

  const product = await prisma.product.findUnique({ where: { barcode: code } });
  if (product) {
    return res.json({ type: 'product', id: product.id, name: product.name, price: product.price, stock: product.stock, category: product.category, image: product.image });
  }
  // Respaldo: variante por SKU
  const variant = await prisma.productVariant.findFirst({ where: { sku: code }, include: { product: true } });
  if (variant) {
    return res.json({
      type: 'variant', id: variant.id, productId: variant.productId,
      name: `${variant.product.name} · ${variant.name}`,
      price: variant.price ?? variant.product.price, stock: variant.stock,
      category: variant.product.category, image: variant.product.image,
    });
  }
  return res.status(404).json({ error: 'No se encontró un producto con ese código' });
});

r.get('/services', async (_req, res) =>
  res.json(await prisma.service.findMany({ where: { active: true }, orderBy: { name: 'asc' } })));

// Detalle de un servicio con su receta de insumos
r.get('/services/:id', async (req, res) => {
  const service = await prisma.service.findUnique({
    where: { id: req.params.id },
    include: { recipe: { include: { supply: true } } },
  });
  if (!service) return res.status(404).json({ error: 'No existe' });
  res.json(service);
});

// Guardar la receta de insumos de un servicio (reemplaza la actual). SOLO ADMIN
r.put('/services/:id/recipe', adminOnly, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const serviceId = req.params.id;
  await prisma.$transaction(async (tx) => {
    await tx.serviceSupply.deleteMany({ where: { serviceId } });
    for (const it of items) {
      if (!it.supplyId || !(Number(it.qty) > 0)) continue;
      await tx.serviceSupply.create({ data: { serviceId, supplyId: it.supplyId, qty: Number(it.qty) } });
    }
  });
  const service = await prisma.service.findUnique({ where: { id: serviceId }, include: { recipe: { include: { supply: true } } } });
  logAudit(req, { module: 'inventario', action: 'cambio_receta', summary: `Receta de insumos del servicio "${service?.name || serviceId}" actualizada (${service?.recipe?.length || 0} insumo[s])`, refId: serviceId });
  res.json(service);
});

// Lista de plantillas de paquete. ?all=1 incluye los inactivos (para administración).
r.get('/packages', async (req, res) => {
  const where = req.query.all === '1' ? {} : { active: true };
  res.json(await prisma.package.findMany({ where, orderBy: { sessions: 'asc' } }));
});

// Crear plantilla de paquete. SOLO ADMIN
r.post('/packages', adminOnly, async (req, res) => {
  const { name, sessions, price, validityMonths } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre del paquete' });
  if (!(Number(sessions) > 0)) return res.status(400).json({ error: 'Las sesiones deben ser mayor a 0' });
  const pkg = await prisma.package.create({ data: {
    name: String(name), sessions: Math.floor(Number(sessions)), price: Number(price) || 0,
    validityMonths: Math.max(1, Math.floor(Number(validityMonths) || 3)),
  } });
  logAudit(req, { module: 'paquetes', action: 'alta_paquete', summary: `Creó el paquete "${pkg.name}" · ${pkg.sessions} sesiones a ${'$' + pkg.price}`, refId: pkg.id });
  res.status(201).json(pkg);
});

// Editar plantilla de paquete. SOLO ADMIN (no afecta paquetes ya vendidos)
r.put('/packages/:id', adminOnly, async (req, res) => {
  const { name, sessions, price, validityMonths } = req.body;
  const data = {};
  if (name !== undefined && name) data.name = String(name);
  if (sessions !== undefined && Number(sessions) > 0) data.sessions = Math.floor(Number(sessions));
  if (price !== undefined) data.price = Number(price) || 0;
  if (validityMonths !== undefined) data.validityMonths = Math.max(1, Math.floor(Number(validityMonths) || 3));
  const pkg = await prisma.package.update({ where: { id: req.params.id }, data });
  logAudit(req, { module: 'paquetes', action: 'editar_paquete', summary: `Editó el paquete "${pkg.name}"`, refId: pkg.id });
  res.json(pkg);
});

// Activar / desactivar una plantilla (no se elimina para conservar historial). SOLO ADMIN
r.patch('/packages/:id/active', adminOnly, async (req, res) => {
  const pkg = await prisma.package.update({ where: { id: req.params.id }, data: { active: !!req.body.active } });
  logAudit(req, { module: 'paquetes', action: 'estado_paquete', summary: `${pkg.active ? 'Activó' : 'Desactivó'} el paquete "${pkg.name}"`, refId: pkg.id });
  res.json(pkg);
});

// Staff / especialistas (sin exponer el PIN)
r.get('/staff', async (_req, res) => {
  const staff = await prisma.staff.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, specialty: true, commissionRate: true },
    orderBy: { name: 'asc' },
  });
  res.json(staff);
});

export default r;

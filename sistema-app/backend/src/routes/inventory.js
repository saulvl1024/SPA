import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth);

r.get('/supplies', async (_req, res) => res.json(await prisma.supply.findMany({ orderBy: { name: 'asc' } })));
r.get('/products', async (_req, res) => res.json(await prisma.product.findMany({
  orderBy: { name: 'asc' },
  include: { variants: { where: { active: true } }, components: { include: { component: true } } },
})));

// Crear insumo / producto: SOLO ADMIN
r.post('/supplies', auth, adminOnly, async (req, res) => {
  const { name, category, unit, stock, minStock } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const supply = await prisma.supply.create({
    data: { name, category: category || null, unit: unit || 'pza', stock: Number(stock) || 0, minStock: Number(minStock) || 0 },
  });
  logAudit(req, { module: 'inventario', action: 'alta_insumo', summary: `Alta de insumo "${supply.name}"`, refId: supply.id });
  res.status(201).json(supply);
});

r.post('/products', auth, adminOnly, async (req, res) => {
  const { name, price, stock, minStock, station, barcode, category, image } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const product = await prisma.product.create({
    data: { name, price: Number(price) || 0, stock: Number(stock) || 0, minStock: Number(minStock) || 0,
      station: ['cocina', 'barra'].includes(station) ? station : 'ninguna',
      barcode: barcode?.trim() || null, category: category?.trim() || null, image: image || null },
  });
  logAudit(req, { module: 'inventario', action: 'alta_producto', summary: `Alta de producto "${product.name}" a $${product.price}`, refId: product.id });
  res.status(201).json(product);
});

// Editar nombre y precio de un producto. SOLO ADMIN. (el stock se ajusta por su propia ruta)
r.put('/products/:id', auth, adminOnly, async (req, res) => {
  const { name, price, station, barcode, category, image } = req.body;
  const before = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: 'Producto no encontrado' });
  const data = {};
  if (name !== undefined && name) data.name = name;
  if (price !== undefined) data.price = Number(price) || 0;
  if (station !== undefined) data.station = ['cocina', 'barra'].includes(station) ? station : 'ninguna';
  if (barcode !== undefined) data.barcode = barcode?.trim() || null;
  if (category !== undefined) data.category = category?.trim() || null;
  if (image !== undefined) data.image = image || null;
  const product = await prisma.product.update({ where: { id: req.params.id }, data });
  if (data.price !== undefined && data.price !== before.price) {
    logAudit(req, { module: 'inventario', action: 'cambio_precio', summary: `Precio de "${product.name}": $${before.price} → $${product.price}`, refId: product.id, meta: { antes: before.price, despues: product.price } });
  } else {
    logAudit(req, { module: 'inventario', action: 'editar_producto', summary: `Editó el producto "${product.name}"`, refId: product.id });
  }
  res.json(product);
});

// Editar nombre de un insumo. SOLO ADMIN.
r.put('/supplies/:id', auth, adminOnly, async (req, res) => {
  const { name, category, unit } = req.body;
  const data = {};
  if (name) data.name = name;
  if (category !== undefined) data.category = category || null;
  if (unit !== undefined) data.unit = unit || 'pza';
  const supply = await prisma.supply.update({ where: { id: req.params.id }, data });
  logAudit(req, { module: 'inventario', action: 'editar_insumo', summary: `Editó el insumo "${supply.name}"`, refId: supply.id });
  res.json(supply);
});

// Ajuste de inventario (SOLO ADMIN) — NO registra costo. Para reponer compras, usar el módulo Compras.
// Sirve para correcciones, conteo físico, devoluciones y mermas. Acepta cantidades negativas.
r.post('/supplies/:id/stock', auth, adminOnly, async (req, res) => {
  const qty = Number(req.body.qty) || 0;
  const reason = (req.body.reason || 'Ajuste').toString().trim();
  const cur = await prisma.supply.findUnique({ where: { id: req.params.id } });
  if (!cur) return res.status(404).json({ error: 'Insumo no encontrado' });
  const newStock = Math.max(0, cur.stock + qty); // no permitir stock negativo
  const supply = await prisma.supply.update({ where: { id: req.params.id }, data: { stock: newStock } });
  logAudit(req, { module: 'inventario', action: 'ajuste_stock', summary: `Ajuste de insumo "${supply.name}": ${qty >= 0 ? '+' : ''}${qty} → ${supply.stock} · motivo: ${reason}`, refId: supply.id, meta: { reason, qty } });
  res.json(supply);
});

r.post('/products/:id/stock', auth, adminOnly, async (req, res) => {
  const qty = Number(req.body.qty) || 0;
  const reason = (req.body.reason || 'Ajuste').toString().trim();
  const cur = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!cur) return res.status(404).json({ error: 'Producto no encontrado' });
  const newStock = Math.max(0, cur.stock + qty);
  const product = await prisma.product.update({ where: { id: req.params.id }, data: { stock: newStock } });
  logAudit(req, { module: 'inventario', action: 'ajuste_stock', summary: `Ajuste de producto "${product.name}": ${qty >= 0 ? '+' : ''}${qty} → ${product.stock} · motivo: ${reason}`, refId: product.id, meta: { reason, qty } });
  res.json(product);
});

// Cambiar mínimo: SOLO ADMIN
r.patch('/supplies/:id/min', auth, adminOnly, async (req, res) => {
  const supply = await prisma.supply.update({
    where: { id: req.params.id }, data: { minStock: Number(req.body.minStock) || 0 },
  });
  logAudit(req, { module: 'inventario', action: 'cambio_minimo', summary: `Mínimo de insumo "${supply.name}" = ${supply.minStock}`, refId: supply.id });
  res.json(supply);
});

r.patch('/products/:id/min', auth, adminOnly, async (req, res) => {
  const product = await prisma.product.update({
    where: { id: req.params.id }, data: { minStock: Number(req.body.minStock) || 0 },
  });
  logAudit(req, { module: 'inventario', action: 'cambio_minimo', summary: `Mínimo de producto "${product.name}" = ${product.minStock}`, refId: product.id });
  res.json(product);
});

/* ---------- PAQUETES (BUNDLES) ---------- */
// Definir los componentes de un producto-paquete (reemplaza los actuales). SOLO ADMIN
r.put('/products/:id/components', auth, adminOnly, async (req, res) => {
  const bundleId = req.params.id;
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  await prisma.$transaction(async (tx) => {
    await tx.productComponent.deleteMany({ where: { bundleId } });
    for (const it of items) {
      if (!it.componentId || it.componentId === bundleId || !(Number(it.qty) > 0)) continue;
      await tx.productComponent.create({ data: { bundleId, componentId: it.componentId, qty: Math.round(Number(it.qty)) } });
    }
    await tx.product.update({ where: { id: bundleId }, data: { isBundle: items.length > 0 } });
  });
  const product = await prisma.product.findUnique({ where: { id: bundleId }, include: { components: { include: { component: true } } } });
  logAudit(req, { module: 'inventario', action: 'config_paquete', summary: `Configuró el paquete "${product?.name}" (${product?.components.length || 0} componente[s])`, refId: bundleId });
  res.json(product);
});

/* ---------- VARIANTES ---------- */
r.get('/products/:id/variants', async (req, res) =>
  res.json(await prisma.productVariant.findMany({ where: { productId: req.params.id }, orderBy: { name: 'asc' } })));

// Crear variante. SOLO ADMIN
r.post('/products/:id/variants', auth, adminOnly, async (req, res) => {
  const { name, options, price, stock, sku } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre de la variante' });
  const v = await prisma.productVariant.create({
    data: {
      productId: req.params.id, name, options: options || undefined,
      price: price != null && price !== '' ? Number(price) : null,
      stock: Math.round(Number(stock) || 0), sku: sku || null,
    },
  });
  logAudit(req, { module: 'inventario', action: 'alta_variante', summary: `Variante "${v.name}" del producto`, refId: v.id });
  res.status(201).json(v);
});

// Editar variante
r.put('/variants/:vid', auth, adminOnly, async (req, res) => {
  const { name, price, stock, sku, active } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (price !== undefined) data.price = price === '' || price == null ? null : Number(price);
  if (stock !== undefined) data.stock = Math.round(Number(stock) || 0);
  if (sku !== undefined) data.sku = sku || null;
  if (active !== undefined) data.active = !!active;
  const v = await prisma.productVariant.update({ where: { id: req.params.vid }, data });
  res.json(v);
});

// Eliminar variante
r.delete('/variants/:vid', auth, adminOnly, async (req, res) => {
  await prisma.productVariant.delete({ where: { id: req.params.vid } });
  res.json({ ok: true });
});

export default r;

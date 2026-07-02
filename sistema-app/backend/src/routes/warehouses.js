import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth);

// Recalcula Product.stock como la SUMA de sus niveles por almacén (mantiene el total coherente).
async function syncProductTotal(productId) {
  const agg = await prisma.stockLevel.aggregate({ where: { productId }, _sum: { qty: true } });
  await prisma.product.update({ where: { id: productId }, data: { stock: agg._sum.qty || 0 } });
}

/* ===================== ALMACENES ===================== */
r.get('/', async (_req, res) => {
  res.json(await prisma.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }));
});

r.post('/', adminOnly, async (req, res) => {
  const { name, address, isDefault } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Falta el nombre del almacén' });
  if (isDefault) await prisma.warehouse.updateMany({ data: { isDefault: false } });
  // Si es el primer almacén, hazlo predeterminado automáticamente
  const count = await prisma.warehouse.count({ where: { active: true } });
  const wh = await prisma.warehouse.create({ data: { name: name.trim(), address: address?.trim() || null, isDefault: !!isDefault || count === 0 } });
  logAudit(req, { module: 'inventario', action: 'alta_almacen', summary: `Creó almacén "${wh.name}"`, refId: wh.id });
  res.status(201).json(wh);
});

r.put('/:id', adminOnly, async (req, res) => {
  const { name, address, isDefault } = req.body;
  if (isDefault) await prisma.warehouse.updateMany({ data: { isDefault: false } });
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (address !== undefined) data.address = address?.trim() || null;
  if (isDefault !== undefined) data.isDefault = !!isDefault;
  const wh = await prisma.warehouse.update({ where: { id: req.params.id }, data });
  res.json(wh);
});

// Eliminar (desactivar) un almacén. Su stock se descuenta del total al borrar sus niveles.
r.delete('/:id', adminOnly, async (req, res) => {
  const levels = await prisma.stockLevel.findMany({ where: { warehouseId: req.params.id }, select: { productId: true } });
  await prisma.stockLevel.deleteMany({ where: { warehouseId: req.params.id } });
  await prisma.warehouse.update({ where: { id: req.params.id }, data: { active: false } });
  // Recalcula el total de cada producto afectado
  for (const pid of [...new Set(levels.map(l => l.productId))]) await syncProductTotal(pid);
  logAudit(req, { module: 'inventario', action: 'baja_almacen', summary: `Eliminó un almacén`, refId: req.params.id });
  res.json({ ok: true });
});

/* ===================== STOCK POR ALMACÉN ===================== */
// Niveles de stock de un producto, desglosados por almacén (incluye almacenes en 0).
r.get('/stock/:productId', async (req, res) => {
  const [warehouses, levels] = await Promise.all([
    prisma.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    prisma.stockLevel.findMany({ where: { productId: req.params.productId } }),
  ]);
  const map = new Map(levels.map(l => [l.warehouseId, l.qty]));
  res.json(warehouses.map(w => ({ warehouseId: w.id, name: w.name, isDefault: w.isDefault, qty: map.get(w.id) || 0 })));
});

// Stock de TODOS los productos en un almacén concreto (para la vista de inventario por almacén).
// Devuelve un mapa { productId: qty }.
r.get('/:warehouseId/levels', async (req, res) => {
  const levels = await prisma.stockLevel.findMany({ where: { warehouseId: req.params.warehouseId }, select: { productId: true, qty: true } });
  const map = {};
  levels.forEach(l => { map[l.productId] = l.qty; });
  res.json(map);
});

// Fijar la cantidad de un producto en un almacén (valor absoluto). Recalcula el total.
// Permitido al admin o a quien tenga el permiso 'stock_almacen'.
r.put('/stock/:productId/:warehouseId', requirePerm('stock_almacen'), async (req, res) => {
  const qty = Math.max(0, Number(req.body.qty) || 0);
  await prisma.stockLevel.upsert({
    where: { productId_warehouseId: { productId: req.params.productId, warehouseId: req.params.warehouseId } },
    update: { qty },
    create: { productId: req.params.productId, warehouseId: req.params.warehouseId, qty },
  });
  await syncProductTotal(req.params.productId);
  const total = (await prisma.product.findUnique({ where: { id: req.params.productId }, select: { stock: true } }))?.stock || 0;
  logAudit(req, { module: 'inventario', action: 'ajuste_stock_almacen', summary: `Ajustó stock de un producto en un almacén a ${qty}`, refId: req.params.productId });
  res.json({ ok: true, total });
});

export default r;

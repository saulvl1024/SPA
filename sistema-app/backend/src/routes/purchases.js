import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth, requirePerm('compras'));
const money = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Proveedores ---------- */
r.get('/suppliers', async (_req, res) =>
  res.json(await prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } })));

r.post('/suppliers', async (req, res) => {
  const { name, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  res.status(201).json(await prisma.supplier.create({ data: { name, phone, email, notes } }));
});

r.put('/suppliers/:id', async (req, res) => {
  const { name, phone, email, notes } = req.body;
  res.json(await prisma.supplier.update({ where: { id: req.params.id }, data: { name, phone, email, notes } }));
});

r.delete('/suppliers/:id', async (req, res) => {
  await prisma.supplier.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

/* ---------- Compras ---------- */
r.get('/', async (req, res) => {
  const where = {};
  if (req.query.from && req.query.to) {
    const [fy, fm, fd] = req.query.from.split('-').map(Number);
    const [ty, tm, td] = req.query.to.split('-').map(Number);
    where.date = { gte: new Date(fy, fm - 1, fd, 0, 0, 0, 0), lte: new Date(ty, tm - 1, td, 23, 59, 59, 999) };
  }
  const purchases = await prisma.purchase.findMany({
    where, include: { supplier: true, items: true }, orderBy: { date: 'desc' }, take: 300,
  });
  res.json(purchases);
});

// Registrar una compra: suma stock y recalcula el COSTO PROMEDIO PONDERADO de cada artículo.
r.post('/', async (req, res) => {
  const { supplierId, invoiceNo, notes, items = [] } = req.body;
  if (!items.length) return res.status(400).json({ error: 'La compra no tiene artículos' });
  try {
    const purchase = await prisma.$transaction(async (tx) => {
      let total = 0;
      const created = [];

      // OPTIMIZACIÓN: precarga insumos y productos en 2 queries batch (en vez de 1 por item)
      // e indexa en Maps para lookup O(1). Los updates siguen por item (costo promedio ponderado).
      const uniq = arr => [...new Set(arr.filter(Boolean))];
      const supplyIds = uniq(items.filter(i => i.kind === 'supply').map(i => i.supplyId));
      const productIds = uniq(items.filter(i => i.kind === 'product').map(i => i.productId));
      const [supplyRows, productRows] = await Promise.all([
        supplyIds.length ? tx.supply.findMany({ where: { id: { in: supplyIds } } }) : [],
        productIds.length ? tx.product.findMany({ where: { id: { in: productIds } } }) : [],
      ]);
      const supplyMap = new Map(supplyRows.map(s => [s.id, s]));
      const productMap = new Map(productRows.map(p => [p.id, p]));

      for (const i of items) {
        const qty = Number(i.qty); const unitCost = Number(i.unitCost);
        if (!(qty > 0) || !(unitCost >= 0)) throw new Error('Cantidad o costo inválido');
        total += qty * unitCost;

        if (i.kind === 'supply') {
          const s = supplyMap.get(i.supplyId);
          if (!s) throw new Error('Insumo inválido');
          // Promedio ponderado: (valor_actual + valor_compra) / (stock_actual + qty)
          const newStock = s.stock + qty;
          const avg = newStock > 0 ? (s.stock * s.cost + qty * unitCost) / newStock : unitCost;
          await tx.supply.update({ where: { id: s.id }, data: { stock: newStock, cost: avg } });
          created.push({ kind: 'supply', supplyId: s.id, name: s.name, qty, unitCost });
        } else if (i.kind === 'product') {
          const p = productMap.get(i.productId);
          if (!p) throw new Error('Producto inválido');
          const newStock = p.stock + qty;
          const avg = newStock > 0 ? (p.stock * p.cost + qty * unitCost) / newStock : unitCost;
          await tx.product.update({ where: { id: p.id }, data: { stock: Math.round(newStock), cost: avg } });
          created.push({ kind: 'product', productId: p.id, name: p.name, qty, unitCost });
        } else throw new Error('Tipo de artículo inválido');
      }
      return tx.purchase.create({
        data: { supplierId: supplierId || null, invoiceNo: invoiceNo || null, notes: notes || null, total, staffId: req.user.id, items: { create: created } },
        include: { supplier: true, items: true },
      });
    });
    logAudit(req, {
      module: 'compras', action: 'compra',
      summary: `Compra por ${money(purchase.total)}${purchase.supplier ? ' a ' + purchase.supplier.name : ''}${purchase.invoiceNo ? ' (folio ' + purchase.invoiceNo + ')' : ''} · ${purchase.items.length} artículo(s)`,
      refId: purchase.id, meta: { total: purchase.total },
    });
    res.status(201).json(purchase);
  } catch (e) { res.status(400).json({ error: e.message || 'No se pudo registrar la compra' }); }
});

export default r;

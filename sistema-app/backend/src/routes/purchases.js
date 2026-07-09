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

/* ---------- Datos de prueba (solo admin) ---------- */
// Crea proveedores y varias compras de ejemplo repartidas en los últimos ~4 meses.
// Suma stock y recalcula costo como una compra real. Útil para demos.
r.post('/seed-demo', async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Solo el administrador puede cargar datos de prueba' });
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = arr => arr[rnd(0, arr.length - 1)];
  try {
    // 1) Proveedores demo (crea si no existen por nombre)
    const demoSuppliers = [
      { name: 'Distribuidora Bella S.A.', phone: '8110002233', email: 'ventas@bella.mx' },
      { name: 'Insumos Spa del Norte', phone: '8112223344', email: 'contacto@spanorte.mx' },
      { name: 'Cosméticos Premium', phone: '5544556677', email: 'pedidos@cospremium.mx' },
      { name: 'Mayoreo Estética MX', phone: '3312349876', email: 'mayoreo@esteticamx.com' },
    ];
    const suppliers = [];
    for (const s of demoSuppliers) {
      let sup = await prisma.supplier.findFirst({ where: { name: s.name } });
      if (!sup) sup = await prisma.supplier.create({ data: { ...s, notes: 'Proveedor de datos de prueba' } });
      suppliers.push(sup);
    }

    // 2) Productos: usa los existentes; si hay muy pocos, crea algunos demo
    let products = await prisma.product.findMany({ take: 20 });
    if (products.length < 4) {
      const demoProds = [
        { name: 'Shampoo Profesional 1L', price: 320, cost: 150 },
        { name: 'Acondicionador Reparador 1L', price: 300, cost: 140 },
        { name: 'Tinte Rubio Cenizo', price: 180, cost: 85 },
        { name: 'Toalla Facial (paq. 12)', price: 240, cost: 120 },
        { name: 'Mascarilla Hidratante', price: 260, cost: 110 },
        { name: 'Aceite de Argán 250ml', price: 420, cost: 210 },
      ];
      for (const p of demoProds) {
        const ex = await prisma.product.findFirst({ where: { name: p.name } });
        if (!ex) await prisma.product.create({ data: { ...p, stock: 0, minStock: 5, category: 'Datos de prueba' } });
      }
      products = await prisma.product.findMany({ take: 20 });
    }
    if (!products.length) return res.status(400).json({ error: 'No hay productos para generar compras' });

    // 3) Genera compras repartidas en los últimos 120 días
    let count = 0;
    for (let k = 0; k < 14; k++) {
      const date = new Date();
      date.setDate(date.getDate() - rnd(0, 120));
      date.setHours(rnd(9, 18), rnd(0, 59), 0, 0);
      const supplier = pick(suppliers);
      const nItems = rnd(1, 4);
      const used = new Set();
      const chosen = [];
      for (let j = 0; j < nItems; j++) {
        const p = pick(products);
        if (used.has(p.id)) continue;
        used.add(p.id);
        const base = p.cost || (p.price ? p.price * 0.5 : 50) || 50;
        const unitCost = Math.max(1, Math.round(base * (0.85 + Math.random() * 0.4)));
        chosen.push({ id: p.id, qty: rnd(3, 30), unitCost });
      }
      if (!chosen.length) continue;
      await prisma.$transaction(async (tx) => {
        let total = 0; const created = [];
        for (const c of chosen) {
          const fresh = await tx.product.findUnique({ where: { id: c.id } });
          if (!fresh) continue;
          const newStock = fresh.stock + c.qty;
          const avg = newStock > 0 ? (fresh.stock * fresh.cost + c.qty * c.unitCost) / newStock : c.unitCost;
          await tx.product.update({ where: { id: fresh.id }, data: { stock: Math.round(newStock), cost: avg } });
          total += c.qty * c.unitCost;
          created.push({ kind: 'product', productId: fresh.id, name: fresh.name, qty: c.qty, unitCost: c.unitCost });
        }
        if (created.length) {
          await tx.purchase.create({
            data: { supplierId: supplier.id, invoiceNo: 'F-' + rnd(1000, 9999), notes: 'Compra de prueba', date, total, staffId: req.user.id, items: { create: created } },
          });
        }
      });
      count++;
    }
    logAudit(req, { module: 'compras', action: 'seed_demo', summary: `Cargó ${count} compras de prueba` });
    res.json({ ok: true, purchases: count, suppliers: suppliers.length });
  } catch (e) { res.status(400).json({ error: e.message || 'No se pudieron crear los datos de prueba' }); }
});

export default r;

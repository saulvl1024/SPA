import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';

const r = Router();
r.use(auth, requirePerm('cocina'));

// Pantalla de cocina (KDS): comandas pendientes/en preparación, agrupadas por mesa.
// station opcional por query (?station=cocina|barra) para tener una pantalla por estación.
r.get('/', async (req, res) => {
  const station = req.query.station;
  const where = {
    kitchen: { in: ['pendiente', 'preparando'] },
    order: { status: 'abierta' },
  };
  if (station === 'cocina' || station === 'barra') where.station = station;
  else where.station = { in: ['cocina', 'barra'] };

  const items = await prisma.tableOrderItem.findMany({
    where,
    include: { order: { include: { table: true } } },
    orderBy: { sentAt: 'asc' },
  });

  // Agrupa por cuenta (ticket): cada comanda es una mesa+cuenta con sus platillos
  const byOrder = new Map();
  for (const it of items) {
    const o = it.order;
    if (!byOrder.has(o.id)) {
      const llevar = o.kind === 'llevar' || !o.tableId;
      byOrder.set(o.id, {
        orderId: o.id, label: o.label, kind: llevar ? 'llevar' : 'mesa',
        tableNumber: llevar ? 'Para llevar' : (o.table?.number || '—'),
        zone: llevar ? null : (o.table?.zone || null),
        openedAt: o.openedAt, items: [],
      });
    }
    byOrder.get(o.id).items.push({
      id: it.id, name: it.name, qty: it.qty, note: it.note,
      station: it.station, kitchen: it.kitchen, sentAt: it.sentAt,
    });
  }
  // ordena las comandas por el item más antiguo (la que lleva más esperando primero)
  const tickets = [...byOrder.values()].sort((a, b) =>
    new Date(a.items[0].sentAt || a.openedAt) - new Date(b.items[0].sentAt || b.openedAt));
  res.json(tickets);
});

// Conteo rápido de pendientes (para el badge del menú)
r.get('/count', async (_req, res) => {
  const n = await prisma.tableOrderItem.count({
    where: { kitchen: { in: ['pendiente', 'preparando'] }, station: { in: ['cocina', 'barra'] }, order: { status: 'abierta' } },
  });
  res.json({ pending: n });
});

// Cambiar el estado de un platillo: preparando | listo | entregado | pendiente
r.patch('/items/:itemId', async (req, res) => {
  const { kitchen } = req.body;
  const valid = ['pendiente', 'preparando', 'listo', 'entregado'];
  if (!valid.includes(kitchen)) return res.status(400).json({ error: 'Estado inválido' });
  const data = { kitchen };
  if (kitchen === 'listo') data.readyAt = new Date();
  const it = await prisma.tableOrderItem.update({ where: { id: req.params.itemId }, data });
  res.json(it);
});

// Marcar toda una comanda (cuenta) como lista de un golpe
r.patch('/orders/:orderId/ready', async (req, res) => {
  await prisma.tableOrderItem.updateMany({
    where: { orderId: req.params.orderId, kitchen: { in: ['pendiente', 'preparando'] }, station: { in: ['cocina', 'barra'] } },
    data: { kitchen: 'listo', readyAt: new Date() },
  });
  res.json({ ok: true });
});

// Enviar a cocina una comanda "Para llevar" desde el POS (sin mesa).
// Recibe items del carrito; solo se mandan los productos con estación cocina/barra.
// Devuelve { orderId, sent } para que el POS sepa cuántos se enviaron.
r.post('/takeaway', async (req, res) => {
  const { items, label, orderId } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Sin productos' });

  // Resuelve estación y nombre desde el catálogo (seguridad)
  const toSend = [];
  for (const it of items) {
    const q = Math.max(1, Math.floor(Number(it.qty) || 1));
    let name = it.name, station = 'ninguna';
    if (it.variantId) {
      const v = await prisma.productVariant.findUnique({ where: { id: it.variantId }, include: { product: true } });
      if (v) { name = `${v.product.name} (${v.name})`; station = v.product.station || 'ninguna'; }
    } else if (it.refId) {
      const p = await prisma.product.findUnique({ where: { id: it.refId } });
      if (p) { name = p.name; station = p.station || 'ninguna'; }
    }
    if (station === 'cocina' || station === 'barra') toSend.push({ name, qty: q, note: it.note || null, station, productId: it.refId || null, variantId: it.variantId || null });
  }
  if (!toSend.length) return res.json({ orderId: orderId || null, sent: 0 });

  // Reusa la comanda si el POS ya abrió una (agrega más platillos), o crea una nueva.
  let order = orderId ? await prisma.tableOrder.findUnique({ where: { id: orderId } }) : null;
  if (!order || order.status !== 'abierta') {
    order = await prisma.tableOrder.create({
      data: { tableId: null, kind: 'llevar', label: label || 'Para llevar', staffId: req.user.id },
    });
  }
  await prisma.tableOrderItem.createMany({
    data: toSend.map(t => ({
      orderId: order.id, productId: t.productId, variantId: t.variantId, type: 'producto',
      name: t.name, qty: t.qty, price: 0, note: t.note, station: t.station,
      kitchen: 'pendiente', sentAt: new Date(),
    })),
  });
  res.status(201).json({ orderId: order.id, sent: toSend.length });
});

// Cierra (marca como cobrada) la comanda para-llevar cuando el POS cobra la venta.
r.post('/takeaway/:orderId/close', async (req, res) => {
  await prisma.tableOrder.updateMany({
    where: { id: req.params.orderId, kind: 'llevar', status: 'abierta' },
    data: { status: 'cobrada', closedAt: new Date(), saleId: req.body.saleId || null },
  });
  res.json({ ok: true });
});

export default r;

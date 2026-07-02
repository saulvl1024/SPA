import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm, adminOnly } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { getLoyaltyConfig, pointsEarned } from '../lib/loyalty.js';

const r = Router();
r.use(auth, requirePerm('mesas'));

const sum = items => items.reduce((a, i) => a + i.price * i.qty, 0);

/* ---------- CONFIGURAR MESAS (admin) ---------- */
r.get('/', async (_req, res) => {
  const tables = await prisma.table.findMany({
    where: { active: true },
    include: { orders: { where: { status: 'abierta' }, include: { items: true } } },
    orderBy: [{ order: 'asc' }, { number: 'asc' }],
  });
  // estado calculado + total y antigüedad de la cuenta más vieja
  const data = tables.map(t => {
    const open = t.orders;
    const total = open.reduce((a, o) => a + sum(o.items), 0);
    const oldest = open.reduce((min, o) => (!min || o.openedAt < min ? o.openedAt : min), null);
    return {
      id: t.id, number: t.number, zone: t.zone, capacity: t.capacity, order: t.order,
      posX: t.posX, posY: t.posY, shape: t.shape,
      status: open.length ? 'ocupada' : 'libre',
      cuentas: open.length, total, openedAt: oldest,
    };
  });
  res.json(data);
});

r.post('/', adminOnly, async (req, res) => {
  const { number, zone, capacity, shape } = req.body;
  if (!number) return res.status(400).json({ error: 'Falta el número de mesa' });
  // coloca la mesa nueva en una rejilla automática para que no se encimen
  const count = await prisma.table.count({ where: { active: true } });
  const col = count % 5, row = Math.floor(count / 5);
  const t = await prisma.table.create({ data: {
    number: String(number), zone: zone || null, capacity: Number(capacity) || 4,
    shape: shape === 'square' ? 'square' : 'round',
    posX: 40 + col * 150, posY: 40 + row * 150,
  } });
  res.status(201).json(t);
});

r.put('/:id', adminOnly, async (req, res) => {
  const { number, zone, capacity, order, shape } = req.body;
  const t = await prisma.table.update({ where: { id: req.params.id }, data: {
    number: number != null ? String(number) : undefined, zone, capacity: capacity != null ? Number(capacity) : undefined, order: order != null ? Number(order) : undefined,
    shape: shape != null ? (shape === 'square' ? 'square' : 'round') : undefined,
  } });
  res.json(t);
});

// Guardar el acomodo del mapa (posiciones arrastradas). Admin.
r.patch('/layout', adminOnly, async (req, res) => {
  const { positions } = req.body; // [{ id, posX, posY }]
  if (!Array.isArray(positions)) return res.status(400).json({ error: 'Formato inválido' });
  await prisma.$transaction(positions.map(p =>
    prisma.table.update({ where: { id: p.id }, data: { posX: Math.round(Number(p.posX) || 0), posY: Math.round(Number(p.posY) || 0) } })
  ));
  res.json({ ok: true });
});

r.delete('/:id', adminOnly, async (req, res) => {
  // baja lógica; si tiene cuenta abierta no se permite
  const open = await prisma.tableOrder.count({ where: { tableId: req.params.id, status: 'abierta' } });
  if (open) return res.status(400).json({ error: 'La mesa tiene una cuenta abierta' });
  await prisma.table.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

/* ---------- CUENTAS DE UNA MESA ---------- */
// Ver las cuentas abiertas de una mesa (con items)
r.get('/:id/orders', async (req, res) => {
  const orders = await prisma.tableOrder.findMany({
    where: { tableId: req.params.id, status: 'abierta' },
    include: { items: { orderBy: { createdAt: 'asc' } } }, orderBy: { openedAt: 'asc' },
  });
  res.json(orders.map(o => ({ ...o, total: sum(o.items) })));
});

// Abrir una cuenta nueva en la mesa
r.post('/:id/orders', async (req, res) => {
  const count = await prisma.tableOrder.count({ where: { tableId: req.params.id, status: 'abierta' } });
  const order = await prisma.tableOrder.create({
    data: { tableId: req.params.id, label: req.body.label || `Cuenta ${count + 1}`, staffId: req.user.id },
    include: { items: true },
  });
  logAudit(req, { module: 'mesas', action: 'abrir_cuenta', summary: `Abrió ${order.label} en mesa`, refId: order.id });
  res.status(201).json({ ...order, total: 0 });
});

// Agregar un item a una cuenta (recalcula precio desde el catálogo: seguridad)
r.post('/orders/:orderId/items', async (req, res) => {
  const { productId, variantId, qty = 1, note } = req.body;
  const q = Math.max(1, Math.floor(Number(qty) || 1));
  let name, price, type = 'producto', station = 'ninguna';
  if (variantId) {
    const v = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
    if (!v) return res.status(400).json({ error: 'Variante inválida' });
    name = `${v.product.name} (${v.name})`; price = v.price != null ? v.price : v.product.price;
    station = v.product.station || 'ninguna';
  } else {
    const p = productId ? await prisma.product.findUnique({ where: { id: productId } }) : null;
    if (!p) return res.status(400).json({ error: 'Producto inválido' });
    name = p.name; price = p.price; station = p.station || 'ninguna';
  }
  // si el producto va a cocina/barra, se manda a la comanda de inmediato
  const goesToKDS = station === 'cocina' || station === 'barra';
  const item = await prisma.tableOrderItem.create({
    data: {
      orderId: req.params.orderId, productId: productId || null, variantId: variantId || null,
      type, name, price, qty: q, note: note || null, station,
      kitchen: goesToKDS ? 'pendiente' : 'ninguna', sentAt: goesToKDS ? new Date() : null,
    },
  });
  res.status(201).json(item);
});

// Quitar un item de una cuenta
r.delete('/orders/items/:itemId', async (req, res) => {
  await prisma.tableOrderItem.delete({ where: { id: req.params.itemId } });
  res.json({ ok: true });
});

// Mover un item de una cuenta a otra (separar cuentas)
r.patch('/orders/items/:itemId/move', async (req, res) => {
  const { toOrderId } = req.body;
  const item = await prisma.tableOrderItem.update({ where: { id: req.params.itemId }, data: { orderId: toOrderId } });
  res.json(item);
});

// Cancelar una cuenta (sin cobrar)
r.post('/orders/:orderId/cancel', adminOnly, async (req, res) => {
  const o = await prisma.tableOrder.update({ where: { id: req.params.orderId }, data: { status: 'cancelada', closedAt: new Date() } });
  logAudit(req, { module: 'mesas', action: 'cancelar_cuenta', summary: `Canceló ${o.label || 'cuenta'}`, refId: o.id });
  res.json({ ok: true });
});

// COBRAR una cuenta → genera una venta real, descuenta inventario, va al corte de caja
r.post('/orders/:orderId/checkout', async (req, res) => {
  const { clientId, paymentMethod = 'efectivo', payments } = req.body;
  try {
    const sale = await prisma.$transaction(async (tx) => {
      const order = await tx.tableOrder.findUnique({ where: { id: req.params.orderId }, include: { items: true, table: true } });
      if (!order || order.status !== 'abierta') throw new Error('Cuenta no encontrada o ya cobrada');
      if (!order.items.length) throw new Error('La cuenta está vacía');

      // Caja abierta: primero la del mesero; si no tiene, cualquier caja abierta del negocio
      // (restaurante con caja central: los cobros de mesa van a la caja del turno).
      const session = await tx.cashSession.findFirst({ where: { staffId: req.user.id, closed: false } })
        || await tx.cashSession.findFirst({ where: { closed: false }, orderBy: { openedAt: 'desc' } });

      const subtotal = sum(order.items);
      const total = subtotal;
      const loyaltyCfg = await getLoyaltyConfig();
      const pts = clientId ? pointsEarned(total, loyaltyCfg) : 0;

      // Cliente: usa el dado o un genérico "Mostrador"
      let finalClientId = clientId;
      if (!finalClientId) {
        let mostrador = await tx.client.findFirst({ where: { name: 'Mostrador' } });
        if (!mostrador) mostrador = await tx.client.create({ data: { name: 'Mostrador' } });
        finalClientId = mostrador.id;
      }

      const salePayments = (Array.isArray(payments) && payments.length)
        ? payments.map(p => ({ method: p.method, amount: Number(p.amount) }))
        : [{ method: paymentMethod, amount: total }];

      // OPTIMIZACIÓN: precarga los productos del pedido (con sus componentes) en 1 query batch
      // e indexa en un Map, en vez de 1 findUnique por item. Luego descuenta inventario.
      const prodIds = [...new Set(order.items.filter(it => it.productId).map(it => it.productId))];
      const prodRows = prodIds.length ? await tx.product.findMany({ where: { id: { in: prodIds } }, include: { components: true } }) : [];
      const prodMap = new Map(prodRows.map(p => [p.id, p]));

      for (const it of order.items) {
        if (it.variantId) await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { decrement: it.qty } } }).catch(() => {});
        else if (it.productId) {
          const p = prodMap.get(it.productId);
          if (p?.isBundle && p.components.length) {
            for (const c of p.components) await tx.product.update({ where: { id: c.componentId }, data: { stock: { decrement: c.qty * it.qty } } }).catch(() => {});
          } else if (p) {
            await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qty } } }).catch(() => {});
          }
        }
      }
      if (pts > 0) await tx.client.update({ where: { id: finalClientId }, data: { points: { increment: pts } } });

      const sale = await tx.sale.create({
        data: {
          clientId: finalClientId, cashierId: req.user.id, sessionId: session?.id || null,
          subtotal, discount: 0, creditUsed: 0, total, paymentMethod: salePayments[0].method, points: pts,
          items: { create: order.items.map(it => ({ type: it.type, refId: it.productId || null, name: it.name, qty: it.qty, price: it.price })) },
          payments: { create: salePayments },
        },
        include: { items: true, client: true, payments: true },
      });

      await tx.tableOrder.update({ where: { id: order.id }, data: { status: 'cobrada', closedAt: new Date(), saleId: sale.id } });
      return sale;
    });
    logAudit(req, { module: 'mesas', action: 'cobrar_cuenta', summary: `Cobró cuenta de mesa · venta #${sale.ticketNo} por $${sale.total}`, refId: sale.id });
    res.status(201).json(sale);
  } catch (e) { res.status(400).json({ error: e.message || 'No se pudo cobrar' }); }
});

export default r;

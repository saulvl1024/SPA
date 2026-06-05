import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const r = Router();
r.use(auth);

// Historial (admin: todas; empleada: las suyas). ?date=YYYY-MM-DD opcional
r.get('/', async (req, res) => {
  const where = {};
  if (req.query.date) {
    const d = new Date(req.query.date);
    const s = new Date(d); s.setHours(0,0,0,0);
    const e = new Date(d); e.setHours(23,59,59,999);
    where.date = { gte: s, lte: e };
  }
  if (req.user.role !== 'admin') where.cashierId = req.user.id;
  const sales = await prisma.sale.findMany({
    where, include: { client: true, cashier: true, items: true },
    orderBy: { date: 'desc' }, take: 500,
  });
  res.json(sales);
});

// Cobrar: crea venta, descuenta stock, sesiones, saldo; otorga puntos
r.post('/', async (req, res) => {
  const { clientId, sessionId, items = [], discount = 0, useCredit = false, paymentMethod = 'efectivo' } = req.body;
  if (!clientId || !items.length) return res.status(400).json({ error: 'Venta vacía' });

  const sale = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } });
    const subtotal = items.reduce((a, i) => a + i.price * (i.qty || 1), 0);
    const creditUsed = useCredit ? Math.min(client.credit, subtotal - discount) : 0;
    const total = subtotal - discount - creditUsed;
    const points = Math.round(total / 10);

    for (const i of items) {
      if (i.type === 'producto' && i.refId)
        await tx.product.update({ where: { id: i.refId }, data: { stock: { decrement: i.qty || 1 } } });
      if (i.type === 'servicio' && i.fromPackage && i.packageId)
        await tx.clientPackage.update({ where: { id: i.packageId }, data: { remaining: { decrement: 1 } } });
      if (i.type === 'servicio' && !i.fromPackage && i.refId) {
        const recipe = await tx.serviceSupply.findMany({ where: { serviceId: i.refId } });
        for (const rs of recipe)
          await tx.supply.update({ where: { id: rs.supplyId }, data: { stock: { decrement: rs.qty } } });
      }
      if (i.type === 'anticipo')
        await tx.client.update({ where: { id: clientId }, data: { credit: { increment: i.price } } });
    }
    if (creditUsed > 0)
      await tx.client.update({ where: { id: clientId }, data: { credit: { decrement: creditUsed } } });
    await tx.client.update({ where: { id: clientId }, data: { points: { increment: points } } });

    return tx.sale.create({
      data: {
        clientId, cashierId: req.user.id, sessionId: sessionId || null,
        subtotal, discount, creditUsed, total, paymentMethod, points,
        items: { create: items.map(i => ({
          type: i.type, refId: i.refId || null, name: i.name, qty: i.qty || 1,
          price: i.price, specialistId: i.specialistId || null, fromPackage: !!i.fromPackage,
        })) },
      },
      include: { items: true, client: true },
    });
  });

  res.status(201).json(sale);
});

export default r;

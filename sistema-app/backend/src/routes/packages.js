import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia'];
const cents = n => Math.round((Number(n) || 0) * 100);

function normalizePayments(total, paymentMethod, payments) {
  if (!Array.isArray(payments) || payments.length === 0) return [{ method: paymentMethod, amount: total }];
  if (payments.length > 3) throw new Error('Máximo 3 métodos de pago');

  const seen = new Set();
  const clean = payments.map(p => {
    const method = p.method || p.paymentMethod;
    const amount = Number(p.amount);
    if (!PAYMENT_METHODS.includes(method)) throw new Error('Método de pago inválido');
    if (seen.has(method)) throw new Error('Usa cada método de pago una sola vez');
    seen.add(method);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Cada pago debe tener un monto mayor a cero');
    return { method, amount };
  });

  if (clean.reduce((a, p) => a + cents(p.amount), 0) !== cents(total)) throw new Error('Los pagos no cuadran con el total');
  return clean;
}

// Paquetes activos (todos o por cliente con ?clientId=)
r.get('/active', async (req, res) => {
  const where = {};
  if (req.query.clientId) where.clientId = req.query.clientId;
  const list = await prisma.clientPackage.findMany({
    where, include: { client: true, package: true }, orderBy: { createdAt: 'desc' },
  });
  res.json(list);
});

// Vender un paquete (crea ClientPackage + venta)
r.post('/sell', async (req, res) => {
  const { clientId, packageId, serviceId, sessionId, paymentMethod = 'efectivo', payments } = req.body;
  const pk = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pk) return res.status(404).json({ error: 'Paquete no existe' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + pk.validityMonths);
      const cp = await tx.clientPackage.create({
        data: { clientId, packageId, serviceId: serviceId || null, total: pk.sessions, remaining: pk.sessions, expiresAt },
      });
      const points = Math.round(pk.price / 10);
      const salePayments = normalizePayments(pk.price, paymentMethod, payments);
      await tx.client.update({ where: { id: clientId }, data: { points: { increment: points } } });
      const sale = await tx.sale.create({
        data: {
          clientId, cashierId: req.user.id, sessionId: sessionId || null,
          subtotal: pk.price, discount: 0, creditUsed: 0, total: pk.price, paymentMethod: salePayments[0].method, points,
          items: { create: [{ type: 'paquete', refId: packageId, name: 'Paquete ' + pk.name, qty: 1, price: pk.price }] },
          payments: { create: salePayments },
        },
      });
      return { cp, sale };
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo vender el paquete' });
  }
});

// Descontar una sesión
r.patch('/:id/use', async (req, res) => {
  const cp = await prisma.clientPackage.findUnique({ where: { id: req.params.id } });
  if (!cp || cp.remaining <= 0) return res.status(400).json({ error: 'Sin sesiones disponibles' });
  const updated = await prisma.clientPackage.update({
    where: { id: req.params.id }, data: { remaining: { decrement: 1 } },
  });
  res.json(updated);
});

export default r;

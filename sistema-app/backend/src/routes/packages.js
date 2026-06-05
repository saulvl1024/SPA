import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

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
  const { clientId, packageId, serviceId, sessionId, paymentMethod = 'efectivo' } = req.body;
  const pk = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pk) return res.status(404).json({ error: 'Paquete no existe' });

  const result = await prisma.$transaction(async (tx) => {
    const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + pk.validityMonths);
    const cp = await tx.clientPackage.create({
      data: { clientId, packageId, serviceId: serviceId || null, total: pk.sessions, remaining: pk.sessions, expiresAt },
    });
    const points = Math.round(pk.price / 10);
    await tx.client.update({ where: { id: clientId }, data: { points: { increment: points } } });
    const sale = await tx.sale.create({
      data: {
        clientId, cashierId: req.user.id, sessionId: sessionId || null,
        subtotal: pk.price, discount: 0, creditUsed: 0, total: pk.price, paymentMethod, points,
        items: { create: [{ type: 'paquete', refId: packageId, name: 'Paquete ' + pk.name, qty: 1, price: pk.price }] },
      },
    });
    return { cp, sale };
  });
  res.status(201).json(result);
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

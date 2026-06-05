import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

// Citas por día: ?date=YYYY-MM-DD
r.get('/', async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);
  const appts = await prisma.appointment.findMany({
    where: { start: { gte: start, lte: end } },
    include: { client: true, staff: true, service: true },
    orderBy: { start: 'asc' },
  });
  res.json(appts);
});

r.post('/', async (req, res) => {
  const { clientId, staffId, serviceId, start } = req.body;
  if (!clientId || !staffId || !serviceId || !start)
    return res.status(400).json({ error: 'Faltan datos' });
  const appt = await prisma.appointment.create({
    data: { clientId, staffId, serviceId, start: new Date(start), status: 'agendada' },
  });
  res.status(201).json(appt);
});

// Cambiar estado; al completar descuenta insumos y sesión de paquete
r.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appt) return res.status(404).json({ error: 'No encontrada' });

  if (status === 'completada' && appt.status !== 'completada') {
    const recipe = await prisma.serviceSupply.findMany({ where: { serviceId: appt.serviceId } });
    for (const item of recipe) {
      await prisma.supply.update({
        where: { id: item.supplyId },
        data: { stock: { decrement: item.qty } },
      });
    }
    const cp = await prisma.clientPackage.findFirst({
      where: { clientId: appt.clientId, serviceId: appt.serviceId, remaining: { gt: 0 } },
    });
    if (cp) await prisma.clientPackage.update({ where: { id: cp.id }, data: { remaining: { decrement: 1 } } });
  }

  const updated = await prisma.appointment.update({
    where: { id: req.params.id }, data: { status },
  });
  res.json(updated);
});

export default r;

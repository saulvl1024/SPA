import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const r = Router();
r.use(auth);

function summarize(sales, fondo = 0) {
  const m = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  let total = 0;
  for (const s of sales) { m[s.paymentMethod] = (m[s.paymentMethod] || 0) + s.total; total += s.total; }
  return { byMethod: m, total, tickets: sales.length, esperadoEfectivo: fondo + m.efectivo };
}

// Caja abierta del usuario actual (o null)
r.get('/current', async (req, res) => {
  const session = await prisma.cashSession.findFirst({
    where: { staffId: req.user.id, closed: false },
    include: { sales: true },
  });
  if (!session) return res.json(null);
  res.json({ ...session, summary: summarize(session.sales, session.fondo) });
});

// Abrir caja
r.post('/open', async (req, res) => {
  const open = await prisma.cashSession.findFirst({ where: { staffId: req.user.id, closed: false } });
  if (open) return res.json(open);
  const session = await prisma.cashSession.create({
    data: { staffId: req.user.id, fondo: Number(req.body.fondo) || 0 },
  });
  res.status(201).json(session);
});

// Cerrar caja (corte)
r.post('/close', async (req, res) => {
  const session = await prisma.cashSession.findFirst({
    where: { staffId: req.user.id, closed: false }, include: { sales: true, staff: true },
  });
  if (!session) return res.status(400).json({ error: 'No hay caja abierta' });
  const sum = summarize(session.sales, session.fondo);
  const countedCash = Number(req.body.countedCash) || 0;
  const closed = await prisma.cashSession.update({
    where: { id: session.id }, data: { closed: true, closedAt: new Date(), countedCash },
  });
  res.json({
    ...closed, userName: session.staff.name, ...sum, countedCash,
    diff: countedCash - sum.esperadoEfectivo,
  });
});

// Cortes guardados (admin)
r.get('/cuts', adminOnly, async (_req, res) => {
  const sessions = await prisma.cashSession.findMany({
    where: { closed: true }, include: { sales: true, staff: true }, orderBy: { closedAt: 'desc' },
  });
  res.json(sessions.map(s => {
    const sum = summarize(s.sales, s.fondo);
    return {
      id: s.id, date: s.closedAt, userName: s.staff.name, fondo: s.fondo,
      ...sum, countedCash: s.countedCash, diff: (s.countedCash || 0) - sum.esperadoEfectivo,
    };
  }));
});

export default r;

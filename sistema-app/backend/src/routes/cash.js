import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
const adminOnly = requirePerm('caja');
import { summarizeCash } from '../lib/calc.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth);
const money = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const summarize = summarizeCash; // lógica de cálculo en lib/calc.js (probada por unit tests)
async function cashOutFor(sessionId) {
  const outs = await prisma.expense.findMany({ where: { sessionId, category: 'Salida de efectivo' } });
  return outs.reduce((a, e) => a + e.amount, 0);
}

// Caja abierta del usuario actual (o null)
r.get('/current', async (req, res) => {
  const session = await prisma.cashSession.findFirst({
    where: { staffId: req.user.id, closed: false },
    include: { sales: { include: { payments: true } } },
  });
  if (!session) return res.json(null);
  const cashOut = await cashOutFor(session.id);
  res.json({ ...session, summary: summarize(session.sales, session.fondo, cashOut) });
});

// Abrir caja — validación a prueba de doble apertura (doble clic / dos pestañas)
// La caja se abre a nombre de la CAJERA identificada por PIN (cashierId), o de quien tiene la sesión.
r.post('/open', async (req, res) => {
  try {
    // Resuelve la cajera: si viene cashierId (validado por PIN en el front), úsalo si es staff activo.
    let staffId = req.user.id;
    if (req.body.cashierId) {
      const cajera = await prisma.staff.findFirst({ where: { id: req.body.cashierId, active: true } });
      if (cajera) staffId = cajera.id;
    }
    const { session, yaExistia } = await prisma.$transaction(async (tx) => {
      // Vuelve a verificar DENTRO de la transacción para evitar carreras
      const open = await tx.cashSession.findFirst({ where: { staffId, closed: false } });
      if (open) return { session: open, yaExistia: true };
      const created = await tx.cashSession.create({
        data: { staffId, fondo: Number(req.body.fondo) || 0 },
      });
      return { session: created, yaExistia: false };
    });
    if (yaExistia) {
      // No crear otra: informar que ya hay una caja abierta y devolver la existente
      return res.status(200).json({ ...session, alreadyOpen: true });
    }
    logAudit(req, { module: 'caja', action: 'abrir_caja', summary: `Abrió caja con fondo ${money(session.fondo)}`, refId: session.id });
    res.status(201).json(session);
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo abrir la caja' });
  }
});

// Cerrar caja (corte)
r.post('/close', async (req, res) => {
  const session = await prisma.cashSession.findFirst({
    where: { staffId: req.user.id, closed: false }, include: { sales: { include: { payments: true } }, staff: true },
  });
  if (!session) return res.status(400).json({ error: 'No hay caja abierta' });
  const cashOut = await cashOutFor(session.id);
  const sum = summarize(session.sales, session.fondo, cashOut);
  const countedCash = Number(req.body.countedCash) || 0;
  const closed = await prisma.cashSession.update({
    where: { id: session.id }, data: { closed: true, closedAt: new Date(), countedCash },
  });
  const diff = countedCash - sum.esperadoEfectivo;
  logAudit(req, {
    module: 'caja', action: 'corte',
    summary: `Corte de caja · esperado ${money(sum.esperadoEfectivo)}, contado ${money(countedCash)}, diferencia ${money(diff)}`,
    refId: session.id, meta: { esperado: sum.esperadoEfectivo, contado: countedCash, diff },
  });
  res.json({
    ...closed, userName: session.staff.name, ...sum, countedCash,
    diff,
  });
});

// Cajas actualmente abiertas (admin) — quién, desde cuándo y su resumen
r.get('/open-sessions', adminOnly, async (_req, res) => {
  const sessions = await prisma.cashSession.findMany({
    where: { closed: false }, include: { sales: { include: { payments: true } }, staff: true }, orderBy: { openedAt: 'asc' },
  });
  const result = await Promise.all(sessions.map(async s => {
    const sum = summarize(s.sales, s.fondo, await cashOutFor(s.id));
    return { id: s.id, openedAt: s.openedAt, userName: s.staff.name, fondo: s.fondo, ...sum };
  }));
  res.json(result);
});

// Forzar corte de una caja específica (admin) — útil para cajas que quedaron abiertas
r.post('/close/:id', adminOnly, async (req, res) => {
  const session = await prisma.cashSession.findFirst({
    where: { id: req.params.id, closed: false }, include: { sales: { include: { payments: true } }, staff: true },
  });
  if (!session) return res.status(404).json({ error: 'Caja no encontrada o ya cerrada' });
  const cashOut = await cashOutFor(session.id);
  const sum = summarize(session.sales, session.fondo, cashOut);
  const countedCash = req.body.countedCash != null ? Number(req.body.countedCash) : sum.esperadoEfectivo;
  const closed = await prisma.cashSession.update({
    where: { id: session.id }, data: { closed: true, closedAt: new Date(), countedCash },
  });
  const diff = countedCash - sum.esperadoEfectivo;
  logAudit(req, {
    module: 'caja', action: 'corte_forzado',
    summary: `Corte forzado (admin) de la caja de ${session.staff.name} · esperado ${money(sum.esperadoEfectivo)}, contado ${money(countedCash)}, diferencia ${money(diff)}`,
    refId: session.id, meta: { esperado: sum.esperadoEfectivo, contado: countedCash, diff, cajera: session.staff.name },
  });
  res.json({ ...closed, userName: session.staff.name, ...sum, countedCash, diff });
});

// Cortes guardados (admin) — últimos 100, sin N+1
r.get('/cuts', adminOnly, async (_req, res) => {
  const sessions = await prisma.cashSession.findMany({
    where: { closed: true }, include: { sales: { include: { payments: true } }, staff: true },
    orderBy: { closedAt: 'desc' }, take: 100,
  });
  // UNA sola consulta de salidas de efectivo de todas estas sesiones
  const ids = sessions.map(s => s.id);
  const outs = ids.length
    ? await prisma.expense.findMany({ where: { sessionId: { in: ids }, category: 'Salida de efectivo' }, select: { sessionId: true, amount: true } })
    : [];
  const outBySession = {};
  outs.forEach(o => { outBySession[o.sessionId] = (outBySession[o.sessionId] || 0) + o.amount; });

  const result = sessions.map(s => {
    const sum = summarize(s.sales, s.fondo, outBySession[s.id] || 0);
    return {
      id: s.id, date: s.closedAt, userName: s.staff.name, fondo: s.fondo,
      ...sum, countedCash: s.countedCash, diff: (s.countedCash || 0) - sum.esperadoEfectivo,
    };
  });
  res.json(result);
});

export default r;

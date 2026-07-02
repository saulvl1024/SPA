import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth);
const money = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Listar gastos por día (?date=YYYY-MM-DD) o todos — módulo "gastos"
r.get('/', requirePerm('gastos'), async (req, res) => {
  const where = {};
  if (req.query.date) {
    const [y, m, d] = req.query.date.split('-').map(Number);
    where.date = { gte: new Date(y, m - 1, d, 0, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59, 999) };
  }
  const expenses = await prisma.expense.findMany({ where, orderBy: { date: 'desc' }, take: 500 });
  res.json(expenses);
});

// Registrar gasto
r.post('/', async (req, res) => {
  const { amount, category, note, sessionId } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Monto inválido' });
  const expense = await prisma.expense.create({
    data: { amount: Number(amount), category: category || 'General', note: note || null, staffId: req.user.id, sessionId: sessionId || null },
  });
  logAudit(req, { module: 'gastos', action: 'gasto', summary: `Gasto ${money(expense.amount)} (${expense.category})${expense.note ? ' · ' + expense.note : ''}`, refId: expense.id });
  res.status(201).json(expense);
});

// Salida de efectivo ligada a la caja abierta del usuario (afecta el corte)
r.post('/cash-out', async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Monto inválido' });
  const session = await prisma.cashSession.findFirst({ where: { staffId: req.user.id, closed: false } });
  if (!session) return res.status(400).json({ error: 'No hay caja abierta' });
  const expense = await prisma.expense.create({
    data: { amount: Number(amount), category: 'Salida de efectivo', note: note || null, staffId: req.user.id, sessionId: session.id },
  });
  logAudit(req, { module: 'caja', action: 'salida_efectivo', summary: `Salida de efectivo ${money(expense.amount)}${expense.note ? ' · ' + expense.note : ''}`, refId: expense.id });
  res.status(201).json(expense);
});

// Eliminar (admin)
r.delete('/:id', adminOnly, async (req, res) => {
  const ex = await prisma.expense.findUnique({ where: { id: req.params.id } });
  await prisma.expense.delete({ where: { id: req.params.id } });
  logAudit(req, { module: 'gastos', action: 'eliminar_gasto', summary: `Eliminó gasto ${ex ? money(ex.amount) + ' (' + ex.category + ')' : req.params.id}`, refId: req.params.id });
  res.json({ ok: true });
});

export default r;

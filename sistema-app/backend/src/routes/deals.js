import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth, requirePerm('crm'));

const money = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Etapas por defecto (estándar de ventas) — se crean la primera vez
const DEFAULT_STAGES = [
  { name: 'Prospecto', order: 0 },
  { name: 'Contactado', order: 1 },
  { name: 'Propuesta', order: 2 },
  { name: 'Negociación', order: 3 },
  { name: 'Ganado', order: 4, isWon: true },
  { name: 'Perdido', order: 5, isLost: true },
];

async function ensureStages() {
  const count = await prisma.dealStage.count();
  if (count === 0) {
    for (const s of DEFAULT_STAGES) await prisma.dealStage.create({ data: s });
  }
  return prisma.dealStage.findMany({ orderBy: { order: 'asc' } });
}

// Tablero: etapas con sus tratos y totales
r.get('/board', async (req, res) => {
  const stages = await ensureStages();
  // Filtro opcional por vendedor (?ownerId). El staff trae nombre para mostrar en la tarjeta.
  const where = req.query.ownerId ? { ownerId: req.query.ownerId } : {};
  const deals = await prisma.deal.findMany({
    where,
    include: { client: { select: { name: true, phone: true } }, owner: { select: { id: true, name: true } } },
    orderBy: { order: 'asc' },
  });
  const now = Date.now();
  const board = stages.map(st => {
    const items = deals.filter(d => d.stageId === st.id);
    return {
      id: st.id, name: st.name, order: st.order, isWon: st.isWon, isLost: st.isLost,
      total: items.reduce((a, d) => a + (d.amount || 0), 0),
      count: items.length,
      deals: items.map(d => ({
        id: d.id, title: d.title, amount: d.amount, order: d.order,
        clientId: d.clientId, clientName: d.client?.name || d.contactName || null,
        clientPhone: d.client?.phone || null,
        ownerId: d.ownerId, ownerName: d.owner?.name || null,
        notes: d.notes,
        createdAt: d.createdAt,
        days: d.createdAt ? Math.floor((now - new Date(d.createdAt).getTime()) / 86400000) : 0,
      })),
    };
  });
  // Lista de vendedores con tratos (para el filtro) — SIEMPRE completa, sin importar el filtro activo.
  const ownerGroups = await prisma.deal.groupBy({ by: ['ownerId'], where: { ownerId: { not: null } } });
  const ownerIds = ownerGroups.map(g => g.ownerId);
  const owners = ownerIds.length
    ? await prisma.staff.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : [];
  res.json({ stages: board, sellers: owners });
});

// MÉTRICAS del embudo: conversión y tiempo por etapa. Acepta ?ownerId para filtrar por vendedor.
r.get('/metrics', async (req, res) => {
  const stages = await ensureStages();
  const where = req.query.ownerId ? { ownerId: req.query.ownerId } : {};
  const deals = await prisma.deal.findMany({ where, select: { stageId: true, amount: true, createdAt: true, closedAt: true } });

  const now = Date.now();
  const wonStage = stages.find(s => s.isWon);
  const lostStage = stages.find(s => s.isLost);

  // Por etapa: conteo, valor y días promedio en etapa (de los abiertos)
  const byStage = stages.map(st => {
    const items = deals.filter(d => d.stageId === st.id);
    const open = items.filter(() => !st.isWon && !st.isLost);
    const avgDays = open.length
      ? Math.round(open.reduce((a, d) => a + (now - new Date(d.createdAt).getTime()) / 86400000, 0) / open.length)
      : 0;
    return {
      id: st.id, name: st.name, isWon: st.isWon, isLost: st.isLost,
      count: items.length,
      total: items.reduce((a, d) => a + (d.amount || 0), 0),
      avgDays,
    };
  });

  const won = wonStage ? deals.filter(d => d.stageId === wonStage.id) : [];
  const lost = lostStage ? deals.filter(d => d.stageId === lostStage.id) : [];
  const closed = won.length + lost.length;
  const total = deals.length;

  // Tiempo promedio de cierre (días desde creación hasta closedAt) de los ganados
  const wonClosed = won.filter(d => d.closedAt);
  const avgCloseDays = wonClosed.length
    ? Math.round(wonClosed.reduce((a, d) => a + (new Date(d.closedAt) - new Date(d.createdAt)) / 86400000, 0) / wonClosed.length)
    : 0;

  res.json({
    total,
    openCount: total - closed,
    wonCount: won.length,
    lostCount: lost.length,
    wonValue: won.reduce((a, d) => a + (d.amount || 0), 0),
    // Tasa de conversión: ganados / (ganados + perdidos)
    winRate: closed ? Math.round((won.length / closed) * 100) : 0,
    avgCloseDays,
    byStage,
  });
});

// TABLERO POR VENDEDOR: desempeño de cada vendedor (para el admin).
r.get('/sellers-board', async (_req, res) => {
  const stages = await ensureStages();
  const wonId = stages.find(s => s.isWon)?.id;
  const lostId = stages.find(s => s.isLost)?.id;

  const [deals, staff, followups] = await Promise.all([
    prisma.deal.findMany({ where: { ownerId: { not: null } }, select: { ownerId: true, amount: true, stageId: true } }),
    prisma.staff.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.followUp.findMany({ where: { done: false, staffId: { not: null } }, select: { staffId: true, dueDate: true } }),
  ]);

  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const staffName = new Map(staff.map(s => [s.id, s.name]));

  // Agrupa por vendedor
  const rows = new Map(); // ownerId -> stats
  const ensure = id => {
    if (!rows.has(id)) rows.set(id, { id, name: staffName.get(id) || 'Sin nombre', open: 0, openValue: 0, won: 0, lost: 0, tasksPending: 0, tasksOverdue: 0 });
    return rows.get(id);
  };
  deals.forEach(d => {
    const r = ensure(d.ownerId);
    if (d.stageId === wonId) r.won++;
    else if (d.stageId === lostId) r.lost++;
    else { r.open++; r.openValue += d.amount || 0; }
  });
  followups.forEach(f => {
    const r = ensure(f.staffId);
    r.tasksPending++;
    if (f.dueDate && new Date(f.dueDate) < startToday) r.tasksOverdue++;
  });

  const list = [...rows.values()].map(r => ({
    ...r,
    winRate: (r.won + r.lost) ? Math.round((r.won / (r.won + r.lost)) * 100) : 0,
  })).sort((a, b) => b.openValue - a.openValue);

  res.json(list);
});

// Etapas (para selectores / configuración)
r.get('/stages', async (_req, res) => res.json(await ensureStages()));

// Crear trato
r.post('/', async (req, res) => {
  const { title, amount, clientId, contactName, stageId, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Falta el título del trato' });
  const stages = await ensureStages();
  const stage = stageId ? stages.find(s => s.id === stageId) : stages[0];
  if (!stage) return res.status(400).json({ error: 'Etapa inválida' });
  const amt = Math.min(Math.max(Number(amount) || 0, 0), 999999999); // 0 .. ~1,000 millones
  const deal = await prisma.deal.create({
    data: {
      title, amount: amt, clientId: clientId || null,
      contactName: contactName || null, stageId: stage.id, notes: notes || null,
      ownerId: req.user.id, order: Date.now(),
    },
    include: { client: true },
  });
  logAudit(req, { module: 'crm', action: 'crear_trato', summary: `Creó trato "${deal.title}" (${money(deal.amount)}) en ${stage.name}`, refId: deal.id });
  res.status(201).json(deal);
});

// Editar trato
r.put('/:id', async (req, res) => {
  const { title, amount, clientId, contactName, notes } = req.body;
  const data = {};
  if (title !== undefined) data.title = title;
  if (amount !== undefined) data.amount = Math.min(Math.max(Number(amount) || 0, 0), 999999999);
  if (clientId !== undefined) data.clientId = clientId || null;
  if (contactName !== undefined) data.contactName = contactName || null;
  if (notes !== undefined) data.notes = notes || null;
  const deal = await prisma.deal.update({ where: { id: req.params.id }, data });
  res.json(deal);
});

// Mover trato de etapa (drag & drop)
r.patch('/:id/move', async (req, res) => {
  const { stageId, order } = req.body;
  const stage = await prisma.dealStage.findUnique({ where: { id: stageId } });
  if (!stage) return res.status(400).json({ error: 'Etapa inválida' });
  const closedAt = (stage.isWon || stage.isLost) ? new Date() : null;
  const deal = await prisma.deal.update({
    where: { id: req.params.id },
    data: { stageId, order: order != null ? Number(order) : Date.now(), closedAt },
    include: { client: true },
  });
  logAudit(req, { module: 'crm', action: 'mover_trato', summary: `Movió trato "${deal.title}" a ${stage.name}`, refId: deal.id });
  res.json(deal);
});

// Eliminar trato
r.delete('/:id', async (req, res) => {
  const d = await prisma.deal.findUnique({ where: { id: req.params.id } });
  await prisma.deal.delete({ where: { id: req.params.id } });
  logAudit(req, { module: 'crm', action: 'eliminar_trato', summary: `Eliminó trato "${d?.title || req.params.id}"`, refId: req.params.id });
  res.json({ ok: true });
});

/* ===================== ACTIVIDADES DEL TRATO ===================== */
const ACTIVITY_TYPES = ['llamada', 'whatsapp', 'correo', 'reunion', 'nota', 'tarea'];

// Historial de actividades de un trato (más reciente primero)
r.get('/:id/activities', async (req, res) => {
  const acts = await prisma.dealActivity.findMany({ where: { dealId: req.params.id }, orderBy: { createdAt: 'desc' } });
  res.json(acts);
});

// Registrar una actividad. Si es tarea/recordatorio con fecha y el trato tiene cliente,
// crea también un FollowUp ligado a ese cliente → aparece en la pestaña Seguimientos.
r.post('/:id/activities', async (req, res) => {
  const { type, note, dueDate } = req.body;
  if (!ACTIVITY_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de actividad inválido' });
  const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
  if (!deal) return res.status(404).json({ error: 'Trato no encontrado' });

  let followUpId = null;
  // Toda "tarea" genera un seguimiento (con o sin fecha), si el trato tiene cliente.
  // El responsable del recordatorio es el dueño del trato; si no, quien la registró.
  if (type === 'tarea' && deal.clientId) {
    const fu = await prisma.followUp.create({
      data: {
        clientId: deal.clientId,
        title: note?.trim() || `Seguimiento: ${deal.title}`,
        dueDate: dueDate ? new Date(dueDate) : null,
        kind: 'trato',
        staffId: deal.ownerId || req.user.id,
      },
    });
    followUpId = fu.id;
  }
  const act = await prisma.dealActivity.create({
    data: {
      dealId: req.params.id, type, note: note || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      followUpId, staffId: req.user.id,
    },
  });
  const labels = { llamada: 'Llamada', whatsapp: 'WhatsApp', correo: 'Correo', reunion: 'Reunión', nota: 'Nota', tarea: 'Tarea' };
  logAudit(req, { module: 'crm', action: 'actividad_trato', summary: `${labels[type]} en trato "${deal.title}"`, refId: deal.id });
  res.status(201).json(act);
});

// Marcar una actividad-tarea como hecha (y su FollowUp si lo tiene)
r.patch('/activities/:actId/done', async (req, res) => {
  const act = await prisma.dealActivity.update({ where: { id: req.params.actId }, data: { done: true } });
  if (act.followUpId) await prisma.followUp.update({ where: { id: act.followUpId }, data: { done: true } }).catch(() => {});
  res.json(act);
});

export default r;

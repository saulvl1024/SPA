import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth, requirePerm('crm'));

const money = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Etapas por defecto por embudo — se crean la primera vez que se abre cada uno
const DEFAULT_STAGES = {
  b2c: [
    { name: 'Nuevo', order: 0 },
    { name: 'Contactado', order: 1 },
    { name: 'Interesado', order: 2 },
    { name: 'Ganado', order: 3, isWon: true },
    { name: 'Perdido', order: 4, isLost: true },
  ],
  b2b: [
    { name: 'Prospecto', order: 0 },
    { name: 'Calificación', order: 1 },
    { name: 'Propuesta', order: 2 },
    { name: 'Negociación', order: 3 },
    { name: 'Ganado', order: 4, isWon: true },
    { name: 'Perdido', order: 5, isLost: true },
  ],
};
const PIPE = p => (p === 'b2b' ? 'b2b' : 'b2c'); // normaliza el embudo

// Memoriza el sembrado por embudo para evitar duplicados por peticiones simultáneas (carrera).
const seedLocks = {};
async function ensureStages(pipeline = 'b2c') {
  const pipe = PIPE(pipeline);
  if (!seedLocks[pipe]) {
    seedLocks[pipe] = (async () => {
      const existing = await prisma.dealStage.findMany({ where: { pipeline: pipe }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
      if (existing.length === 0) {
        for (const s of (DEFAULT_STAGES[pipe] || DEFAULT_STAGES.b2c)) await prisma.dealStage.create({ data: { ...s, pipeline: pipe } });
      } else {
        // Limpia duplicados por nombre (creados por carreras previas): conserva el primero y mueve sus tratos
        const seen = new Map();
        for (const st of existing) {
          const key = st.name.trim().toLowerCase();
          if (seen.has(key)) {
            await prisma.deal.updateMany({ where: { stageId: st.id }, data: { stageId: seen.get(key) } });
            await prisma.dealStage.delete({ where: { id: st.id } });
          } else seen.set(key, st.id);
        }
      }
    })().catch(() => { seedLocks[pipe] = null; }); // si falla, permite reintentar
  }
  await seedLocks[pipe];
  return prisma.dealStage.findMany({ where: { pipeline: pipe }, orderBy: { order: 'asc' } });
}

// Tablero: etapas con sus tratos y totales
r.get('/board', async (req, res) => {
  const stages = await ensureStages(req.query.pipeline);
  const stageIds = stages.map(s => s.id);
  // Solo los tratos de las etapas de ESTE embudo. Filtro opcional por vendedor (?ownerId).
  const where = { stageId: { in: stageIds } };
  if (req.query.ownerId) where.ownerId = req.query.ownerId;
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
  const stages = await ensureStages(req.query.pipeline);
  const stageIds = stages.map(s => s.id);
  const where = { stageId: { in: stageIds } };
  if (req.query.ownerId) where.ownerId = req.query.ownerId;
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
  // Desempeño global (ambos embudos): junta las etapas ganado/perdido de todos los embudos
  await ensureStages('b2c'); await ensureStages('b2b');
  const allStages = await prisma.dealStage.findMany({ select: { id: true, isWon: true, isLost: true } });
  const wonIds = new Set(allStages.filter(s => s.isWon).map(s => s.id));
  const lostIds = new Set(allStages.filter(s => s.isLost).map(s => s.id));

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
    if (wonIds.has(d.stageId)) r.won++;
    else if (lostIds.has(d.stageId)) r.lost++;
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

// Exportar todas las oportunidades (con nombre de etapa, embudo y cliente ligado)
r.get('/export', async (_req, res) => {
  const stages = await prisma.dealStage.findMany({ select: { id: true, name: true, pipeline: true } });
  const smap = new Map(stages.map(s => [s.id, s]));
  const deals = await prisma.deal.findMany({
    include: { client: { select: { name: true, phone: true } }, owner: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(deals.map(d => {
    const st = smap.get(d.stageId);
    return {
      title: d.title, amount: d.amount || 0,
      cliente: d.client?.name || d.contactName || '',
      telefono: d.client?.phone || '',
      etapa: st?.name || '', embudo: st?.pipeline || 'b2c',
      vendedor: d.owner?.name || '', notes: d.notes || '',
    };
  }));
});

// Importar oportunidades [{title, amount, cliente, telefono, etapa, embudo, notes}].
// Liga cliente por teléfono o nombre (si existe). Etapa por nombre dentro del embudo; si no, la primera.
r.post('/import', async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let created = 0, skipped = 0; const errors = [];
  await ensureStages('b2c'); await ensureStages('b2b');
  const allStages = await prisma.dealStage.findMany();
  const clientsAll = await prisma.client.findMany({ select: { id: true, name: true, phone: true } });
  const byPhone = new Map(); const byName = new Map();
  clientsAll.forEach(c => { const dg = (c.phone || '').replace(/\D/g, ''); if (dg) byPhone.set(dg, c.id); byName.set(c.name.trim().toLowerCase(), c.id); });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const title = (row.title || '').toString().trim();
    if (!title) { skipped++; continue; }
    try {
      const pipe = (row.embudo || 'b2c').toString().toLowerCase() === 'b2b' ? 'b2b' : 'b2c';
      const stName = (row.etapa || '').toString().trim().toLowerCase();
      const stagesP = allStages.filter(s => s.pipeline === pipe).sort((a, b) => a.order - b.order);
      const stage = stagesP.find(s => s.name.trim().toLowerCase() === stName) || stagesP[0];
      if (!stage) { errors.push(`Fila ${i + 1} (${title}): sin etapas en el embudo ${pipe.toUpperCase()}`); continue; }
      let clientId = null; const contactName = (row.cliente || '').toString().trim();
      const dg = (row.telefono || '').toString().replace(/\D/g, '');
      if (dg && byPhone.has(dg)) clientId = byPhone.get(dg);
      else if (contactName && byName.has(contactName.toLowerCase())) clientId = byName.get(contactName.toLowerCase());
      const amt = Math.min(Math.max(Number(row.amount) || 0, 0), 999999999);
      await prisma.deal.create({
        data: {
          title, amount: amt, clientId,
          contactName: clientId ? null : (contactName || null),
          stageId: stage.id, notes: (row.notes || '').toString().trim() || null,
          ownerId: req.user.id, order: Date.now() + i,
        },
      });
      created++;
    } catch (e) { errors.push(`Fila ${i + 1} (${title}): ${e.message}`); }
  }
  res.json({ created, skipped, errors, total: rows.length });
});

// Etapas (para selectores / configuración) — por embudo
r.get('/stages', async (req, res) => res.json(await ensureStages(req.query.pipeline)));

// Crear una etapa nueva (se inserta antes de las etapas de cierre Ganado/Perdido)
r.post('/stages', async (req, res) => {
  const { name, pipeline } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Falta el nombre de la etapa' });
  const pipe = PIPE(pipeline);
  await ensureStages(pipe);
  const closing = await prisma.dealStage.findMany({ where: { pipeline: pipe, OR: [{ isWon: true }, { isLost: true }] }, orderBy: { order: 'asc' } });
  const insertOrder = closing.length ? closing[0].order : await prisma.dealStage.count({ where: { pipeline: pipe } });
  // Recorre las etapas de cierre una posición para dejar espacio
  for (const c of closing) await prisma.dealStage.update({ where: { id: c.id }, data: { order: c.order + 1 } });
  const stage = await prisma.dealStage.create({ data: { name: name.trim(), pipeline: pipe, order: insertOrder } });
  logAudit(req, { module: 'crm', action: 'alta_etapa', summary: `Creó la etapa "${stage.name}" en el embudo ${pipe.toUpperCase()}`, refId: stage.id });
  res.status(201).json(stage);
});

// Renombrar una etapa
r.put('/stages/:id', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const stage = await prisma.dealStage.update({ where: { id: req.params.id }, data: { name } });
  res.json(stage);
});

// Eliminar una etapa (no las de cierre; y solo si no tiene oportunidades)
r.delete('/stages/:id', async (req, res) => {
  const stage = await prisma.dealStage.findUnique({ where: { id: req.params.id }, include: { _count: { select: { deals: true } } } });
  if (!stage) return res.status(404).json({ error: 'Etapa no encontrada' });
  if (stage.isWon || stage.isLost) return res.status(400).json({ error: 'No se puede eliminar la etapa de cierre (Ganado / Perdido).' });
  if (stage._count.deals > 0) return res.status(400).json({ error: 'Mueve las oportunidades de esta etapa a otra antes de eliminarla.' });
  await prisma.dealStage.delete({ where: { id: req.params.id } });
  logAudit(req, { module: 'crm', action: 'baja_etapa', summary: `Eliminó la etapa "${stage.name}"`, refId: stage.id });
  res.json({ ok: true });
});

// Crear trato (en el embudo indicado; por defecto B2C)
r.post('/', async (req, res) => {
  const { title, amount, clientId, contactName, stageId, notes, pipeline } = req.body;
  if (!title) return res.status(400).json({ error: 'Falta el título del trato' });
  const stages = await ensureStages(pipeline);
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

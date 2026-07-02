import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { clientStage } from '../lib/calc.js';
import { sendText } from '../lib/whatsapp.js';

const r = Router();
r.use(auth, requirePerm('crm'));

// Guard de servidor: bloquea una función si el super-admin apagó su setting.
// (Defensa real, además de ocultar la pestaña en el frontend.)
function requireSetting(key, label) {
  return async (_req, res, next) => {
    const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    const on = cfg?.settings?.[key] !== false; // por defecto activo
    if (!on) return res.status(403).json({ error: `${label} está desactivado por el administrador.` });
    next();
  };
}

const firstName = n => (n || '').split(' ')[0];
// Mensajes por etapa. El nombre del negocio se toma de BUSINESS_NAME (.env) para que sirva a cualquier nicho.
const BIZ = () => process.env.BUSINESS_NAME || 'nuestro negocio';
const STAGE_MSG = {
  prospecto: c => `Hola ${firstName(c.name)}, gracias por tu interés en ${BIZ()}. Nos encantaría atenderte. ¿Te gustaría agendar tu primera visita?`,
  activo: c => `Hola ${firstName(c.name)}, gracias por tu preferencia en ${BIZ()}. ¡Esperamos verte pronto de nuevo!`,
  riesgo: c => `Hola ${firstName(c.name)}, en ${BIZ()} te tenemos presente. Tenemos algo especial para ti en tu próxima visita.`,
  perdido: c => `Hola ${firstName(c.name)}, te extrañamos en ${BIZ()}. Nos encantaría darte la bienvenida de vuelta con un beneficio especial.`,
};

// EMBUDO / PIPELINE: clasifica a los clientes por etapa (sin N+1).
// ?stage= devuelve hasta 100 clientes de esa etapa; sin stage devuelve solo los conteos.
r.get('/pipeline', async (req, res) => {
  const now = new Date();
  // Última venta y nº de ventas por cliente — dos consultas agregadas
  const agg = await prisma.sale.groupBy({ by: ['clientId'], _max: { date: true }, _count: { _all: true } });
  const byClient = {};
  agg.forEach(g => { byClient[g.clientId] = { lastSale: g._max.date, totalSales: g._count._all }; });

  // Recorremos todos los clientes (id, name, tag) en bloques para no cargar de más
  const clients = await prisma.client.findMany({ select: { id: true, name: true, phone: true, tag: true } });
  const counts = { prospecto: 0, activo: 0, riesgo: 0, perdido: 0 };
  const stageOf = {};
  clients.forEach(c => {
    const info = byClient[c.id] || { lastSale: null, totalSales: 0 };
    const st = clientStage(info, now);
    counts[st]++; stageOf[c.id] = st;
  });

  // Si piden una etapa concreta, devolvemos hasta 100 clientes de ella (con su última visita)
  if (req.query.stage && counts[req.query.stage] != null) {
    const list = clients
      .filter(c => stageOf[c.id] === req.query.stage)
      .map(c => ({ ...c, lastSale: byClient[c.id]?.lastSale || null, totalSales: byClient[c.id]?.totalSales || 0 }))
      .sort((a, b) => (b.lastSale ? new Date(b.lastSale) : 0) - (a.lastSale ? new Date(a.lastSale) : 0))
      .slice(0, 100);
    return res.json({ counts, stage: req.query.stage, clients: list });
  }
  res.json({ counts, total: clients.length });
});

// ACCIÓN DE UN CLIC: enviar un WhatsApp cálido a todos los clientes de una etapa (con tope de seguridad)
r.post('/pipeline/:stage/message', async (req, res) => {
  const stage = req.params.stage;
  const build = STAGE_MSG[stage];
  if (!build) return res.status(400).json({ error: 'Etapa inválida' });
  const limit = Math.min(Number(req.body.limit) || 24, 24); // máx 24 mensajes por tanda

  const now = new Date();
  const agg = await prisma.sale.groupBy({ by: ['clientId'], _max: { date: true }, _count: { _all: true } });
  const byClient = {};
  agg.forEach(g => { byClient[g.clientId] = { lastSale: g._max.date, totalSales: g._count._all }; });
  const clients = await prisma.client.findMany({ where: { phone: { not: null } }, select: { id: true, name: true, phone: true } });
  const targets = clients
    .filter(c => clientStage(byClient[c.id] || { lastSale: null, totalSales: 0 }, now) === stage)
    .slice(0, limit);

  let sent = 0, demo = false;
  for (const c of targets) {
    try { const out = await sendText(c.phone, build(c)); if (out.demo) demo = true; sent++; }
    catch { /* sigue con los demás */ }
  }
  res.json({ ok: true, sent, total: targets.length, demo });
});

// ---------- CAMPAÑAS SEGMENTADAS ----------
// Resuelve la lista de clientes que cumplen un segmento combinado.
// filtros: { stage, tag, inactiveDays } — todos opcionales y combinables (AND).
async function resolveSegment({ stage, tag, inactiveDays }) {
  const now = new Date();
  // Última venta y nº de ventas por cliente (para etapa e inactividad)
  const agg = await prisma.sale.groupBy({ by: ['clientId'], _max: { date: true }, _count: { _all: true } });
  const byClient = {};
  agg.forEach(g => { byClient[g.clientId] = { lastSale: g._max.date, totalSales: g._count._all }; });

  const where = { phone: { not: null } };
  if (tag) where.tag = tag;
  const clients = await prisma.client.findMany({ where, select: { id: true, name: true, phone: true, tag: true } });

  return clients.filter(c => {
    const info = byClient[c.id] || { lastSale: null, totalSales: 0 };
    if (stage && clientStage(info, now) !== stage) return false;
    if (inactiveDays) {
      const dias = info.lastSale ? Math.floor((now - new Date(info.lastSale)) / 86400000) : Infinity;
      if (dias < Number(inactiveDays)) return false;
    }
    return true;
  }).map(c => ({ ...c, ...(byClient[c.id] || { lastSale: null, totalSales: 0 }) }));
}

// Vista previa: cuántos y quiénes recibirían la campaña
r.post('/campaign/preview', requireSetting('usarCampanas', 'Campañas'), async (req, res) => {
  const list = await resolveSegment(req.body || {});
  res.json({ total: list.length, sample: list.slice(0, 20) });
});

// Enviar campaña: mensaje personalizado a un segmento (con tope de seguridad)
r.post('/campaign/send', requireSetting('usarCampanas', 'Campañas'), async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Escribe el mensaje de la campaña' });
  const limit = Math.min(Number(req.body.limit) || 100, 300); // tope por tanda
  const list = (await resolveSegment(req.body || {})).slice(0, limit);

  let sent = 0, demo = false;
  for (const c of list) {
    // Personaliza: {nombre} se reemplaza por el primer nombre; {negocio} por el nombre del negocio
    const text = message.replace(/\{nombre\}/gi, firstName(c.name)).replace(/\{negocio\}/gi, BIZ());
    try { const out = await sendText(c.phone, text); if (out.demo) demo = true; sent++; }
    catch { /* continúa */ }
  }
  res.json({ ok: true, sent, total: list.length, demo });
});

// CLIENTES EN RIESGO: sin ventas en los últimos N días (default 45)
r.get('/at-risk', async (req, res) => {
  const days = Number(req.query.days) || 45;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const clients = await prisma.client.findMany({
    include: { sales: { orderBy: { date: 'desc' }, take: 1 } },
    orderBy: { name: 'asc' },
  });
  const atRisk = clients
    .map(c => ({
      id: c.id, name: c.name, phone: c.phone, email: c.email, tag: c.tag, points: c.points,
      lastVisit: c.sales[0]?.date || null,
      totalVisits: undefined,
    }))
    .filter(c => !c.lastVisit || new Date(c.lastVisit) < cutoff)
    .sort((a, b) => (a.lastVisit ? new Date(a.lastVisit) : 0) - (b.lastVisit ? new Date(b.lastVisit) : 0));
  res.json({ days, clients: atRisk });
});

// CUMPLEAÑOS: del mes indicado (default mes actual)
r.get('/birthdays', async (req, res) => {
  const month = req.query.month != null ? Number(req.query.month) : new Date().getMonth(); // 0-11
  const all = await prisma.client.findMany({ where: { birth: { not: null } }, orderBy: { name: 'asc' } });
  const list = all
    .filter(c => new Date(c.birth).getMonth() === month)
    .map(c => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, tag: c.tag, day: new Date(c.birth).getDate() }))
    .sort((a, b) => a.day - b.day);
  res.json({ month, clients: list });
});

// SEGUIMIENTOS / TAREAS
r.get('/followups', async (req, res) => {
  const where = {};
  if (req.query.done === 'false') where.done = false;
  if (req.query.clientId) where.clientId = req.query.clientId;
  const items = await prisma.followUp.findMany({
    where, include: { client: true }, orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
  });
  res.json(items);
});

r.post('/followups', async (req, res) => {
  const { clientId, title, dueDate, kind } = req.body;
  if (!clientId || !title) return res.status(400).json({ error: 'Cliente y título son obligatorios' });
  // Responsable: el vendedor asignado al cliente; si no tiene, quien crea el seguimiento.
  const cli = await prisma.client.findUnique({ where: { id: clientId }, select: { sellerId: true } });
  const item = await prisma.followUp.create({
    data: {
      clientId, title, kind: kind || 'manual',
      dueDate: dueDate ? new Date(dueDate) : null,
      staffId: cli?.sellerId || req.user.id,
    },
  });
  res.status(201).json(item);
});

// RECORDATORIOS del empleado actual: tareas pendientes vencidas o de hoy (para la campana).
r.get('/my-reminders', async (req, res) => {
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const items = await prisma.followUp.findMany({
    where: {
      done: false,
      staffId: req.user.id,
      dueDate: { not: null, lte: endToday }, // con fecha objetivo, vencidas o de hoy
    },
    include: { client: { select: { id: true, name: true, phone: true } } },
    orderBy: { dueDate: 'asc' },
    take: 50,
  });
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const list = items.map(it => ({
    id: it.id, title: it.title, dueDate: it.dueDate, kind: it.kind,
    client: it.client,
    overdue: new Date(it.dueDate) < startToday, // true = vencida; false = es para hoy
  }));
  res.json({ count: list.length, items: list });
});

r.patch('/followups/:id', async (req, res) => {
  const item = await prisma.followUp.update({
    where: { id: req.params.id },
    data: { done: req.body.done != null ? !!req.body.done : undefined, title: req.body.title, dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined },
  });
  res.json(item);
});

r.delete('/followups/:id', async (req, res) => {
  await prisma.followUp.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// VISTA 360: todo lo de un cliente en una sola consulta
r.get('/client/:id/360', async (req, res) => {
  const id = req.params.id;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      record: { include: { notes: { orderBy: { date: 'desc' }, take: 5 } } },
      packages: { include: { package: true }, orderBy: { createdAt: 'desc' } },
      followUps: { orderBy: [{ done: 'asc' }, { dueDate: 'asc' }] },
    },
  });
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const [sales, appts, activities] = await Promise.all([
    prisma.sale.findMany({ where: { clientId: id }, include: { items: true }, orderBy: { date: 'desc' } }),
    prisma.appointment.findMany({ where: { clientId: id }, include: { service: true, staff: true }, orderBy: { start: 'desc' } }),
    // Bitácora de contacto: actividades de TODOS los tratos de este cliente
    prisma.dealActivity.findMany({
      where: { deal: { clientId: id } },
      include: { deal: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const now = new Date();
  const totalGastado = sales.reduce((a, s) => a + s.total, 0);
  const visitas = sales.length;
  const ticketProm = visitas ? totalGastado / visitas : 0;
  const lastVisit = sales[0]?.date || null;
  const diasSinVenir = lastVisit ? Math.floor((now - new Date(lastVisit)) / 86400000) : null;
  const proximaCita = appts.find(a => new Date(a.start) >= now && !['cancelada', 'no_asistio'].includes(a.status)) || null;

  // Servicio favorito (el más comprado por nombre)
  const svcCount = {};
  sales.forEach(s => s.items.forEach(i => { if (i.type === 'servicio') svcCount[i.name] = (svcCount[i.name] || 0) + (i.qty || 1); }));
  const favorito = Object.entries(svcCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Nombres de los empleados que registraron actividades (batch para evitar N+1)
  const staffIds = [...new Set(activities.map(a => a.staffId).filter(Boolean))];
  const staffMap = staffIds.length
    ? new Map((await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })).map(s => [s.id, s.name]))
    : new Map();
  const bitacora = activities.map(a => ({
    id: a.id, type: a.type, note: a.note, dueDate: a.dueDate, done: a.done,
    createdAt: a.createdAt, dealTitle: a.deal?.title || null,
    staffName: a.staffId ? (staffMap.get(a.staffId) || null) : null,
  }));

  res.json({
    client: {
      id: client.id, name: client.name, phone: client.phone, email: client.email,
      birth: client.birth, tag: client.tag, points: client.points, credit: client.credit,
      source: client.source, createdAt: client.createdAt, skin: client.skin,
    },
    kpis: { totalGastado, visitas, ticketProm, lastVisit, diasSinVenir, favorito,
      paquetesActivos: client.packages.filter(p => p.remaining > 0 && new Date(p.expiresAt) >= now).length },
    proximaCita,
    record: client.record || null,
    notes: client.record?.notes || [],
    sales: sales.slice(0, 10),
    appointments: appts.slice(0, 10),
    packages: client.packages,
    followUps: client.followUps,
    bitacora,
  });
});

// MÉTRICAS DE ORIGEN: nº de clientes por canal (agregado en la BD)
r.get('/sources', async (_req, res) => {
  // Clientes por origen — una sola consulta agrupada
  const byClient = await prisma.client.groupBy({ by: ['source'], _count: { _all: true } });
  const agg = {};
  byClient.forEach(g => {
    const key = g.source || 'Sin registrar';
    agg[key] = agg[key] || { source: key, clients: 0, sales: 0 };
    agg[key].clients += g._count._all;
  });
  res.json(Object.values(agg).sort((a, b) => b.clients - a.clients));
});

// ---------- AUTOMATIZACIONES ----------
const DEFAULT_AUTOMATIONS = {
  postVisit:  { on: false, message: 'Hola {nombre}, ¡gracias por tu visita a {negocio}! Esperamos que la hayas disfrutado. Te esperamos pronto.' },
  reactivate: { on: false, days: 60, message: 'Hola {nombre}, en {negocio} te extrañamos. Tenemos algo especial para tu regreso. ¿Agendamos?' },
};

r.get('/automations', async (_req, res) => {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  const a = (cfg?.automations && typeof cfg.automations === 'object') ? cfg.automations : {};
  res.json({
    postVisit: { ...DEFAULT_AUTOMATIONS.postVisit, ...(a.postVisit || {}) },
    reactivate: { ...DEFAULT_AUTOMATIONS.reactivate, ...(a.reactivate || {}) },
  });
});

r.put('/automations', requireSetting('usarAutomatizaciones', 'Automatizaciones'), async (req, res) => {
  const { postVisit, reactivate } = req.body || {};
  const automations = {
    postVisit: { ...DEFAULT_AUTOMATIONS.postVisit, ...(postVisit || {}) },
    reactivate: { ...DEFAULT_AUTOMATIONS.reactivate, ...(reactivate || {}) },
  };
  let cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) cfg = await prisma.systemConfig.create({ data: { id: 'singleton' } });
  const updated = await prisma.systemConfig.update({ where: { id: cfg.id }, data: { automations } });
  res.json(updated.automations);
});

export default r;

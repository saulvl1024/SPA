import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { autoTag } from '../lib/calc.js';

const r = Router();
r.use(auth);

// Recalcula y guarda la etiqueta automática de un cliente (respeta la manual).
export async function recalcClientTag(clientId) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.tagManual) return client; // si es manual, no se toca
  const tags = await prisma.tag.findMany({ where: { active: true } });
  const sales = await prisma.sale.findMany({ where: { clientId }, select: { date: true, total: true } });
  const name = autoTag(tags, sales);
  if (name && name !== client.tag) {
    return prisma.client.update({ where: { id: clientId }, data: { tag: name } });
  }
  return client;
}

// Listar etiquetas
r.get('/', async (_req, res) => res.json(await prisma.tag.findMany({ orderBy: { priority: 'desc' } })));

// Crear (admin)
r.post('/', adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  try {
    const tag = await prisma.tag.create({ data: cleanTag(req.body) });
    res.status(201).json(tag);
  } catch { res.status(400).json({ error: 'Esa etiqueta ya existe' }); }
});

// Editar (admin)
r.put('/:id', adminOnly, async (req, res) => {
  const tag = await prisma.tag.update({ where: { id: req.params.id }, data: cleanTag(req.body) });
  res.json(tag);
});

// Eliminar (admin)
r.delete('/:id', adminOnly, async (req, res) => {
  await prisma.tag.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Recalcular TODAS las etiquetas automáticas (admin) — sin N+1
r.post('/recalc', adminOnly, async (_req, res) => {
  const now = new Date();
  const [tags, clients] = await Promise.all([
    prisma.tag.findMany({ where: { active: true } }),
    prisma.client.findMany({ where: { tagManual: false }, select: { id: true, tag: true } }),
  ]);
  // El periodo más largo de cualquier regla limita cuántas ventas necesitamos traer
  const maxPeriod = Math.max(30, ...tags.map(t => t.periodDays || 30));
  const since = new Date(now); since.setDate(since.getDate() - maxPeriod);
  // UNA sola consulta de ventas recientes de todos los clientes auto
  const ids = clients.map(c => c.id);
  const sales = ids.length
    ? await prisma.sale.findMany({ where: { clientId: { in: ids }, date: { gte: since } }, select: { clientId: true, date: true, total: true } })
    : [];
  const salesByClient = {};
  sales.forEach(s => { (salesByClient[s.clientId] = salesByClient[s.clientId] || []).push(s); });

  // Calcula en memoria y actualiza solo los que cambian
  let updated = 0;
  const updates = [];
  for (const c of clients) {
    const name = autoTag(tags, salesByClient[c.id] || [], now);
    if (name && name !== c.tag) { updates.push(prisma.client.update({ where: { id: c.id }, data: { tag: name } })); updated++; }
  }
  // Aplica los updates por lotes (evita saturar la conexión)
  for (let i = 0; i < updates.length; i += 100) await Promise.all(updates.slice(i, i + 100));
  res.json({ ok: true, total: clients.length, updated });
});

function cleanTag(b) {
  const d = {};
  if (b.name != null) d.name = b.name;
  if (b.color != null) d.color = b.color;
  if (b.priority != null) d.priority = Number(b.priority) || 0;
  if (b.periodDays != null) d.periodDays = Number(b.periodDays) || 30;
  d.minVisits = b.minVisits === '' || b.minVisits == null ? null : Number(b.minVisits);
  d.minSpend = b.minSpend === '' || b.minSpend == null ? null : Number(b.minSpend);
  if (b.isDefault != null) d.isDefault = !!b.isDefault;
  if (b.active != null) d.active = !!b.active;
  return d;
}

export default r;

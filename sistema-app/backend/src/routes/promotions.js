import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
const adminOnly = requirePerm('promociones');

const r = Router();
r.use(auth);

// Listar (todas para admin; activas para el POS con ?active=true)
r.get('/', async (req, res) => {
  const where = {};
  if (req.query.active === 'true') where.active = true;
  // ?scope=general,pos → filtra por alcance (acepta varios separados por coma)
  if (req.query.scope) where.scope = { in: String(req.query.scope).split(',') };
  res.json(await prisma.promotion.findMany({ where, orderBy: { createdAt: 'desc' } }));
});

// Crear (admin)
r.post('/', adminOnly, async (req, res) => {
  const { code, name, type, value, birthday, scope } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Código y nombre son obligatorios' });
  if (!(Number(value) > 0)) return res.status(400).json({ error: 'Valor inválido' });
  try {
    if (birthday) await prisma.promotion.updateMany({ data: { birthday: false } }); // solo uno
    const promo = await prisma.promotion.create({
      data: { code: code.toUpperCase().trim(), name, type: type === 'amount' ? 'amount' : 'percent', value: Number(value), birthday: !!birthday,
        scope: ['pos', 'crm', 'general'].includes(scope) ? scope : 'general' },
    });
    logAudit(req, { module: 'promociones', action: 'crear_promo', summary: `Creó promoción ${promo.code} (${promo.type === 'amount' ? '$' + promo.value : promo.value + '%'})`, refId: promo.id });
    res.status(201).json(promo);
  } catch (e) {
    res.status(400).json({ error: 'Ese código ya existe' });
  }
});

// Editar (admin)
r.put('/:id', adminOnly, async (req, res) => {
  const { code, name, type, value, active, birthday, scope } = req.body;
  const data = {};
  if (code != null) data.code = code.toUpperCase().trim();
  if (name != null) data.name = name;
  if (type != null) data.type = type === 'amount' ? 'amount' : 'percent';
  if (value != null) data.value = Number(value);
  if (active != null) data.active = !!active;
  if (scope != null) data.scope = ['pos', 'crm', 'general'].includes(scope) ? scope : 'general';
  if (birthday != null) { data.birthday = !!birthday; if (birthday) await prisma.promotion.updateMany({ where: { NOT: { id: req.params.id } }, data: { birthday: false } }); }
  const promo = await prisma.promotion.update({ where: { id: req.params.id }, data });
  logAudit(req, { module: 'promociones', action: 'editar_promo', summary: `Editó promoción ${promo.code}${data.active !== undefined ? (promo.active ? ' (activada)' : ' (desactivada)') : ''}`, refId: promo.id });
  res.json(promo);
});

// Eliminar (admin)
r.delete('/:id', adminOnly, async (req, res) => {
  const p = await prisma.promotion.findUnique({ where: { id: req.params.id } });
  await prisma.promotion.delete({ where: { id: req.params.id } });
  logAudit(req, { module: 'promociones', action: 'eliminar_promo', summary: `Eliminó promoción ${p?.code || req.params.id}`, refId: req.params.id });
  res.json({ ok: true });
});

export default r;

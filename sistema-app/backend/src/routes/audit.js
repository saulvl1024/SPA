import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';

const r = Router();
r.use(auth, requirePerm('auditoria')); // solo admin (módulo adminOnly)

// Catálogos para los filtros (usuarios que han hecho movimientos y módulos presentes)
r.get('/meta', async (_req, res) => {
  const actors = await prisma.auditLog.findMany({
    distinct: ['actorId'], select: { actorId: true, actorName: true }, orderBy: { actorName: 'asc' },
  });
  const modulesRaw = await prisma.auditLog.findMany({ distinct: ['module'], select: { module: true } });
  res.json({
    actors: actors.filter(a => a.actorId).map(a => ({ id: a.actorId, name: a.actorName })),
    modules: modulesRaw.map(m => m.module).sort(),
  });
});

// Bitácora con filtros: ?from=YYYY-MM-DD&to=YYYY-MM-DD&actorId=&module=&action=&q=
r.get('/', async (req, res) => {
  const where = {};
  if (req.query.from && req.query.to) {
    const [fy, fm, fd] = req.query.from.split('-').map(Number);
    const [ty, tm, td] = req.query.to.split('-').map(Number);
    where.date = { gte: new Date(fy, fm - 1, fd, 0, 0, 0, 0), lte: new Date(ty, tm - 1, td, 23, 59, 59, 999) };
  }
  if (req.query.actorId) where.actorId = req.query.actorId;
  if (req.query.module) where.module = req.query.module;
  if (req.query.action) where.action = req.query.action;
  if (req.query.q) where.summary = { contains: req.query.q.toString(), mode: 'insensitive' };

  const logs = await prisma.auditLog.findMany({
    where, orderBy: { date: 'desc' }, take: Math.min(Number(req.query.limit) || 1000, 5000),
  });
  res.json(logs);
});

export default r;

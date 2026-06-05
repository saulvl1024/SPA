import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

r.get('/services', async (_req, res) =>
  res.json(await prisma.service.findMany({ where: { active: true }, orderBy: { name: 'asc' } })));

r.get('/packages', async (_req, res) =>
  res.json(await prisma.package.findMany({ orderBy: { sessions: 'asc' } })));

// Staff / especialistas (sin exponer el PIN)
r.get('/staff', async (_req, res) => {
  const staff = await prisma.staff.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, specialty: true, commissionRate: true },
    orderBy: { name: 'asc' },
  });
  res.json(staff);
});

export default r;

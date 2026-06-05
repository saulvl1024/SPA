import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { sign, auth } from '../middleware/auth.js';

const r = Router();

// Login por PIN: busca el staff cuyo pinHash coincida
r.post('/login', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'Falta el PIN' });
  const staff = await prisma.staff.findMany({ where: { active: true } });
  const match = staff.find(s => bcrypt.compareSync(pin, s.pinHash));
  if (!match) return res.status(401).json({ error: 'Clave incorrecta' });
  res.json({ token: sign(match), user: { id: match.id, name: match.name, role: match.role } });
});

r.get('/me', auth, (req, res) => res.json(req.user));

export default r;

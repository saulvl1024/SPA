import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { sign, auth } from '../middleware/auth.js';
import { effectivePermissions } from '../lib/permissions.js';

const r = Router();

const publicUser = s => ({ id: s.id, name: s.name, role: s.role, perms: effectivePermissions(s), warehouseId: s.warehouseId || null });

// LOGIN del sistema: correo + contraseña
r.post('/login', async (req, res) => {
  const email = (req.body.email || '').toString().trim().toLowerCase();
  const { password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Ingresa correo y contraseña' });
  const staff = await prisma.staff.findFirst({ where: { email, active: true } });
  if (!staff || !staff.passwordHash || !bcrypt.compareSync(password, staff.passwordHash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  res.json({ token: sign(staff), user: publicUser(staff) });
});

// PIN: SOLO para el POS — identifica a la cajera (no es login del sistema).
// Devuelve los datos del empleado cuyo PIN coincide, para registrar quién cobra / abre caja.
r.post('/pin', auth, async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'Falta el PIN' });
  const staff = await prisma.staff.findMany({ where: { active: true, pinHash: { not: null } } });
  const match = staff.find(s => s.pinHash && bcrypt.compareSync(pin, s.pinHash));
  if (!match) return res.status(401).json({ error: 'PIN incorrecto' });
  res.json({ id: match.id, name: match.name, role: match.role, specialty: match.specialty });
});

r.get('/me', auth, (req, res) => res.json(req.user));

export default r;

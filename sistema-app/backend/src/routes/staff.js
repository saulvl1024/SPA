import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const r = Router();
r.use(auth, adminOnly); // todo este módulo es solo para administrador

// Listar empleadas (sin exponer el PIN)
r.get('/', async (_req, res) => {
  const staff = await prisma.staff.findMany({
    select: { id: true, name: true, role: true, specialty: true, commissionRate: true, active: true },
    orderBy: { name: 'asc' },
  });
  res.json(staff);
});

// Crear empleada con PIN
r.post('/', async (req, res) => {
  const { name, pin, role = 'empleada', specialty, commissionRate } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN son obligatorios' });
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser de 4 a 6 dígitos' });
  // evita PIN duplicado
  const all = await prisma.staff.findMany({ where: { active: true } });
  if (all.some(s => bcrypt.compareSync(pin, s.pinHash)))
    return res.status(400).json({ error: 'Ese PIN ya está en uso' });
  const staff = await prisma.staff.create({
    data: {
      name, role, specialty: specialty || null,
      commissionRate: commissionRate != null ? Number(commissionRate) : 0.10,
      pinHash: bcrypt.hashSync(pin, 8),
    },
    select: { id: true, name: true, role: true, specialty: true, commissionRate: true, active: true },
  });
  res.status(201).json(staff);
});

// Editar (nombre, rol, especialidad, comisión y PIN opcional)
r.put('/:id', async (req, res) => {
  const { name, role, specialty, commissionRate, pin } = req.body;
  const data = { name, role, specialty: specialty || null };
  if (commissionRate != null) data.commissionRate = Number(commissionRate);
  if (pin) {
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser de 4 a 6 dígitos' });
    data.pinHash = bcrypt.hashSync(pin, 8);
  }
  const staff = await prisma.staff.update({
    where: { id: req.params.id }, data,
    select: { id: true, name: true, role: true, specialty: true, commissionRate: true, active: true },
  });
  res.json(staff);
});

// Desactivar (borrado lógico, conserva el historial de ventas)
r.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
  await prisma.staff.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

export default r;

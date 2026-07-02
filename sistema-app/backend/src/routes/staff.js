import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth, requirePerm('personal')); // admin o quien tenga permiso del módulo Personal

// Nadie (salvo un superadmin) puede crear/asignar el rol superadmin desde aquí.
r.use((req, res, next) => {
  if (req.body?.role === 'superadmin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Rol no permitido' });
  }
  next();
});

const SELECT = {
  id: true, name: true, role: true, specialty: true, commissionRate: true, active: true,
  phone: true, email: true, position: true, hireDate: true, photo: true, permissions: true, schedule: true,
  warehouseId: true,
  passwordHash: true, pinHash: true, // se transforman a booleanos antes de responder (ver shape())
};
// No exponer los hashes: convertirlos en banderas booleanas
const shape = s => { if (!s) return s; const { passwordHash, pinHash, ...rest } = s; return { ...rest, hasPassword: !!passwordHash, hasPin: !!pinHash }; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Listar. ?all=true incluye inactivos. Los usuarios superadmin (dueño del ERP) quedan OCULTOS.
r.get('/', async (req, res) => {
  const where = { role: { not: 'superadmin' }, ...(req.query.all === 'true' ? {} : { active: true }) };
  const staff = await prisma.staff.findMany({ where, select: SELECT, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  res.json(staff.map(shape));
});

// Desempeño de un empleado en un mes: ventas, servicios y comisión
r.get('/:id/performance', async (req, res) => {
  const sp = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!sp) return res.status(404).json({ error: 'No encontrado' });
  const y = Number(req.query.year) || new Date().getFullYear();
  const m = req.query.month != null ? Number(req.query.month) : new Date().getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const sales = await prisma.sale.findMany({ where: { date: { gte: start, lte: end } }, include: { items: true } });
  let ventas = 0, servicios = 0;
  sales.forEach(s => s.items.forEach(i => {
    if (i.specialistId === sp.id) { ventas += (i.price || 0) * (i.qty || 1); servicios += (i.qty || 1); }
  }));

  // Pipeline / embudo de este empleado (oportunidades en curso) + tareas pendientes
  const stages = await prisma.dealStage.findMany({ select: { id: true, isWon: true, isLost: true } });
  const wonId = stages.find(s => s.isWon)?.id;
  const lostId = stages.find(s => s.isLost)?.id;
  const [deals, followups] = await Promise.all([
    prisma.deal.findMany({ where: { ownerId: sp.id }, select: { amount: true, stageId: true } }),
    prisma.followUp.findMany({ where: { ownerId: undefined, staffId: sp.id, done: false }, select: { dueDate: true } }),
  ]);
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  let dealsOpen = 0, dealsWon = 0, dealsLost = 0, pipelineValue = 0;
  deals.forEach(d => {
    if (d.stageId === wonId) dealsWon++;
    else if (d.stageId === lostId) dealsLost++;
    else { dealsOpen++; pipelineValue += d.amount || 0; }
  });
  const tasksPending = followups.length;
  const tasksOverdue = followups.filter(f => f.dueDate && new Date(f.dueDate) < startToday).length;
  const winRate = (dealsWon + dealsLost) ? Math.round((dealsWon / (dealsWon + dealsLost)) * 100) : 0;

  res.json({
    year: y, month: m,
    ventas, servicios, comision: ventas * (sp.commissionRate || 0),
    pipeline: { open: dealsOpen, won: dealsWon, lost: dealsLost, value: pipelineValue, winRate, tasksPending, tasksOverdue },
  });
});

function fichaData(body) {
  const d = {};
  if (body.phone !== undefined) d.phone = body.phone || null;
  if (body.email !== undefined) d.email = body.email || null;
  if (body.position !== undefined) d.position = body.position || null;
  if (body.hireDate !== undefined) d.hireDate = body.hireDate ? new Date(body.hireDate) : null;
  if (body.photo !== undefined) d.photo = body.photo || null;
  if (body.permissions !== undefined) d.permissions = Array.isArray(body.permissions) ? body.permissions : [];
  if (body.schedule !== undefined) d.schedule = body.schedule || null;
  if (body.warehouseId !== undefined) d.warehouseId = body.warehouseId || null;
  return d;
}

// Crear empleado: correo + contraseña (login del sistema). PIN opcional (para POS).
r.post('/', async (req, res) => {
  const { name, email, password, pin, role = 'empleada', specialty, commissionRate } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
  const mail = email.toString().trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: 'Correo inválido' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  // Correo único
  if (await prisma.staff.findFirst({ where: { email: mail } })) return res.status(400).json({ error: 'Ese correo ya está registrado' });

  const data = {
    name, role, specialty: specialty || null,
    commissionRate: commissionRate != null ? Number(commissionRate) : 0.10,
    email: mail, passwordHash: bcrypt.hashSync(password, 8),
    ...fichaData(req.body),
  };
  // PIN opcional (solo si se proporciona)
  if (pin) {
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser de 4 a 6 dígitos' });
    const withPin = await prisma.staff.findMany({ where: { active: true, pinHash: { not: null } } });
    if (withPin.some(s => s.pinHash && bcrypt.compareSync(pin, s.pinHash))) return res.status(400).json({ error: 'Ese PIN ya está en uso' });
    data.pinHash = bcrypt.hashSync(pin, 8);
  }
  const staff = await prisma.staff.create({ data, select: SELECT });
  logAudit(req, { module: 'personal', action: 'alta_empleado', summary: `Alta de empleado "${staff.name}" (${staff.role})`, refId: staff.id });
  res.status(201).json(shape(staff));
});

// Editar
r.put('/:id', async (req, res) => {
  const { name, role, specialty, commissionRate, pin, email, password } = req.body;
  const data = { ...fichaData(req.body) };
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (specialty !== undefined) data.specialty = specialty || null;
  if (commissionRate != null) data.commissionRate = Number(commissionRate);
  // Correo (login)
  if (email !== undefined) {
    const mail = (email || '').toString().trim().toLowerCase();
    if (mail) {
      if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: 'Correo inválido' });
      const dup = await prisma.staff.findFirst({ where: { email: mail, NOT: { id: req.params.id } } });
      if (dup) return res.status(400).json({ error: 'Ese correo ya está registrado' });
    }
    data.email = mail || null;
  }
  // Contraseña (login) — solo si se proporciona una nueva
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    data.passwordHash = bcrypt.hashSync(password, 8);
  }
  // PIN (POS) — opcional
  if (pin) {
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser de 4 a 6 dígitos' });
    const others = await prisma.staff.findMany({ where: { active: true, pinHash: { not: null }, NOT: { id: req.params.id } } });
    if (others.some(s => s.pinHash && bcrypt.compareSync(pin, s.pinHash))) return res.status(400).json({ error: 'Ese PIN ya está en uso' });
    data.pinHash = bcrypt.hashSync(pin, 8);
  }
  const before = await prisma.staff.findUnique({ where: { id: req.params.id }, select: { permissions: true, name: true } });
  const staff = await prisma.staff.update({ where: { id: req.params.id }, data, select: SELECT });
  // Detalla si cambiaron los permisos (dato sensible)
  if (data.permissions !== undefined) {
    const prev = (before?.permissions || []).slice().sort().join(',');
    const next = (staff.permissions || []).slice().sort().join(',');
    if (prev !== next) logAudit(req, { module: 'personal', action: 'cambio_permisos', summary: `Permisos de "${staff.name}": [${next || 'ninguno'}]`, refId: staff.id, meta: { antes: before?.permissions || [], despues: staff.permissions } });
  }
  if (data.pinHash) logAudit(req, { module: 'personal', action: 'cambio_pin', summary: `Cambió el PIN de "${staff.name}"`, refId: staff.id });
  if (data.passwordHash) logAudit(req, { module: 'personal', action: 'cambio_password', summary: `Cambió la contraseña de "${staff.name}"`, refId: staff.id });
  logAudit(req, { module: 'personal', action: 'editar_empleado', summary: `Editó la ficha de "${staff.name}"`, refId: staff.id });
  res.json(shape(staff));
});

// Reactivar
r.patch('/:id/activate', async (req, res) => {
  const staff = await prisma.staff.update({ where: { id: req.params.id }, data: { active: true }, select: SELECT });
  logAudit(req, { module: 'personal', action: 'reactivar_empleado', summary: `Reactivó a "${staff.name}"`, refId: staff.id });
  res.json(staff);
});

// Desactivar (borrado lógico, conserva el historial)
r.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
  const s = await prisma.staff.update({ where: { id: req.params.id }, data: { active: false } });
  logAudit(req, { module: 'personal', action: 'desactivar_empleado', summary: `Desactivó a "${s.name}"`, refId: s.id });
  res.json({ ok: true });
});

export default r;

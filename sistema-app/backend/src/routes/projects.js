import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth, requirePerm('crm'));

const isAdmin = req => req.user?.role === 'admin' || req.user?.role === 'superadmin';

// Calcula progreso (% de tareas terminadas) a partir de la jerarquía cargada
function projectProgress(project) {
  let total = 0, done = 0;
  for (const m of project.milestones || []) {
    for (const tl of m.taskLists || []) {
      for (const t of tl.tasks || []) { total++; if (t.done) done++; }
    }
  }
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

// Incluye toda la jerarquía ordenada
const fullInclude = {
  members: true,
  milestones: {
    orderBy: { order: 'asc' },
    include: {
      taskLists: {
        orderBy: { order: 'asc' },
        include: {
          tasks: {
            orderBy: { order: 'asc' },
            include: { subtasks: { orderBy: { order: 'asc' } } },
          },
        },
      },
    },
  },
};

// ---- Proyectos ----

// Lista de proyectos. ?mine=1 -> solo los del usuario (miembro o responsable). Admin ve todos.
r.get('/', async (req, res) => {
  const mine = req.query.mine === '1';
  let where = {};
  if (mine || !isAdmin(req)) {
    where = { OR: [{ ownerId: req.user.id }, { members: { some: { staffId: req.user.id } } }] };
  }
  const projects = await prisma.project.findMany({
    where,
    include: fullInclude,
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  });
  // Nombres de responsables/clientes/empresas para mostrar
  const staff = await prisma.staff.findMany({ select: { id: true, name: true } });
  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]));
  const out = projects.map(p => ({
    ...p,
    ownerName: p.ownerId ? staffMap[p.ownerId] : null,
    memberNames: p.members.map(m => staffMap[m.staffId]).filter(Boolean),
    progress: projectProgress(p),
    milestonesTotal: p.milestones.length,
    milestonesDone: p.milestones.filter(m => m.completed).length,
  }));
  res.json(out);
});

// Detalle completo de un proyecto
r.get('/:id', async (req, res) => {
  const p = await prisma.project.findUnique({ where: { id: req.params.id }, include: fullInclude });
  if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' });
  const staff = await prisma.staff.findMany({ select: { id: true, name: true } });
  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]));
  let client = null, company = null;
  if (p.clientId) client = await prisma.client.findUnique({ where: { id: p.clientId }, select: { id: true, name: true } });
  if (p.companyId) company = await prisma.company.findUnique({ where: { id: p.companyId }, select: { id: true, name: true } });
  res.json({
    ...p,
    ownerName: p.ownerId ? staffMap[p.ownerId] : null,
    memberNames: p.members.map(m => ({ staffId: m.staffId, name: staffMap[m.staffId] })).filter(m => m.name),
    progress: projectProgress(p),
    client, company,
  });
});

// Crear proyecto
r.post('/', async (req, res) => {
  const { name, description, status, clientId, companyId, dealId, ownerId, dueDate, value, memberIds } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del proyecto es obligatorio' });
  const project = await prisma.project.create({
    data: {
      name: name.trim(), description: description || null, status: status || 'por_iniciar',
      clientId: clientId || null, companyId: companyId || null, dealId: dealId || null,
      ownerId: ownerId || null, dueDate: dueDate ? new Date(dueDate) : null, value: value != null && value !== '' ? Number(value) : null,
      members: memberIds && memberIds.length ? { create: memberIds.map(staffId => ({ staffId })) } : undefined,
    },
  });
  logAudit(req, { module: 'crm', action: 'alta_proyecto', summary: `Creó el proyecto ${project.name}`, refId: project.id });
  res.status(201).json(project);
});

// Editar proyecto (datos generales)
r.put('/:id', async (req, res) => {
  const { name, description, status, clientId, companyId, dealId, ownerId, dueDate, value } = req.body;
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description || null;
  if (status !== undefined) data.status = status;
  if (clientId !== undefined) data.clientId = clientId || null;
  if (companyId !== undefined) data.companyId = companyId || null;
  if (dealId !== undefined) data.dealId = dealId || null;
  if (ownerId !== undefined) data.ownerId = ownerId || null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (value !== undefined) data.value = value != null && value !== '' ? Number(value) : null;
  const project = await prisma.project.update({ where: { id: req.params.id }, data });
  res.json(project);
});

// Mover de estado (kanban)
r.patch('/:id/status', async (req, res) => {
  const project = await prisma.project.update({ where: { id: req.params.id }, data: { status: req.body.status } });
  res.json(project);
});

// Eliminar proyecto (borra en cascada hitos, listas, tareas, subtareas)
r.delete('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!project) return res.status(404).json({ error: 'No encontrado' });
  await prisma.project.delete({ where: { id: req.params.id } });
  logAudit(req, { module: 'crm', action: 'baja_proyecto', summary: `Eliminó el proyecto ${project.name}`, refId: project.id });
  res.json({ ok: true });
});

// Asignar equipo (reemplaza la lista de miembros)
r.put('/:id/members', async (req, res) => {
  const ids = req.body.memberIds || [];
  await prisma.projectMember.deleteMany({ where: { projectId: req.params.id } });
  if (ids.length) await prisma.projectMember.createMany({ data: ids.map(staffId => ({ projectId: req.params.id, staffId })) });
  res.json({ ok: true });
});

// ---- Hitos ----
r.post('/:id/milestones', async (req, res) => {
  const { name, description, targetDate } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El hito necesita un nombre' });
  const count = await prisma.milestone.count({ where: { projectId: req.params.id } });
  const m = await prisma.milestone.create({ data: { projectId: req.params.id, name: name.trim(), description: description || null, targetDate: targetDate ? new Date(targetDate) : null, order: count } });
  res.status(201).json(m);
});
r.put('/milestones/:mid', async (req, res) => {
  const { name, description, targetDate, completed } = req.body;
  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description || null;
  if (targetDate !== undefined) data.targetDate = targetDate ? new Date(targetDate) : null;
  if (completed !== undefined) data.completed = !!completed;
  const m = await prisma.milestone.update({ where: { id: req.params.mid }, data });
  res.json(m);
});
r.delete('/milestones/:mid', async (req, res) => { await prisma.milestone.delete({ where: { id: req.params.mid } }); res.json({ ok: true }); });

// ---- Listas de tareas ----
r.post('/milestones/:mid/lists', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'La lista necesita un nombre' });
  const count = await prisma.taskList.count({ where: { milestoneId: req.params.mid } });
  const tl = await prisma.taskList.create({ data: { milestoneId: req.params.mid, name: name.trim(), order: count } });
  res.status(201).json(tl);
});
r.put('/lists/:lid', async (req, res) => { const tl = await prisma.taskList.update({ where: { id: req.params.lid }, data: { name: (req.body.name || '').trim() } }); res.json(tl); });
r.delete('/lists/:lid', async (req, res) => { await prisma.taskList.delete({ where: { id: req.params.lid } }); res.json({ ok: true }); });

// ---- Tareas ----
r.post('/lists/:lid/tasks', async (req, res) => {
  const { title, priority, assigneeId, dueDate } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'La tarea necesita un título' });
  const count = await prisma.task.count({ where: { taskListId: req.params.lid } });
  const t = await prisma.task.create({ data: { taskListId: req.params.lid, title: title.trim(), priority: priority || 'media', assigneeId: assigneeId || null, dueDate: dueDate ? new Date(dueDate) : null, order: count } });
  res.status(201).json(t);
});
r.put('/tasks/:tid', async (req, res) => {
  const { title, priority, assigneeId, dueDate, done } = req.body;
  const data = {};
  if (title !== undefined) data.title = title.trim();
  if (priority !== undefined) data.priority = priority;
  if (assigneeId !== undefined) data.assigneeId = assigneeId || null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (done !== undefined) data.done = !!done;
  const t = await prisma.task.update({ where: { id: req.params.tid }, data });
  res.json(t);
});
r.patch('/tasks/:tid/toggle', async (req, res) => {
  const t = await prisma.task.findUnique({ where: { id: req.params.tid } });
  const upd = await prisma.task.update({ where: { id: req.params.tid }, data: { done: !t.done } });
  res.json(upd);
});
r.delete('/tasks/:tid', async (req, res) => { await prisma.task.delete({ where: { id: req.params.tid } }); res.json({ ok: true }); });

// ---- Subtareas ----
r.post('/tasks/:tid/subtasks', async (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'La subtarea necesita un título' });
  const count = await prisma.subtask.count({ where: { taskId: req.params.tid } });
  const s = await prisma.subtask.create({ data: { taskId: req.params.tid, title: title.trim(), order: count } });
  res.status(201).json(s);
});
r.patch('/subtasks/:sid/toggle', async (req, res) => {
  const s = await prisma.subtask.findUnique({ where: { id: req.params.sid } });
  const upd = await prisma.subtask.update({ where: { id: req.params.sid }, data: { done: !s.done } });
  res.json(upd);
});
r.delete('/subtasks/:sid', async (req, res) => { await prisma.subtask.delete({ where: { id: req.params.sid } }); res.json({ ok: true }); });

export default r;

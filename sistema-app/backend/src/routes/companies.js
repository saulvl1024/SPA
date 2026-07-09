import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth, requirePerm('crm'));

// Lista de empresas (con conteo de clientes ligados). Búsqueda opcional ?q=
r.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const where = q ? { name: { contains: q, mode: 'insensitive' } } : {};
  const companies = await prisma.company.findMany({
    where,
    include: { _count: { select: { clients: true } } },
    orderBy: { name: 'asc' },
    take: 300,
  });
  res.json(companies);
});

// Exportar todas las empresas. Va antes de '/:id'.
r.get('/export', async (_req, res) => {
  const cs = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  res.json(cs.map(c => ({
    name: c.name, rfc: c.rfc || '', phone: c.phone || '',
    email: c.email || '', address: c.address || '', notes: c.notes || '',
  })));
});

// Importar empresas [{name, rfc, phone, email, address, notes}]. Match por nombre: actualiza o crea.
r.post('/import', async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let created = 0, updated = 0, skipped = 0; const errors = [];
  const existing = await prisma.company.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map(c => [c.name.trim().toLowerCase(), c.id]));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const name = (row.name || '').toString().trim();
    if (!name) { skipped++; continue; }
    try {
      const data = {
        name, rfc: (row.rfc || '').toString().trim() || null,
        phone: (row.phone || '').toString().trim() || null,
        email: (row.email || '').toString().trim() || null,
        address: (row.address || '').toString().trim() || null,
        notes: (row.notes || '').toString().trim() || null,
      };
      const id = byName.get(name.toLowerCase());
      if (id) { await prisma.company.update({ where: { id }, data }); updated++; }
      else { const nc = await prisma.company.create({ data }); byName.set(name.toLowerCase(), nc.id); created++; }
    } catch (e) { errors.push(`Fila ${i + 1} (${name}): ${e.message}`); }
  }
  res.json({ created, updated, skipped, errors, total: rows.length });
});

// Detalle de una empresa con sus clientes
r.get('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: { clients: { orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true, email: true, tag: true } } },
  });
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(company);
});

// Crear empresa
r.post('/', async (req, res) => {
  const { name, rfc, phone, email, address, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
  const company = await prisma.company.create({
    data: { name: name.trim(), rfc: rfc || null, phone: phone || null, email: email || null, address: address || null, notes: notes || null },
  });
  logAudit(req, { module: 'crm', action: 'alta_empresa', summary: `Creó la empresa ${company.name}`, refId: company.id });
  res.status(201).json(company);
});

// Editar empresa
r.put('/:id', async (req, res) => {
  const { name, rfc, phone, email, address, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: { name: name.trim(), rfc: rfc || null, phone: phone || null, email: email || null, address: address || null, notes: notes || null },
  });
  logAudit(req, { module: 'crm', action: 'editar_empresa', summary: `Editó la empresa ${company.name}`, refId: company.id });
  res.json(company);
});

// Eliminar empresa (los clientes quedan sin empresa, no se borran)
r.delete('/:id', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  await prisma.company.delete({ where: { id: req.params.id } });
  logAudit(req, { module: 'crm', action: 'baja_empresa', summary: `Eliminó la empresa ${company.name}`, refId: company.id });
  res.json({ ok: true });
});

// Asignar / quitar la empresa de un cliente
r.patch('/assign/:clientId', async (req, res) => {
  const { companyId } = req.body; // null para quitar
  const client = await prisma.client.update({
    where: { id: req.params.clientId },
    data: { companyId: companyId || null },
  });
  res.json({ ok: true, companyId: client.companyId });
});

export default r;

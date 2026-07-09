import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
const exp = requirePerm('expediente');

const r = Router();
r.use(auth);

// Listar / buscar (paginado para escalar a miles de clientes)
// ?q= busca por nombre o teléfono · ?take= (default 50, máx 200) · ?skip= para paginar
r.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const take = Math.min(Number(req.query.take) || 50, 200);
  const skip = Number(req.query.skip) || 0;
  const orderBy = req.query.order === 'points' ? { points: 'desc' } : { name: 'asc' };

  // Con búsqueda: usa unaccent para ignorar acentos (María = maria). Obtiene los IDs por SQL.
  if (q) {
    const like = `%${q}%`;
    const rows = await prisma.$queryRaw`
      SELECT id FROM "Client"
      WHERE unaccent(lower("name")) LIKE unaccent(lower(${like}))
         OR "phone" LIKE ${like}
      LIMIT ${take} OFFSET ${skip}`;
    const ids = rows.map(r => r.id);
    const clients = ids.length ? await prisma.client.findMany({ where: { id: { in: ids } }, orderBy }) : [];
    return res.json(clients);
  }
  const clients = await prisma.client.findMany({ orderBy, take, skip });
  res.json(clients);
});

// Conteo total (para paginación y métricas) — ligero
r.get('/count', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q) {
    const like = `%${q}%`;
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS n FROM "Client"
      WHERE unaccent(lower("name")) LIKE unaccent(lower(${like})) OR "phone" LIKE ${like}`;
    return res.json({ total: rows[0]?.n || 0 });
  }
  res.json({ total: await prisma.client.count() });
});

// Verificación en vivo desde el formulario: ¿este teléfono ya existe?
// IMPORTANTE: debe ir ANTES de '/:id' para que Express no lo tome como un id.
r.get('/check-phone', async (req, res) => {
  const dup = await findDupPhone(req.query.phone, req.query.excludeId || null);
  res.json({ duplicate: !!dup, client: dup || null });
});

// Exportar TODOS los clientes (respaldo / migración). Va antes de '/:id'.
r.get('/export', requirePerm('crm'), async (_req, res) => {
  const clients = await prisma.client.findMany({
    orderBy: { name: 'asc' },
    include: { company: { select: { name: true } } },
  });
  res.json(clients.map(c => ({
    name: c.name, phone: c.phone || '', email: c.email || '',
    birth: c.birth ? c.birth.toISOString().slice(0, 10) : '',
    tag: c.tag || '', source: c.source || '',
    empresa: c.company?.name || '', note: c.note || '',
  })));
});

// Importar clientes desde filas [{name, phone, email, birth, tag, source, empresa, note}].
// Dedupe por teléfono: si el teléfono ya existe, ACTUALIZA; si no, CREA. Liga/crea empresa por nombre.
r.post('/import', requirePerm('crm'), async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let created = 0, updated = 0, skipped = 0; const errors = [];
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const compByName = new Map(companies.map(c => [c.name.trim().toLowerCase(), c.id]));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const name = (row.name || '').toString().trim();
    if (!name) { skipped++; continue; }
    try {
      const phone = (row.phone || '').toString().trim();
      let companyId = null;
      const cn = (row.empresa || '').toString().trim();
      if (cn) {
        companyId = compByName.get(cn.toLowerCase());
        if (!companyId) { const nc = await prisma.company.create({ data: { name: cn } }); companyId = nc.id; compByName.set(cn.toLowerCase(), nc.id); }
      }
      const b = row.birth ? new Date(row.birth) : null;
      const data = {
        name, phone: phone || null, email: (row.email || '').toString().trim() || null,
        tag: (row.tag || '').toString().trim() || 'Nueva', source: (row.source || '').toString().trim() || null,
        note: (row.note || '').toString().trim() || null, companyId,
        birth: b && !isNaN(b) ? b : null,
      };
      const dup = phone ? await findDupPhone(phone, null) : null;
      if (dup) { await prisma.client.update({ where: { id: dup.id }, data }); updated++; }
      else { await prisma.client.create({ data: { ...data, record: { create: {} } } }); created++; }
    } catch (e) { errors.push(`Fila ${i + 1} (${name}): ${e.message}`); }
  }
  res.json({ created, updated, skipped, errors, total: rows.length });
});

// ¿El usuario puede ver el expediente clínico (datos sensibles)?
const canExpediente = u => u?.role === 'admin' || u?.role === 'superadmin' || (u?.perms || []).includes('expediente');

// Detalle. El expediente clínico (record + notas) SOLO se incluye si el usuario tiene permiso.
r.get('/:id', async (req, res) => {
  const exp = canExpediente(req.user);
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: exp
      ? { record: { include: { notes: true } }, packages: true, _count: { select: { sales: true } } }
      : { packages: true, _count: { select: { sales: true } } },
  });
  if (!client) return res.status(404).json({ error: 'No encontrado' });
  res.json(client);
});

// Busca un cliente con el mismo teléfono (comparando SOLO dígitos, ignora espacios/guiones).
// Devuelve {id, name} del cliente existente, o null. excludeId omite al propio cliente (al editar).
async function findDupPhone(phone, excludeId) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const rows = await prisma.$queryRaw`
    SELECT id, name FROM "Client"
    WHERE regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${digits}`;
  const found = rows.find(r => r.id !== excludeId);
  return found || null;
}

// Crear
r.post('/', async (req, res) => {
  const { name, phone, email, birth, tag, skin, allergies, source, note, force, companyId } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  // Teléfono único: si ya existe y no se forzó, rechaza avisando con quién choca.
  if (phone && !force) {
    const dup = await findDupPhone(phone, null);
    if (dup) return res.status(409).json({ error: `Ese teléfono ya está registrado con ${dup.name}.`, duplicate: true, client: dup });
  }
  // Los datos clínicos (alergias) solo los puede escribir quien tenga permiso de expediente.
  const canExp = canExpediente(req.user);
  const client = await prisma.client.create({
    data: {
      name, phone, email, tag: tag || 'Nueva', skin: skin || null, note: note || null, source: source || null,
      companyId: companyId || null,
      birth: birth ? new Date(birth) : null,
      // El expediente clínico se crea vacío; los datos clínicos se capturan en el módulo Expediente
      record: { create: { allergies: canExp ? (allergies || null) : null } },
    },
    include: { record: true },
  });
  res.status(201).json(client);
});

// Actualizar
r.put('/:id', async (req, res) => {
  const { name, phone, email, birth, tag, skin, allergies, source, note, tagManual, force, companyId } = req.body;
  // Teléfono único (excluye al propio cliente que se edita)
  if (phone && !force) {
    const dup = await findDupPhone(phone, req.params.id);
    if (dup) return res.status(409).json({ error: `Ese teléfono ya está registrado con ${dup.name}.`, duplicate: true, client: dup });
  }
  const data = { name, phone, email, source, birth: birth ? new Date(birth) : undefined };
  if (companyId !== undefined) data.companyId = companyId || null;
  if (skin !== undefined) data.skin = skin;
  if (note !== undefined) data.note = note;
  // La etiqueta solo la cambia un admin (manual). Marca tagManual para que el auto no la sobreescriba.
  if (tag !== undefined && req.user.role === 'admin') { data.tag = tag; data.tagManual = tagManual !== false; }
  const client = await prisma.client.update({ where: { id: req.params.id }, data });
  // Alergias: dato clínico → solo si el usuario tiene permiso de expediente.
  if (allergies !== undefined && canExpediente(req.user)) {
    let record = await prisma.clinicalRecord.findUnique({ where: { clientId: req.params.id } });
    if (!record) await prisma.clinicalRecord.create({ data: { clientId: req.params.id, allergies } });
    else await prisma.clinicalRecord.update({ where: { id: record.id }, data: { allergies } });
  }
  res.json(client);
});

// Normaliza adjuntos: cada uno {name, type, data(base64)} → string JSON. Límite de tamaño total.
function packAttachments(list) {
  if (!Array.isArray(list)) return [];
  const clean = list.filter(a => a && a.data && a.name).slice(0, 10).map(a => JSON.stringify({
    name: String(a.name).slice(0, 120), type: a.type || '', data: a.data,
  }));
  const bytes = clean.reduce((n, s) => n + s.length, 0);
  if (bytes > 12 * 1024 * 1024) throw new Error('Los archivos adjuntos superan el límite (12 MB en total)');
  return clean;
}

// Agregar nota clínica al expediente del cliente (con adjuntos opcionales)
r.post('/:id/notes', exp, async (req, res) => {
  const { title, evolution, attachments } = req.body;
  if (!title) return res.status(400).json({ error: 'Falta el título' });
  try {
    let record = await prisma.clinicalRecord.findUnique({ where: { clientId: req.params.id } });
    if (!record) record = await prisma.clinicalRecord.create({ data: { clientId: req.params.id } });
    const note = await prisma.clinicalNote.create({
      data: { recordId: record.id, staffId: req.user.id, title, evolution: evolution || null, attachments: packAttachments(attachments) },
    });
    res.status(201).json(note);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Editar una nota (incluye adjuntos)
r.put('/notes/:noteId', exp, async (req, res) => {
  const { title, evolution, attachments } = req.body;
  if (!title) return res.status(400).json({ error: 'Falta el título' });
  try {
    const data = { title, evolution: evolution || null };
    if (attachments !== undefined) data.attachments = packAttachments(attachments);
    const note = await prisma.clinicalNote.update({ where: { id: req.params.noteId }, data });
    res.json(note);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Eliminar una nota
r.delete('/notes/:noteId', exp, async (req, res) => {
  await prisma.clinicalNote.delete({ where: { id: req.params.noteId } });
  res.json({ ok: true });
});

// Actualizar el expediente clínico (alergias, contraindicaciones y datos estructurados)
r.put('/:id/record', exp, async (req, res) => {
  const { allergies, contraindications, skinType, conditions, medications, bloodType, emergencyContact } = req.body;
  let record = await prisma.clinicalRecord.findUnique({ where: { clientId: req.params.id } });
  if (!record) record = await prisma.clinicalRecord.create({ data: { clientId: req.params.id } });
  const data = {};
  if (allergies !== undefined) data.allergies = allergies;
  if (contraindications !== undefined) data.contraindications = contraindications;
  if (skinType !== undefined) data.skinType = skinType;
  if (conditions !== undefined) data.conditions = Array.isArray(conditions) ? conditions : [];
  if (medications !== undefined) data.medications = medications;
  if (bloodType !== undefined) data.bloodType = bloodType;
  if (emergencyContact !== undefined) data.emergencyContact = emergencyContact;
  const updated = await prisma.clinicalRecord.update({ where: { id: record.id }, data });
  res.json(updated);
});

export default r;

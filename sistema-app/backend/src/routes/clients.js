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

// Detalle con expediente
r.get('/:id', async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { record: { include: { notes: true } }, packages: true, _count: { select: { sales: true } } },
  });
  if (!client) return res.status(404).json({ error: 'No encontrado' });
  res.json(client);
});

// Crear
r.post('/', async (req, res) => {
  const { name, phone, email, birth, tag, skin, allergies, source, note } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const client = await prisma.client.create({
    data: {
      name, phone, email, tag: tag || 'Nueva', skin: skin || null, note: note || null, source: source || null,
      birth: birth ? new Date(birth) : null,
      // El expediente clínico se crea vacío; los datos clínicos se capturan en el módulo Expediente
      record: { create: { allergies: allergies || null } },
    },
    include: { record: true },
  });
  res.status(201).json(client);
});

// Actualizar
r.put('/:id', async (req, res) => {
  const { name, phone, email, birth, tag, skin, allergies, source, note, tagManual } = req.body;
  const data = { name, phone, email, source, birth: birth ? new Date(birth) : undefined };
  if (skin !== undefined) data.skin = skin;
  if (note !== undefined) data.note = note;
  // La etiqueta solo la cambia un admin (manual). Marca tagManual para que el auto no la sobreescriba.
  if (tag !== undefined && req.user.role === 'admin') { data.tag = tag; data.tagManual = tagManual !== false; }
  const client = await prisma.client.update({ where: { id: req.params.id }, data });
  if (allergies !== undefined) {
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

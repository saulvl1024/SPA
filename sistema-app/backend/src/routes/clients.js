import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

// Listar / buscar
r.get('/', async (req, res) => {
  const q = (req.query.q || '').toString();
  const clients = await prisma.client.findMany({
    where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(clients);
});

// Detalle con expediente
r.get('/:id', async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { record: { include: { notes: true } }, packages: true },
  });
  if (!client) return res.status(404).json({ error: 'No encontrado' });
  res.json(client);
});

// Crear
r.post('/', async (req, res) => {
  const { name, phone, email, birth, tag, skin, allergies } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const client = await prisma.client.create({
    data: {
      name, phone, email, tag: tag || 'Nueva', skin,
      birth: birth ? new Date(birth) : null,
      record: { create: { allergies: allergies || null } },
    },
    include: { record: true },
  });
  res.status(201).json(client);
});

// Actualizar
r.put('/:id', async (req, res) => {
  const { name, phone, email, birth, tag, skin } = req.body;
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: { name, phone, email, tag, skin, birth: birth ? new Date(birth) : undefined },
  });
  res.json(client);
});

// Agregar nota clínica al expediente del cliente
r.post('/:id/notes', async (req, res) => {
  const { title, evolution } = req.body;
  if (!title) return res.status(400).json({ error: 'Falta el título' });
  let record = await prisma.clinicalRecord.findUnique({ where: { clientId: req.params.id } });
  if (!record) record = await prisma.clinicalRecord.create({ data: { clientId: req.params.id } });
  const note = await prisma.clinicalNote.create({
    data: { recordId: record.id, staffId: req.user.id, title, evolution: evolution || null },
  });
  res.status(201).json(note);
});

// Actualizar alergias/contraindicaciones del expediente
r.put('/:id/record', async (req, res) => {
  const { allergies, contraindications } = req.body;
  let record = await prisma.clinicalRecord.findUnique({ where: { clientId: req.params.id } });
  if (!record) record = await prisma.clinicalRecord.create({ data: { clientId: req.params.id } });
  const updated = await prisma.clinicalRecord.update({
    where: { id: record.id }, data: { allergies, contraindications },
  });
  res.json(updated);
});

export default r;

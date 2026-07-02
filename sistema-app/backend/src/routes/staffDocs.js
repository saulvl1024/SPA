import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';

const r = Router();
r.use(auth, requirePerm('personal')); // solo quien gestiona Personal

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Listar documentos de una empleada (sin el contenido, para que sea ligero)
r.get('/:staffId/documents', async (req, res) => {
  const docs = await prisma.staffDocument.findMany({
    where: { staffId: req.params.staffId },
    select: { id: true, category: true, name: true, fileName: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

// Subir un documento. data = data URL base64 (data:application/pdf;base64,....)
r.post('/:staffId/documents', async (req, res) => {
  const { category, name, fileName, mimeType, data } = req.body;
  if (!data || !fileName) return res.status(400).json({ error: 'Falta el archivo' });
  // Tamaño aproximado del base64
  const base64 = (data.split(',')[1] || data);
  const size = Math.floor(base64.length * 3 / 4);
  if (size > MAX_BYTES) return res.status(400).json({ error: 'El archivo supera el límite de 5 MB' });
  const doc = await prisma.staffDocument.create({
    data: {
      staffId: req.params.staffId,
      category: category || 'Otro', name: name || fileName, fileName,
      mimeType: mimeType || 'application/octet-stream', size, data,
    },
    select: { id: true, category: true, name: true, fileName: true, mimeType: true, size: true, createdAt: true },
  });
  res.status(201).json(doc);
});

// Descargar / ver un documento (devuelve el data URL)
r.get('/documents/:id', async (req, res) => {
  const doc = await prisma.staffDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'No encontrado' });
  res.json(doc); // incluye data (base64) para abrir/descargar en el navegador
});

// Eliminar
r.delete('/documents/:id', async (req, res) => {
  await prisma.staffDocument.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default r;

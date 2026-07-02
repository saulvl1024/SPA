import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth, adminOnly); // solo admin importa

const str = v => (v == null ? '' : String(v).trim());
const num = v => { const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Importar CLIENTES. Body: { rows: [{ nombre, telefono?, email?, etiqueta?, origen? }] }
r.post('/clients', async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'No hay filas para importar' });
  if (rows.length > 10000) return res.status(400).json({ error: 'Máximo 10,000 filas por importación' });

  const errors = [];
  const data = [];
  rows.forEach((row, i) => {
    const name = str(row.nombre || row.name || row.Nombre);
    if (!name) { errors.push({ fila: i + 2, error: 'Falta el nombre' }); return; }
    const email = str(row.email || row.correo || row.Email).toLowerCase();
    if (email && !EMAIL_RE.test(email)) { errors.push({ fila: i + 2, error: 'Correo inválido: ' + email }); return; }
    data.push({
      name,
      phone: str(row.telefono || row.teléfono || row.phone || row.Telefono) || null,
      email: email || null,
      tag: str(row.etiqueta || row.tag) || 'Nueva',
      source: str(row.origen || row.source) || null,
    });
  });

  if (!data.length) return res.status(400).json({ error: 'Ninguna fila válida', errors });

  // Inserta por lotes (skipDuplicates evita romper por emails repetidos)
  let inserted = 0;
  for (let i = 0; i < data.length; i += 500) {
    const r2 = await prisma.client.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
    inserted += r2.count;
  }
  logAudit(req, { module: 'clientes', action: 'importar', summary: `Importó ${inserted} cliente(s) desde archivo` });
  res.json({ ok: true, inserted, totalFilas: rows.length, errores: errors });
});

// Importar PRODUCTOS. Body: { rows: [{ nombre, precio, stock?, minimo?, costo? }] }
r.post('/products', async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'No hay filas para importar' });
  if (rows.length > 10000) return res.status(400).json({ error: 'Máximo 10,000 filas por importación' });

  const errors = [];
  const data = [];
  rows.forEach((row, i) => {
    const name = str(row.nombre || row.name || row.Nombre);
    if (!name) { errors.push({ fila: i + 2, error: 'Falta el nombre' }); return; }
    data.push({
      name,
      price: num(row.precio || row.price || row.Precio),
      stock: Math.round(num(row.stock || row.existencia || row.Stock)),
      minStock: Math.round(num(row.minimo || row.mínimo || row.minStock)),
      cost: num(row.costo || row.cost),
    });
  });

  if (!data.length) return res.status(400).json({ error: 'Ninguna fila válida', errors });

  let inserted = 0;
  for (let i = 0; i < data.length; i += 500) {
    const r2 = await prisma.product.createMany({ data: data.slice(i, i + 500) });
    inserted += r2.count;
  }
  logAudit(req, { module: 'inventario', action: 'importar', summary: `Importó ${inserted} producto(s) desde archivo` });
  res.json({ ok: true, inserted, totalFilas: rows.length, errores: errors });
});

export default r;

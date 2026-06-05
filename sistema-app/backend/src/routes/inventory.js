import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, adminOnly } from '../middleware/auth.js';

const r = Router();
r.use(auth);

r.get('/supplies', async (_req, res) => res.json(await prisma.supply.findMany({ orderBy: { name: 'asc' } })));
r.get('/products', async (_req, res) => res.json(await prisma.product.findMany({ orderBy: { name: 'asc' } })));

// Crear insumo / producto: SOLO ADMIN
r.post('/supplies', auth, adminOnly, async (req, res) => {
  const { name, category, unit, stock, minStock } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const supply = await prisma.supply.create({
    data: { name, category: category || null, unit: unit || 'pza', stock: Number(stock) || 0, minStock: Number(minStock) || 0 },
  });
  res.status(201).json(supply);
});

r.post('/products', auth, adminOnly, async (req, res) => {
  const { name, price, stock, minStock } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const product = await prisma.product.create({
    data: { name, price: Number(price) || 0, stock: Number(stock) || 0, minStock: Number(minStock) || 0 },
  });
  res.status(201).json(product);
});

// Entrada de stock (cualquier empleada)
r.post('/supplies/:id/stock', async (req, res) => {
  const supply = await prisma.supply.update({
    where: { id: req.params.id }, data: { stock: { increment: Number(req.body.qty) || 0 } },
  });
  res.json(supply);
});

// Cambiar mínimo: SOLO ADMIN
r.patch('/supplies/:id/min', auth, adminOnly, async (req, res) => {
  const supply = await prisma.supply.update({
    where: { id: req.params.id }, data: { minStock: Number(req.body.minStock) || 0 },
  });
  res.json(supply);
});

r.patch('/products/:id/min', auth, adminOnly, async (req, res) => {
  const product = await prisma.product.update({
    where: { id: req.params.id }, data: { minStock: Number(req.body.minStock) || 0 },
  });
  res.json(product);
});

export default r;

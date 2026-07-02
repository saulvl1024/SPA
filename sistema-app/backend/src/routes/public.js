import { Router } from 'express';
import { prisma } from '../db.js';

// Rutas PÚBLICAS (sin autenticación): menú para clientes vía NFC/QR.
const r = Router();

// Menú público: nombre del negocio + productos agrupados por categoría.
// No expone stock, costos ni datos internos.
r.get('/menu', async (_req, res) => {
  const [cfg, products] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 'singleton' } }),
    prisma.product.findMany({
      where: { isBundle: false },
      select: { id: true, name: true, price: true, category: true, image: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
  ]);

  // Agrupa por categoría (los sin categoría van en "Otros")
  const groups = {};
  for (const p of products) {
    const cat = p.category || 'Otros';
    (groups[cat] = groups[cat] || []).push({ id: p.id, name: p.name, price: p.price, image: p.image });
  }
  const categories = Object.entries(groups).map(([name, items]) => ({ name, items }));

  res.json({
    businessName: cfg?.businessName || 'Menú',
    categories,
  });
});

export default r;

import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm, adminOnly } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { getSettings } from './system.js';

const r = Router();
r.use(auth, requirePerm('ventas'));

const isAdmin = req => req.user?.role === 'admin' || req.user?.role === 'superadmin';

// Calcula los totales de una cotización (servidor = fuente de verdad).
// El envío gratis por umbral lo decide el servidor según la config del negocio,
// no se confía en lo que mande el cliente.
function quoteTotals(items, globalDiscount = 0, taxRate = 0, shippingInput = 0, freeInput = false, freeThreshold = 0) {
  const subtotal = items.reduce((a, i) => {
    const linea = (Number(i.price) || 0) * (Number(i.qty) || 0);
    const desc = linea * (Math.min(100, Math.max(0, Number(i.discount) || 0)) / 100);
    return a + (linea - desc);
  }, 0);
  const baseTrasDesc = Math.max(0, subtotal - (Number(globalDiscount) || 0));
  const tax = baseTrasDesc * (Math.max(0, Number(taxRate) || 0) / 100);

  // Envío: gratis si el negocio configuró un umbral y el subtotal lo alcanza,
  // o si el usuario lo marcó como cortesía manualmente.
  const umbral = Number(freeThreshold) || 0;
  const alcanzaUmbral = umbral > 0 && subtotal >= umbral;
  const shippingFree = !!freeInput || alcanzaUmbral;
  const shipping = shippingFree ? 0 : Math.max(0, Number(shippingInput) || 0);

  return {
    subtotal, discount: Number(globalDiscount) || 0, taxRate: Number(taxRate) || 0, tax,
    shipping, shippingFree,
    total: baseTrasDesc + tax + shipping,
  };
}

/* ===================== COTIZACIONES ===================== */
// Lista de cotizaciones. El vendedor ve solo las suyas; el admin ve todas (filtros opcionales).
r.get('/quotes', async (req, res) => {
  const where = {};
  if (!isAdmin(req)) where.sellerId = req.user.id;
  if (req.query.status) where.status = req.query.status;
  if (req.query.sellerId && isAdmin(req)) where.sellerId = req.query.sellerId;
  const quotes = await prisma.quote.findMany({
    where, include: { client: true, items: true }, orderBy: { createdAt: 'desc' }, take: 300,
  });
  res.json(quotes);
});

// Detalle de una cotización
r.get('/quotes/:id', async (req, res) => {
  const q = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { client: true, items: true } });
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (!isAdmin(req) && q.sellerId !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
  res.json(q);
});

// Crear cotización
r.post('/quotes', async (req, res) => {
  const { clientId, clientName, items = [], discount = 0, taxRate = 0, shipping = 0, shippingFree = false, notes, validUntil } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Agrega al menos un producto o servicio' });

  // Precios resueltos desde la BD (seguridad). Soporta lista de precios opcional por item.
  const { envioGratisDesde } = await getSettings();
  const t = quoteTotals(items, discount, taxRate, shipping, shippingFree, envioGratisDesde);
  const quote = await prisma.quote.create({
    data: {
      clientId: clientId || null, clientName: clientName || null, sellerId: req.user.id,
      status: 'borrador', subtotal: t.subtotal, discount: t.discount, taxRate: t.taxRate, tax: t.tax,
      shipping: t.shipping, shippingFree: t.shippingFree, total: t.total,
      notes: notes || null, validUntil: validUntil ? new Date(validUntil) : null,
      items: { create: items.map(i => ({
        type: i.type === 'servicio' ? 'servicio' : 'producto', refId: i.refId || null,
        name: String(i.name || ''), qty: Number(i.qty) || 1, price: Number(i.price) || 0,
        discount: Math.min(100, Math.max(0, Number(i.discount) || 0)),
      })) },
    },
    include: { client: true, items: true },
  });
  logAudit(req, { module: 'ventas', action: 'alta_cotizacion', summary: `Creó cotización #${quote.folio} por $${quote.total.toFixed(2)}`, refId: quote.id });
  res.status(201).json(quote);
});

// Editar cotización (reemplaza líneas y recalcula). Solo el dueño o admin, y solo si no está convertida.
r.put('/quotes/:id', async (req, res) => {
  const existing = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  if (!isAdmin(req) && existing.sellerId !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
  if (existing.status === 'convertida') return res.status(400).json({ error: 'No se puede editar una cotización ya convertida en venta' });

  const { clientId, clientName, items = [], discount = 0, taxRate = 0, shipping = 0, shippingFree = false, notes, validUntil } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Agrega al menos un producto o servicio' });
  const { envioGratisDesde } = await getSettings();
  const t = quoteTotals(items, discount, taxRate, shipping, shippingFree, envioGratisDesde);
  const quote = await prisma.$transaction(async (tx) => {
    await tx.quoteItem.deleteMany({ where: { quoteId: req.params.id } });
    return tx.quote.update({
      where: { id: req.params.id },
      data: {
        clientId: clientId || null, clientName: clientName || null,
        subtotal: t.subtotal, discount: t.discount, taxRate: t.taxRate, tax: t.tax,
        shipping: t.shipping, shippingFree: t.shippingFree, total: t.total,
        notes: notes || null, validUntil: validUntil ? new Date(validUntil) : null,
        items: { create: items.map(i => ({
          type: i.type === 'servicio' ? 'servicio' : 'producto', refId: i.refId || null,
          name: String(i.name || ''), qty: Number(i.qty) || 1, price: Number(i.price) || 0,
          discount: Math.min(100, Math.max(0, Number(i.discount) || 0)),
        })) },
      },
      include: { client: true, items: true },
    });
  });
  logAudit(req, { module: 'ventas', action: 'editar_cotizacion', summary: `Editó cotización #${quote.folio}`, refId: quote.id });
  res.json(quote);
});

// Cambiar estado (enviada / aceptada / rechazada / vencida)
r.patch('/quotes/:id/status', async (req, res) => {
  const { status } = req.body;
  const valid = ['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  const existing = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  if (!isAdmin(req) && existing.sellerId !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
  if (existing.status === 'convertida') return res.status(400).json({ error: 'Ya fue convertida en venta' });
  const q = await prisma.quote.update({ where: { id: req.params.id }, data: { status } });
  logAudit(req, { module: 'ventas', action: 'estado_cotizacion', summary: `Cotización #${q.folio} → ${status}`, refId: q.id });
  res.json(q);
});

// Eliminar cotización (no convertida)
r.delete('/quotes/:id', async (req, res) => {
  const existing = await prisma.quote.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  if (!isAdmin(req) && existing.sellerId !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
  if (existing.status === 'convertida') return res.status(400).json({ error: 'No se puede eliminar una cotización convertida' });
  await prisma.quote.delete({ where: { id: req.params.id } });
  logAudit(req, { module: 'ventas', action: 'baja_cotizacion', summary: `Eliminó cotización #${existing.folio}`, refId: existing.id });
  res.json({ ok: true });
});

// Convertir cotización en venta real (descuenta inventario, entra a caja del usuario)
r.post('/quotes/:id/convert', async (req, res) => {
  const { paymentMethod = 'efectivo' } = req.body;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!quote) throw new Error('Cotización no encontrada');
      if (quote.status === 'convertida') throw new Error('Esta cotización ya fue convertida');
      if (!quote.items.length) throw new Error('La cotización está vacía');

      // Cliente: el de la cotización o "Mostrador"
      let clientId = quote.clientId;
      if (!clientId) {
        let m = await tx.client.findFirst({ where: { name: 'Mostrador' } });
        if (!m) m = await tx.client.create({ data: { name: 'Mostrador' } });
        clientId = m.id;
      }
      const session = await tx.cashSession.findFirst({ where: { staffId: req.user.id, closed: false } });

      // Descuenta inventario de los productos (precarga en batch, lookup O(1))
      const prodIds = [...new Set(quote.items.filter(i => i.type === 'producto' && i.refId).map(i => i.refId))];
      const prods = prodIds.length ? await tx.product.findMany({ where: { id: { in: prodIds } }, include: { components: true } }) : [];
      const prodMap = new Map(prods.map(p => [p.id, p]));
      for (const it of quote.items) {
        if (it.type !== 'producto' || !it.refId) continue;
        const p = prodMap.get(it.refId);
        if (!p) continue;
        if (p.isBundle && p.components.length) {
          for (const c of p.components) await tx.product.update({ where: { id: c.componentId }, data: { stock: { decrement: c.qty * it.qty } } }).catch(() => {});
        } else {
          await tx.product.update({ where: { id: it.refId }, data: { stock: { decrement: it.qty } } }).catch(() => {});
        }
      }

      const sale = await tx.sale.create({
        data: {
          clientId, cashierId: req.user.id, sessionId: session?.id || null,
          subtotal: quote.subtotal, discount: quote.discount, creditUsed: 0, total: quote.total,
          paymentMethod, points: 0,
          items: { create: quote.items.map(it => ({ type: it.type, refId: it.refId || null, name: it.name, qty: Math.round(it.qty), price: it.price })) },
          payments: { create: [{ method: paymentMethod, amount: quote.total }] },
        },
        include: { items: true, client: true },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'convertida', saleId: sale.id } });
      return { sale, folio: quote.folio };
    });
    logAudit(req, { module: 'ventas', action: 'convertir_cotizacion', summary: `Cotización #${result.folio} convertida en venta #${result.sale.ticketNo}`, refId: result.sale.id });
    res.status(201).json(result.sale);
  } catch (e) { res.status(400).json({ error: e.message || 'No se pudo convertir' }); }
});

/* ===================== CARTERA DE CLIENTES ===================== */
// Clientes del vendedor (o todos si admin). ?q búsqueda por nombre.
r.get('/clients', async (req, res) => {
  const where = {};
  if (!isAdmin(req)) where.sellerId = req.user.id;
  if (req.query.q) where.name = { contains: req.query.q, mode: 'insensitive' };
  const clients = await prisma.client.findMany({
    where, select: { id: true, name: true, phone: true, email: true, sellerId: true, tag: true },
    orderBy: { name: 'asc' }, take: 200,
  });
  res.json(clients);
});

// Asignar/cambiar el vendedor de un cliente (solo admin)
r.patch('/clients/:id/seller', adminOnly, async (req, res) => {
  const { sellerId } = req.body;
  const c = await prisma.client.update({ where: { id: req.params.id }, data: { sellerId: sellerId || null } });
  logAudit(req, { module: 'ventas', action: 'asignar_cartera', summary: `Asignó cliente "${c.name}" a un vendedor`, refId: c.id });
  res.json({ ok: true });
});

// Asignación masiva de cartera (admin): varios clientes a un vendedor
r.post('/clients/assign', adminOnly, async (req, res) => {
  const { clientIds, sellerId } = req.body;
  if (!Array.isArray(clientIds) || !clientIds.length) return res.status(400).json({ error: 'Sin clientes' });
  await prisma.client.updateMany({ where: { id: { in: clientIds } }, data: { sellerId: sellerId || null } });
  logAudit(req, { module: 'ventas', action: 'asignar_cartera_masiva', summary: `Asignó ${clientIds.length} cliente(s) a un vendedor` });
  res.json({ ok: true, count: clientIds.length });
});

// Reparto AL AZAR de clientes entre vendedores (admin), equitativo (round-robin barajado).
// body: { sellerIds?: string[] (si vacío, todos los vendedores), onlyUnassigned?: bool }
r.post('/clients/distribute', adminOnly, async (req, res) => {
  let { sellerIds, onlyUnassigned = true } = req.body;

  // Vendedores destino: los indicados, o todo el personal activo si no se especifican
  if (!Array.isArray(sellerIds) || !sellerIds.length) {
    const staff = await prisma.staff.findMany({ where: { active: true }, select: { id: true } });
    sellerIds = staff.map(s => s.id);
  }
  if (!sellerIds.length) return res.status(400).json({ error: 'No hay vendedores para repartir' });

  // Clientes a repartir: todos, o solo los que no tienen vendedor
  const where = onlyUnassigned ? { sellerId: null } : {};
  const clients = await prisma.client.findMany({ where, select: { id: true } });
  if (!clients.length) return res.json({ ok: true, count: 0, perSeller: {}, message: 'No hay clientes para repartir' });

  // Baraja los clientes (Fisher–Yates) para que el reparto sea aleatorio
  const ids = clients.map(c => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  // Reparte en round-robin: cada cliente al siguiente vendedor → carga pareja
  const buckets = {}; // sellerId -> [clientIds]
  sellerIds.forEach(s => { buckets[s] = []; });
  ids.forEach((cid, i) => { buckets[sellerIds[i % sellerIds.length]].push(cid); });

  // Aplica las actualizaciones por vendedor
  await Promise.all(
    Object.entries(buckets)
      .filter(([, list]) => list.length)
      .map(([sid, list]) => prisma.client.updateMany({ where: { id: { in: list } }, data: { sellerId: sid } }))
  );

  const perSeller = Object.fromEntries(Object.entries(buckets).map(([sid, list]) => [sid, list.length]));
  logAudit(req, { module: 'ventas', action: 'repartir_cartera_azar', summary: `Repartió ${ids.length} cliente(s) al azar entre ${sellerIds.length} vendedor(es)` });
  res.json({ ok: true, count: ids.length, perSeller });
});

/* ===================== LISTAS DE PRECIOS ===================== */
r.get('/price-lists', async (_req, res) => {
  res.json(await prisma.priceList.findMany({ where: { active: true }, include: { items: true }, orderBy: { name: 'asc' } }));
});

r.post('/price-lists', adminOnly, async (req, res) => {
  const { name, isDefault } = req.body;
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  if (isDefault) await prisma.priceList.updateMany({ data: { isDefault: false } });
  const list = await prisma.priceList.create({ data: { name: String(name), isDefault: !!isDefault } });
  logAudit(req, { module: 'ventas', action: 'alta_lista_precios', summary: `Creó lista de precios "${list.name}"`, refId: list.id });
  res.status(201).json(list);
});

// Fijar precio de un producto en una lista
r.put('/price-lists/:id/item', adminOnly, async (req, res) => {
  const { productId, price } = req.body;
  if (!productId) return res.status(400).json({ error: 'Falta el producto' });
  const item = await prisma.priceListItem.upsert({
    where: { listId_productId: { listId: req.params.id, productId } },
    update: { price: Number(price) || 0 },
    create: { listId: req.params.id, productId, price: Number(price) || 0 },
  });
  res.json(item);
});

// Quitar un producto de la lista
r.delete('/price-lists/:id/item/:productId', adminOnly, async (req, res) => {
  await prisma.priceListItem.deleteMany({ where: { listId: req.params.id, productId: req.params.productId } });
  res.json({ ok: true });
});

// Agregar TODOS los productos a la lista (o solo una categoría), con su precio base.
// body: { category?: string }  → si viene, solo esa categoría
r.post('/price-lists/:id/add-all', adminOnly, async (req, res) => {
  const { category } = req.body || {};
  const where = category ? { category } : {};
  const products = await prisma.product.findMany({ where, select: { id: true, price: true } });
  // Upsert por producto (no duplica los que ya están)
  await Promise.all(products.map(p => prisma.priceListItem.upsert({
    where: { listId_productId: { listId: req.params.id, productId: p.id } },
    update: {}, // si ya existe, conserva su precio
    create: { listId: req.params.id, productId: p.id, price: p.price },
  })));
  logAudit(req, { module: 'ventas', action: 'lista_agregar_todos', summary: `Agregó ${products.length} producto(s)${category ? ' de "' + category + '"' : ''} a una lista` });
  res.json({ ok: true, count: products.length });
});

// Quitar TODOS los productos de la lista (o solo una categoría)
r.post('/price-lists/:id/clear', adminOnly, async (req, res) => {
  const { category } = req.body || {};
  if (category) {
    const prods = await prisma.product.findMany({ where: { category }, select: { id: true } });
    await prisma.priceListItem.deleteMany({ where: { listId: req.params.id, productId: { in: prods.map(p => p.id) } } });
  } else {
    await prisma.priceListItem.deleteMany({ where: { listId: req.params.id } });
  }
  res.json({ ok: true });
});

// Aplicar % de descuento sobre el precio BASE a todos los productos (o una categoría).
// body: { percent: number, category?: string }  → precio = base * (1 - percent/100)
r.post('/price-lists/:id/apply-discount', adminOnly, async (req, res) => {
  const percent = Number(req.body?.percent);
  const { category } = req.body || {};
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return res.status(400).json({ error: 'Porcentaje inválido (0-100)' });
  const where = category ? { category } : {};
  const products = await prisma.product.findMany({ where, select: { id: true, price: true } });
  const factor = 1 - percent / 100;
  await Promise.all(products.map(p => prisma.priceListItem.upsert({
    where: { listId_productId: { listId: req.params.id, productId: p.id } },
    update: { price: Math.round(p.price * factor * 100) / 100 },
    create: { listId: req.params.id, productId: p.id, price: Math.round(p.price * factor * 100) / 100 },
  })));
  logAudit(req, { module: 'ventas', action: 'lista_descuento', summary: `Aplicó ${percent}% de descuento${category ? ' a "' + category + '"' : ''} en una lista (${products.length} productos)` });
  res.json({ ok: true, count: products.length });
});

// Categorías de producto disponibles (para los selectores de la lista de precios)
r.get('/product-categories', async (_req, res) => {
  const rows = await prisma.product.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
  res.json(rows.map(r => r.category).filter(Boolean));
});

r.delete('/price-lists/:id', adminOnly, async (req, res) => {
  await prisma.priceList.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

export default r;

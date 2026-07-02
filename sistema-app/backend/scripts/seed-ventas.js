// Genera datos de prueba para el módulo Ventas:
//  - asigna cartera de clientes a vendedores
//  - crea cotizaciones en varios estados (con líneas de producto)
//  - crea listas de precios con precios especiales
// Uso:  node scripts/seed-ventas.js [numCotizaciones]   (default 24)
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const N = Math.max(1, Math.min(Number(process.argv[2]) || 24, 300));
const rand = a => a[Math.floor(Math.random() * a.length)];
const ri = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;
const daysAgo = d => { const x = new Date(); x.setDate(x.getDate() - d); return x; };
const daysAhead = d => { const x = new Date(); x.setDate(x.getDate() + d); return x; };

const STATUSES = ['borrador', 'enviada', 'enviada', 'aceptada', 'aceptada', 'rechazada', 'vencida', 'convertida'];

async function main() {
  console.log(`Generando datos de Ventas (${N} cotizaciones)...`);

  const [clients, products, staff] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({ select: { id: true, name: true, price: true } }),
    prisma.staff.findMany({ where: { active: true }, select: { id: true } }),
  ]);

  if (!products.length) { console.error('No hay productos. Corre primero scripts/seed-catalog.js'); process.exit(1); }
  if (!clients.length)  { console.error('No hay clientes.'); process.exit(1); }
  if (!staff.length)    { console.error('No hay vendedores (staff activo).'); process.exit(1); }
  console.log(`Clientes:${clients.length} Productos:${products.length} Vendedores:${staff.length}`);

  // 1) Reparte la cartera de clientes entre vendedores (round-robin).
  // Asignación MASIVA: agrupa los ids por vendedor y hace un updateMany por vendedor
  // (rapidísimo, en vez de un update por cliente). Limita a 2000 para no tardar.
  const sample = clients.slice(0, 2000);
  const buckets = staff.map(() => []);
  sample.forEach((c, i) => buckets[i % staff.length].push(c.id));
  await Promise.all(buckets.map((ids, k) =>
    ids.length ? prisma.client.updateMany({ where: { id: { in: ids } }, data: { sellerId: staff[k].id } }) : null
  ));
  console.log(`✓ Cartera: ${sample.length} cliente(s) asignados a ${staff.length} vendedor(es).`);

  // 2) Cotizaciones con líneas
  let made = 0;
  for (let i = 0; i < N; i++) {
    const status = rand(STATUSES);
    const seller = rand(staff);
    const client = Math.random() > 0.2 ? rand(clients) : null;
    const nLines = ri(1, 5);
    const taxRate = Math.random() > 0.4 ? 16 : 0;

    // Construye líneas
    const lines = [];
    let subtotal = 0;
    for (let j = 0; j < nLines; j++) {
      const p = rand(products);
      const qty = ri(1, 20);
      const lineDisc = Math.random() > 0.7 ? ri(5, 20) : 0; // % por línea
      const lineTotal = p.price * qty * (1 - lineDisc / 100);
      subtotal += lineTotal;
      lines.push({ type: 'producto', refId: p.id, name: p.name, qty, price: p.price, discount: lineDisc });
    }
    const globalDisc = Math.random() > 0.7 ? ri(100, 800) : 0; // $ global
    const base = Math.max(0, subtotal - globalDisc);
    const tax = base * (taxRate / 100);
    const total = base + tax;

    const created = daysAgo(ri(0, 60));
    const quote = await prisma.quote.create({
      data: {
        clientId: client?.id || null,
        clientName: client ? null : `Prospecto ${i + 1}`,
        sellerId: seller.id,
        status,
        subtotal, discount: globalDisc, taxRate, tax, total,
        notes: Math.random() > 0.6 ? 'Cotización de prueba generada automáticamente.' : null,
        validUntil: status === 'vencida' ? daysAgo(ri(1, 10)) : daysAhead(ri(5, 30)),
        createdAt: created,
        items: { create: lines },
      },
    });
    made++;
  }
  console.log(`✓ Cotizaciones: ${made} creadas en varios estados.`);

  // 3) Listas de precios (si no existen)
  const defLists = [
    { name: 'Menudeo', isDefault: true, factor: 1.0 },
    { name: 'Mayoreo', isDefault: false, factor: 0.85 },
    { name: 'Distribuidor', isDefault: false, factor: 0.72 },
  ];
  let nLists = 0;
  for (const dl of defLists) {
    const exists = await prisma.priceList.findFirst({ where: { name: dl.name } });
    if (exists) continue;
    const list = await prisma.priceList.create({ data: { name: dl.name, isDefault: dl.isDefault } });
    // Precio especial para una muestra de productos
    for (const p of products.slice(0, Math.min(12, products.length))) {
      await prisma.priceListItem.create({
        data: { listId: list.id, productId: p.id, price: Math.round(p.price * dl.factor) },
      });
    }
    nLists++;
  }
  console.log(`✓ Listas de precios: ${nLists} creadas (Menudeo, Mayoreo, Distribuidor).`);

  // Resumen por estado
  const byStatus = await prisma.quote.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true } });
  console.log('\nResumen de cotizaciones por estado:');
  byStatus.forEach(s => console.log(`   · ${s.status}: ${s._count._all} ($${Math.round(s._sum.total || 0).toLocaleString('es-MX')})`));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

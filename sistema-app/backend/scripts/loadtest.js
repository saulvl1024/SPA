// Prueba de carga: genera clientes marcados [TEST] con ventas asociadas.
// Uso:   node scripts/loadtest.js [nClientes]      (default 50000)
// Limpia: node scripts/loadtest.js --clean         (borra TODO lo marcado [TEST])
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MARK = '[TEST]';
const N = Number(process.argv[2]) || 50000;
const BATCH = 1000;

const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
const FIRST = ['María', 'Ana', 'Laura', 'Sofía', 'Carmen', 'Lucía', 'Valeria', 'Daniela', 'Paola', 'Andrea', 'Fernanda', 'Gabriela', 'Regina', 'Ximena', 'Mariana'];
const LAST = ['García', 'Hernández', 'López', 'Martínez', 'Rodríguez', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales'];
const SOURCES = ['Instagram', 'Facebook', 'Recomendación', 'Google', 'Paso', 'TikTok'];
const TAGS = ['Nueva', 'Frecuente', 'VIP'];

function clean() {
  return prisma.$transaction(async (tx) => {
    // Borra ventas (e items/pagos) de clientes test, luego los clientes
    const clients = await tx.client.findMany({ where: { name: { startsWith: MARK } }, select: { id: true } });
    const ids = clients.map(c => c.id);
    if (!ids.length) return 0;
    const sales = await tx.sale.findMany({ where: { clientId: { in: ids } }, select: { id: true } });
    const saleIds = sales.map(s => s.id);
    if (saleIds.length) {
      await tx.salePayment.deleteMany({ where: { saleId: { in: saleIds } } });
      await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      await tx.sale.deleteMany({ where: { id: { in: saleIds } } });
    }
    await tx.client.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  }, { timeout: 120000 });
}

async function main() {
  if (process.argv.includes('--clean')) {
    const t = Date.now();
    const n = await clean();
    console.log(`🧹 Limpieza: ${n} clientes [TEST] (y sus ventas) borrados en ${((Date.now() - t) / 1000).toFixed(1)}s`);
    return;
  }

  const cashier = await prisma.staff.findFirst();
  if (!cashier) { console.error('No hay staff. Corre el seed primero.'); return; }

  console.log(`⚙️  Generando ${N.toLocaleString()} clientes [TEST] + ventas (lotes de ${BATCH})...`);
  const tStart = Date.now();
  let totalSales = 0;

  for (let off = 0; off < N; off += BATCH) {
    const size = Math.min(BATCH, N - off);
    const clientsData = [];
    for (let i = 0; i < size; i++) {
      const idx = off + i;
      const daysAgo = Math.floor(Math.random() * 730); // hasta 2 años
      const created = new Date(); created.setDate(created.getDate() - daysAgo);
      clientsData.push({
        name: `${MARK} ${rnd(FIRST)} ${rnd(LAST)} ${idx}`,
        phone: '55' + String(10000000 + idx).slice(-8),
        email: `test${idx}@example.com`,
        tag: rnd(TAGS), source: rnd(SOURCES),
        points: Math.floor(Math.random() * 4000),
        createdAt: created,
        birth: new Date(1980 + Math.floor(Math.random() * 25), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)),
      });
    }
    await prisma.client.createMany({ data: clientsData });

    // Recupera ids del lote para crear ventas
    const created = await prisma.client.findMany({
      where: { name: { startsWith: MARK } }, orderBy: { createdAt: 'desc' }, take: size, select: { id: true },
    });
    const salesData = [];
    for (const c of created) {
      const nSales = Math.floor(Math.random() * 4); // 0-3 ventas por cliente
      for (let s = 0; s < nSales; s++) {
        const total = 200 + Math.floor(Math.random() * 1800);
        const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * 700));
        salesData.push({ clientId: c.id, cashierId: cashier.id, subtotal: total, total, date: d, paymentMethod: 'efectivo' });
      }
    }
    if (salesData.length) { await prisma.sale.createMany({ data: salesData }); totalSales += salesData.length; }

    if ((off / BATCH) % 10 === 0) process.stdout.write(`  ${off + size}/${N}\r`);
  }

  const secs = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`\n✅ Insertados ${N.toLocaleString()} clientes + ${totalSales.toLocaleString()} ventas en ${secs}s`);

  // ---- Benchmarks de consultas ----
  console.log('\n📊 Tiempos de consulta con la base cargada:');
  const time = async (label, fn) => { const t = Date.now(); const r = await fn(); console.log(`  ${label}: ${Date.now() - t}ms`, r !== undefined ? `(${r})` : ''); };

  await time('Conteo total de clientes', async () => (await prisma.client.count()).toLocaleString());
  await time('Listar 50 clientes (orden alfabético)', async () => (await prisma.client.findMany({ orderBy: { name: 'asc' }, take: 50 })).length + ' filas');
  await time('Buscar por nombre "Sofía"', async () => (await prisma.client.findMany({ where: { name: { contains: 'Sofía', mode: 'insensitive' } }, take: 50 })).length + ' resultados');
  await time('Conteo total de ventas', async () => (await prisma.sale.count()).toLocaleString());
  await time('Suma de ventas (ingresos histórico)', async () => '$' + ((await prisma.sale.aggregate({ _sum: { total: true } }))._sum.total || 0).toLocaleString());
  await time('Top 10 clientes por gasto', async () => (await prisma.sale.groupBy({ by: ['clientId'], _sum: { total: true }, orderBy: { _sum: { total: 'desc' } }, take: 10 })).length + ' filas');

  console.log('\nℹ️  Para borrar estos datos:  node scripts/loadtest.js --clean');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

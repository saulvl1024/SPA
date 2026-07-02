// LIMPIA todos los datos de prueba y REINYECTA un set limpio y coherente.
// CONSERVA: Staff (empleados/logins) y SystemConfig.
// Uso:  node scripts/reset-demo.js
//
// ⚠️ Borra clientes, ventas, productos, cotizaciones, tratos, citas, etc.
//    No toca tus usuarios ni la configuración del sistema.
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const rand = a => a[Math.floor(Math.random() * a.length)];
const ri = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;
const daysAgo = d => { const x = new Date(); x.setDate(x.getDate() - d); return x; };
const daysAhead = d => { const x = new Date(); x.setDate(x.getDate() + d); return x; };
let bc = 7501000000000; const barcode = () => String(++bc);

async function wipe() {
  console.log('🧹 Limpiando datos de prueba...');
  // Orden: hijos antes que padres (respeta llaves foráneas)
  const order = [
    'saleItem', 'salePayment', 'sale',
    'quoteItem', 'quote', 'priceListItem', 'priceList',
    'tableOrderItem', 'tableOrder', 'table',
    'dealActivity', 'deal',
    'appointment', 'clientPackage', 'package',
    'clinicalNote', 'clinicalRecord', 'followUp',
    'purchaseItem', 'purchase', 'supplier',
    'serviceSupply', 'productComponent', 'productVariant', 'product', 'supply', 'service',
    'expense', 'promotion', 'tag', 'auditLog',
    'cashSession',
    'client',
  ];
  for (const m of order) {
    try { const r = await prisma[m].deleteMany({}); if (r.count) console.log(`   · ${m}: ${r.count} borrados`); }
    catch (e) { console.log(`   (omitido ${m}: ${e.message.split('\n')[0]})`); }
  }
}

async function seed() {
  console.log('\n🌱 Inyectando datos nuevos...');
  const staff = await prisma.staff.findMany({ where: { active: true }, select: { id: true } });
  if (!staff.length) { console.error('No hay empleados. Crea al menos uno antes de sembrar.'); process.exit(1); }

  // ---- Servicios ----
  const SERVICIOS = [
    ['Corte de cabello', 180], ['Tinte', 650], ['Manicure', 220], ['Pedicure', 260],
    ['Facial hidratante', 480], ['Masaje relajante', 600], ['Depilación', 350], ['Maquillaje', 550],
  ];
  const services = [];
  for (const [name, price] of SERVICIOS) {
    try { services.push(await prisma.service.create({ data: { name, price } })); }
    catch (e) { console.log('   (servicio error:', e.message.split('\n')[0], ')'); }
  }
  console.log(`   · Servicios: ${services.length}`);
  if (!services.length) console.log('   ⚠ Sin servicios — revisa el error de arriba.');

  // ---- Productos simples ----
  const SIMPLE = [
    ['Shampoo Hidratante 500ml', 189, 40], ['Acondicionador 500ml', 199, 35], ['Mascarilla Capilar', 249, 22],
    ['Aceite de Argán 60ml', 320, 18], ['Crema Facial Antiedad', 450, 15], ['Protector Solar SPF50', 280, 30],
    ['Gel Limpiador 200ml', 175, 28], ['Sérum Vitamina C', 390, 20], ['Exfoliante Corporal', 220, 16],
    ['Bálsamo Labial', 65, 60],
  ];
  const products = [];
  for (const [name, price, stock] of SIMPLE) {
    products.push(await prisma.product.create({ data: { name, price, stock, minStock: ri(4, 10), cost: Math.round(price * 0.5), barcode: barcode() } }));
  }
  // ---- Productos con variantes ----
  const VARS = [
    ['Esmalte de Uñas', 89, ['Rojo Clásico', 'Rosa Nude', 'Negro Mate', 'Francés']],
    ['Bata de Spa', 520, ['Talla S', 'Talla M', 'Talla L', 'Talla XL']],
    ['Té Relajante', 120, ['Manzanilla', 'Lavanda', 'Menta']],
  ];
  for (const [name, price, variants] of VARS) {
    const p = await prisma.product.create({ data: { name, price, stock: 0, minStock: 4, cost: Math.round(price * 0.45), barcode: barcode() } });
    products.push(p);
    for (const v of variants) await prisma.productVariant.create({ data: { productId: p.id, name: v, stock: ri(4, 20), sku: barcode() } });
  }
  console.log(`   · Productos: ${products.length} (con variantes y código de barras)`);

  // ---- Paquetes ----
  const PKGS = [['Faciales x5', 5, 1800], ['Masajes x10', 10, 3500], ['Mani+Pedi x4', 4, 1200], ['Depilación x6', 6, 4200]];
  for (const [name, sessions, price] of PKGS) await prisma.package.create({ data: { name, sessions, price, validityMonths: ri(3, 8) } });
  console.log(`   · Paquetes: ${PKGS.length}`);

  // ---- Clientes (cantidad razonable) ----
  const NOMBRES = ['María', 'José', 'Ana', 'Luis', 'Carmen', 'Jorge', 'Laura', 'Miguel', 'Sofía', 'Pedro', 'Elena', 'Raúl', 'Patricia', 'Andrés', 'Lucía', 'Diego', 'Valeria', 'Fernando', 'Gabriela', 'Roberto'];
  const APE = ['García', 'Martínez', 'López', 'Hernández', 'Rodríguez', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz', 'Morales'];
  const ORIG = ['Recomendación', 'Redes sociales', 'Google', 'Paso por el local', 'Promoción'];
  const clients = [];
  for (let i = 0; i < 120; i++) {
    try {
      const name = `${rand(NOMBRES)} ${rand(APE)}`;
      const sellerId = staff[i % staff.length].id;
      clients.push(await prisma.client.create({
        data: {
          name, phone: '55' + ri(10000000, 99999999),
          email: Math.random() > 0.5 ? `cliente${i}_${Date.now()}@ejemplo.com` : null,
          source: rand(ORIG), sellerId,
          birth: Math.random() > 0.4 ? daysAgo(ri(7000, 18000)) : null,
          createdAt: daysAgo(ri(0, 365)),
        },
      }));
    } catch (e) { if (i === 0) console.log('   (cliente error:', e.message.split('\n')[0], ')'); }
  }
  console.log(`   · Clientes: ${clients.length} (con cartera asignada a vendedores)`);
  if (!clients.length) { console.error('No se crearon clientes; abortando ventas/cotizaciones.'); return; }

  // ---- Ventas (POS) — clientId es OBLIGATORIO, siempre asignamos un cliente ----
  let nSales = 0, saleErr = '';
  for (let i = 0; i < 200; i++) {
    try {
      const client = rand(clients); // siempre hay cliente (requerido por el modelo)
      const date = daysAgo(ri(0, 90));
      const items = [];
      let total = 0;
      for (let j = 0; j < ri(1, 4); j++) {
        const useSvc = Math.random() > 0.5;
        const it = useSvc ? rand(services) : rand(products);
        const qty = ri(1, 3);
        total += it.price * qty;
        items.push({ type: useSvc ? 'servicio' : 'producto', refId: it.id, name: it.name, qty, price: it.price, specialistId: useSvc ? rand(staff).id : null });
      }
      await prisma.sale.create({
        data: {
          clientId: client.id, date, total, subtotal: total, discount: 0,
          cashierId: rand(staff).id,
          paymentMethod: rand(['efectivo', 'tarjeta', 'transferencia']),
          items: { create: items },
          payments: { create: [{ method: rand(['efectivo', 'tarjeta', 'transferencia']), amount: total }] },
        },
      });
      nSales++;
    } catch (e) { saleErr = e.message.split('\n')[0]; }
  }
  console.log(`   · Ventas: ${nSales}${saleErr ? ' (algunas fallaron: ' + saleErr + ')' : ''}`);

  // ---- Cotizaciones (Ventas) ----
  const STATUS = ['borrador', 'enviada', 'enviada', 'aceptada', 'aceptada', 'rechazada', 'vencida', 'convertida'];
  let nQuotes = 0, qErr = '';
  for (let i = 0; i < 30; i++) {
    try {
      const status = rand(STATUS); const seller = rand(staff);
      const client = Math.random() > 0.2 ? rand(clients) : null;
      const lines = []; let subtotal = 0;
      for (let j = 0; j < ri(1, 5); j++) {
        const p = rand(products); const qty = ri(1, 15); const d = Math.random() > 0.7 ? ri(5, 20) : 0;
        subtotal += p.price * qty * (1 - d / 100);
        lines.push({ type: 'producto', refId: p.id, name: p.name, qty, price: p.price, discount: d });
      }
      const taxRate = Math.random() > 0.4 ? 16 : 0;
      const disc = Math.random() > 0.7 ? ri(100, 600) : 0;
      const base = Math.max(0, subtotal - disc); const tax = base * taxRate / 100;
      await prisma.quote.create({
        data: {
          clientId: client?.id || null, clientName: client ? null : `Prospecto ${i + 1}`,
          sellerId: seller.id, status, subtotal, discount: disc, taxRate, tax, total: base + tax,
          validUntil: status === 'vencida' ? daysAgo(ri(1, 10)) : daysAhead(ri(5, 30)),
          createdAt: daysAgo(ri(0, 60)), items: { create: lines },
        },
      });
      nQuotes++;
    } catch (e) { qErr = e.message.split('\n')[0]; }
  }
  console.log(`   · Cotizaciones: ${nQuotes}${qErr ? ' (algunas fallaron: ' + qErr + ')' : ''}`);

  // ---- Listas de precios ----
  let nLists = 0;
  for (const [name, isDefault, factor] of [['Menudeo', true, 1], ['Mayoreo', false, 0.85], ['Distribuidor', false, 0.72]]) {
    try {
      const list = await prisma.priceList.create({ data: { name, isDefault } });
      for (const p of products.slice(0, 12)) await prisma.priceListItem.create({ data: { listId: list.id, productId: p.id, price: Math.round(p.price * factor) } });
      nLists++;
    } catch (e) { console.log('   (lista', name, 'error:', e.message.split('\n')[0], ')'); }
  }
  console.log(`   · Listas de precios: ${nLists}`);

  // ---- Tratos (embudo) — crea las etapas si no existen ----
  const DEFAULT_STAGES = [
    { name: 'Prospecto', order: 0 }, { name: 'Contactado', order: 1 }, { name: 'Propuesta', order: 2 },
    { name: 'Negociación', order: 3 }, { name: 'Ganado', order: 4, isWon: true }, { name: 'Perdido', order: 5, isLost: true },
  ];
  let stages = await prisma.dealStage.findMany({ orderBy: { order: 'asc' } });
  if (!stages.length) {
    for (const s of DEFAULT_STAGES) await prisma.dealStage.create({ data: s });
    stages = await prisma.dealStage.findMany({ orderBy: { order: 'asc' } });
    console.log(`   · Etapas del embudo: ${stages.length} creadas`);
  }
  let nDeals = 0, dErr = '';
  const TITULOS = ['Venta corporativa', 'Suministro mensual', 'Contrato anual', 'Pedido mayoreo', 'Evento especial', 'Renovación'];
  for (let i = 0; i < 40; i++) {
    try {
      const stage = rand(stages); const cli = Math.random() > 0.25 ? rand(clients) : null;
      await prisma.deal.create({
        data: {
          title: `${rand(TITULOS)} #${i + 1}`, amount: ri(1, 60) * 2500,
          clientId: cli?.id || null, contactName: cli ? null : `Contacto ${i + 1}`,
          stageId: stage.id, order: Date.now() - i * 1000, ownerId: rand(staff).id,
          createdAt: daysAgo(ri(0, 45)),
        },
      });
      nDeals++;
    } catch (e) { dErr = e.message.split('\n')[0]; }
  }
  console.log(`   · Tratos: ${nDeals}${dErr ? ' (algunas fallaron: ' + dErr + ')' : ''}`);
}

async function main() {
  await wipe();
  await seed();
  console.log('\n✅ Listo. Recarga el sistema (Ctrl+F5).');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

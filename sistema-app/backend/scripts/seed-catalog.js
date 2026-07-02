// Genera datos de prueba: productos (con código de barras), variantes y paquetes.
// Uso:  node scripts/seed-catalog.js
// Es idempotente por nombre: si ya existe un producto/paquete con ese nombre, lo omite.
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// Genera un código de barras EAN-13 ficticio pero con formato realista
let barcodeSeed = 7501000000000;
const nextBarcode = () => String(++barcodeSeed);

// ---- Productos simples (sin variantes) ----
const SIMPLE = [
  { name: 'Shampoo Hidratante 500ml', price: 189, stock: 40, minStock: 8, cost: 95 },
  { name: 'Acondicionador Nutritivo 500ml', price: 199, stock: 35, minStock: 8, cost: 100 },
  { name: 'Mascarilla Capilar 250ml', price: 249, stock: 22, minStock: 5, cost: 120 },
  { name: 'Aceite de Argán 60ml', price: 320, stock: 18, minStock: 4, cost: 150 },
  { name: 'Crema Facial Antiedad 50ml', price: 450, stock: 15, minStock: 4, cost: 210 },
  { name: 'Protector Solar SPF50', price: 280, stock: 30, minStock: 6, cost: 130 },
  { name: 'Gel Limpiador Facial 200ml', price: 175, stock: 28, minStock: 6, cost: 80 },
  { name: 'Sérum Vitamina C 30ml', price: 390, stock: 20, minStock: 5, cost: 180 },
  { name: 'Exfoliante Corporal 300ml', price: 220, stock: 16, minStock: 4, cost: 105 },
  { name: 'Bálsamo Labial', price: 65, stock: 60, minStock: 12, cost: 25 },
];

// ---- Productos CON variantes (talla/color/sabor) ----
const WITH_VARIANTS = [
  {
    name: 'Esmalte de Uñas', price: 89, stock: 0, minStock: 4, cost: 35,
    variants: [
      { name: 'Rojo Clásico', stock: 14 },
      { name: 'Rosa Nude', stock: 18 },
      { name: 'Negro Mate', stock: 10 },
      { name: 'Francés', stock: 12, price: 99 },
    ],
  },
  {
    name: 'Bata de Spa', price: 520, stock: 0, minStock: 2, cost: 240,
    variants: [
      { name: 'Talla S', stock: 6 },
      { name: 'Talla M', stock: 8 },
      { name: 'Talla L', stock: 5 },
      { name: 'Talla XL', stock: 3, price: 560 },
    ],
  },
  {
    name: 'Té Relajante', price: 120, stock: 0, minStock: 5, cost: 50,
    variants: [
      { name: 'Manzanilla', stock: 20 },
      { name: 'Lavanda', stock: 16 },
      { name: 'Menta', stock: 14 },
    ],
  },
];

// ---- Paquetes (sesiones) ----
const PACKAGES = [
  { name: 'Faciales x5', sessions: 5, price: 1800, validityMonths: 4 },
  { name: 'Masajes Relajantes x10', sessions: 10, price: 3500, validityMonths: 6 },
  { name: 'Manicure + Pedicure x4', sessions: 4, price: 1200, validityMonths: 3 },
  { name: 'Depilación Láser x6', sessions: 6, price: 4200, validityMonths: 8 },
];

async function main() {
  console.log('Sembrando catálogo de prueba…');
  let nProd = 0, nVar = 0, nPkg = 0;

  // Productos simples
  for (const p of SIMPLE) {
    const exists = await prisma.product.findFirst({ where: { name: p.name } });
    if (exists) continue;
    await prisma.product.create({ data: { ...p, barcode: nextBarcode() } });
    nProd++;
  }

  // Productos con variantes
  for (const p of WITH_VARIANTS) {
    let prod = await prisma.product.findFirst({ where: { name: p.name } });
    if (!prod) {
      const { variants, ...base } = p;
      prod = await prisma.product.create({ data: { ...base, barcode: nextBarcode() } });
      nProd++;
      for (const v of variants) {
        await prisma.productVariant.create({
          data: { productId: prod.id, name: v.name, stock: v.stock ?? 0, price: v.price ?? null, sku: nextBarcode() },
        });
        nVar++;
      }
    }
  }

  // Paquetes
  for (const pk of PACKAGES) {
    const exists = await prisma.package.findFirst({ where: { name: pk.name } });
    if (exists) continue;
    await prisma.package.create({ data: pk });
    nPkg++;
  }

  console.log(`✓ Listo: ${nProd} producto(s), ${nVar} variante(s), ${nPkg} paquete(s).`);
  console.log('  Los productos traen código de barras (formato EAN) para probar el escáner del POS.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

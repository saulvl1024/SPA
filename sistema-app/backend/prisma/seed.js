import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

const hash = (pin) => bcrypt.hashSync(pin, 8);
const addMonths = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d; };

async function main() {
  console.log('Sembrando datos...');

  // Staff: correo + contraseña (login del sistema) y PIN (para el POS)
  const admin = await prisma.staff.create({ data: { name: 'Saúl Valdez', email: 'admin@seren.com', passwordHash: hash('admin123'), pinHash: hash('1111'), role: 'admin' } });
  const karla = await prisma.staff.create({ data: { name: 'Karla Núñez', email: 'karla@seren.com', passwordHash: hash('karla123'), pinHash: hash('2222'), role: 'empleada' } });
  const lucia = await prisma.staff.create({ data: { name: 'Lucía Rivera', email: 'lucia@seren.com', passwordHash: hash('lucia123'), pinHash: hash('3333'), role: 'empleada', specialty: 'Faciales', commissionRate: 0.12 } });
  const daniela = await prisma.staff.create({ data: { name: 'Daniela Mora', email: 'daniela@seren.com', passwordHash: hash('daniela123'), pinHash: hash('4444'), role: 'empleada', specialty: 'Masajes', commissionRate: 0.12 } });

  // Insumos
  const su1 = await prisma.supply.create({ data: { name: 'Mascarilla hidratante', category: 'Facial', unit: 'pza', stock: 3, minStock: 10 } });
  const su2 = await prisma.supply.create({ data: { name: 'Sérum vitamina C', category: 'Facial', unit: 'ml', stock: 120, minStock: 200 } });
  const su3 = await prisma.supply.create({ data: { name: 'Aceite de almendras', category: 'Masaje', unit: 'ml', stock: 380, minStock: 500 } });

  // Servicios con receta
  const facial = await prisma.service.create({ data: { name: 'Facial hidratante', price: 850, durationMin: 60,
    recipe: { create: [{ supplyId: su1.id, qty: 1 }, { supplyId: su2.id, qty: 30 }] } } });
  const masaje = await prisma.service.create({ data: { name: 'Masaje relajante', price: 750, durationMin: 60,
    recipe: { create: [{ supplyId: su3.id, qty: 40 }] } } });
  await prisma.service.create({ data: { name: 'Radiofrecuencia', price: 1200, durationMin: 45 } });

  // Productos
  await prisma.product.createMany({ data: [
    { name: 'Sérum vitamina C (retail)', price: 620, stock: 18, minStock: 6 },
    { name: 'Crema hidratante', price: 480, stock: 24, minStock: 8 },
  ]});

  // Paquetes
  await prisma.package.createMany({ data: [
    { name: 'Esencial', sessions: 2, price: 1600, validityMonths: 2 },
    { name: 'Equilibrio', sessions: 4, price: 2880, validityMonths: 4 },
    { name: 'Transformación', sessions: 6, price: 4080, validityMonths: 6 },
  ]});

  // Clientes
  const mariana = await prisma.client.create({ data: {
    name: 'Mariana García', phone: '55 1234 5678', tag: 'VIP', skin: 'Mixta · sensible', points: 2180,
    record: { create: { allergies: 'Alérgica al ácido glicólico.' } },
  }});
  await prisma.client.create({ data: { name: 'Paola Ramírez', phone: '55 2345 6789', tag: 'Frecuente', points: 1540, record: { create: {} } } });
  await prisma.client.create({ data: { name: 'Andrea Méndez', phone: '55 3456 7890', tag: 'Nueva', points: 320, record: { create: {} } } });

  // Cita de hoy
  const today = new Date(); today.setHours(10, 0, 0, 0);
  await prisma.appointment.create({ data: { clientId: mariana.id, staffId: lucia.id, serviceId: facial.id, start: today, status: 'confirmada' } });

  console.log('Listo. PINs: Admin 1111 · Karla 2222 · Lucía 3333 · Daniela 4444');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

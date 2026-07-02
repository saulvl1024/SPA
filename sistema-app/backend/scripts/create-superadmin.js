// Crea (o restablece) el usuario SÚPER-ADMIN, el dueño del ERP.
// Su contraseña inicial es la SUPERADMIN_KEY del .env (cámbiala después desde el sistema).
// Uso: node scripts/create-superadmin.js [correo]
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

const email = (process.argv[2] || 'proveedor@erp.com').trim().toLowerCase();
const pass = process.env.SUPERADMIN_KEY;

if (!pass || pass.length < 6) {
  console.error('Define SUPERADMIN_KEY en el .env (mínimo 6 caracteres) antes de crear el súper-admin.');
  process.exit(1);
}

const hash = bcrypt.hashSync(pass, 8);
const existing = await prisma.staff.findFirst({ where: { role: 'superadmin' } });

if (existing) {
  await prisma.staff.update({ where: { id: existing.id }, data: { email, passwordHash: hash, active: true } });
  console.log(`\n✅ Súper-admin actualizado.\n   Correo: ${email}\n   Contraseña: (tu SUPERADMIN_KEY del .env)\n`);
} else {
  await prisma.staff.create({ data: { name: 'Proveedor ERP', email, passwordHash: hash, role: 'superadmin' } });
  console.log(`\n✅ Súper-admin creado.\n   Correo: ${email}\n   Contraseña: (tu SUPERADMIN_KEY del .env)\n`);
}
console.log('Inicia sesión con esas credenciales para ver el panel de Configuración del sistema.\n');
await prisma.$disconnect();

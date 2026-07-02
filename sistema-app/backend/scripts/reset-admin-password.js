// Restablece la contraseña de TODOS los usuarios admin a la que indiques.
// Uso: node scripts/reset-admin-password.js <nueva_contraseña>
// Ejemplo: node scripts/reset-admin-password.js admin123
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

const newPass = process.argv[2] || 'admin123';
if (newPass.length < 6) { console.error('La contraseña debe tener al menos 6 caracteres.'); process.exit(1); }

const admins = await prisma.staff.findMany({ where: { role: 'admin' }, select: { id: true, name: true, email: true } });
if (!admins.length) { console.log('No hay usuarios admin.'); await prisma.$disconnect(); process.exit(0); }

const hash = bcrypt.hashSync(newPass, 8);
await prisma.staff.updateMany({ where: { role: 'admin' }, data: { passwordHash: hash } });

console.log(`\n✅ Contraseña actualizada a "${newPass}" para estos admin:\n`);
admins.forEach(a => console.log(`   ${a.name}  →  correo: ${a.email || '(sin correo)'}`));
console.log('\nInicia sesión con el correo de arriba y la contraseña que pusiste.\n');
await prisma.$disconnect();

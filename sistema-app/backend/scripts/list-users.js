// Lista los usuarios del sistema (sin exponer contraseñas).
// Uso: node scripts/list-users.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const staff = await prisma.staff.findMany({
  select: { name: true, email: true, role: true, active: true, passwordHash: true, pinHash: true },
  orderBy: [{ role: 'asc' }, { name: 'asc' }],
});
console.log('\nUsuarios en la base de datos:\n');
console.table(staff.map(s => ({
  nombre: s.name,
  correo: s.email || '(sin correo)',
  rol: s.role,
  activo: s.active,
  tiene_contraseña: !!s.passwordHash,
  tiene_pin: !!s.pinHash,
})));
await prisma.$disconnect();

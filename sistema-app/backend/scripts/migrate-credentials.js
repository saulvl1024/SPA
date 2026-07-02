// Asigna correo + contraseña temporal a los empleados que aún no tengan (migración del login PIN → contraseña).
// No toca a quien ya tenga email/contraseña. Imprime las credenciales temporales para que las repartas.
// Uso: node scripts/migrate-credentials.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

const slug = n => (n || 'usuario').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'usuario';

async function main() {
  const staff = await prisma.staff.findMany();
  const creds = [];
  for (const s of staff) {
    if (s.email && s.passwordHash) continue; // ya tiene credenciales
    // correo único derivado del nombre
    let base = slug(s.name), email = `${base}@negocio.com`, i = 1;
    while (await prisma.staff.findFirst({ where: { email, NOT: { id: s.id } } })) email = `${base}${i++}@negocio.com`;
    const tempPass = base + Math.floor(1000 + Math.random() * 9000); // ej. saul1234
    await prisma.staff.update({ where: { id: s.id }, data: { email: s.email || email, passwordHash: bcrypt.hashSync(tempPass, 8) } });
    creds.push({ nombre: s.name, correo: s.email || email, contraseña_temporal: tempPass, rol: s.role });
  }
  if (!creds.length) { console.log('✅ Todos los usuarios ya tienen credenciales.'); return; }
  console.log('\n✅ Credenciales temporales asignadas (compártelas y pide cambiarlas):\n');
  console.table(creds);
  console.log('\nℹ️  Inicia sesión con el correo y la contraseña temporal. El PIN sigue sirviendo para el POS.');
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

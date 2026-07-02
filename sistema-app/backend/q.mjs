import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  const n = await p.auditLog.count();
  console.log('AuditLog filas:', n);
  const last = await p.auditLog.findMany({ take: 5, orderBy: { date: 'desc' } });
  last.forEach(l => console.log(' -', l.date.toISOString(), l.actorName, l.module, l.action, '::', l.summary));
} catch (e) { console.log('ERROR consultando AuditLog:', e.message); }
await p.$disconnect();

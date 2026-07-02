// Genera muchos tratos de prueba para ver el comportamiento del embudo.
// Uso:  node scripts/seed-deals.js [cantidad]   (por defecto 60)
//       node scripts/seed-deals.js 120
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const N = Math.max(1, Math.min(Number(process.argv[2]) || 60, 1000)); // tope de seguridad

const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = d => { const x = new Date(); x.setDate(x.getDate() - d); return x; };

// Plantillas de títulos para que se vean realistas en varios giros
const TITULOS = [
  'Venta de paquete corporativo', 'Suministro mensual de insumos', 'Contrato de servicio anual',
  'Pedido mayoreo temporada', 'Renovación de membresía', 'Cotización equipo nuevo',
  'Proyecto de remodelación', 'Plan de mantenimiento', 'Compra de 10 toneladas',
  'Evento empresarial', 'Distribución regional', 'Paquete de tratamientos',
  'Licencia de software', 'Servicio de catering', 'Abasto trimestral',
];

async function main() {
  console.log(`Generando ${N} tratos de prueba...`);

  const [stages, clients, staff] = await Promise.all([
    prisma.dealStage.findMany({ orderBy: { order: 'asc' } }),
    prisma.client.findMany({ select: { id: true, name: true } }),
    prisma.staff.findMany({ where: { active: true }, select: { id: true } }),
  ]);

  if (!stages.length) { console.error('No hay etapas (DealStage). Abre el módulo Embudo una vez para crearlas.'); process.exit(1); }
  console.log(`Etapas: ${stages.length} · Clientes: ${clients.length} · Vendedores: ${staff.length}`);

  const rows = [];
  for (let i = 0; i < N; i++) {
    const stage = rand(stages);
    const cli = clients.length && Math.random() > 0.25 ? rand(clients) : null; // 75% con cliente
    const created = daysAgo(randInt(0, 45)); // creados en los últimos 45 días
    const isClosed = stage.isWon || stage.isLost;
    rows.push({
      title: `${rand(TITULOS)} #${i + 1}`,
      amount: randInt(1, 80) * 2500,          // $2,500 .. $200,000
      clientId: cli?.id || null,
      contactName: cli ? null : `Contacto ${i + 1}`,
      stageId: stage.id,
      order: Date.now() - i * 1000,
      ownerId: staff.length ? rand(staff).id : null,
      notes: Math.random() > 0.5 ? 'Trato de prueba generado automáticamente.' : null,
      createdAt: created,
      closedAt: isClosed ? daysAgo(randInt(0, 10)) : null,
    });
  }

  // Inserta en lote
  const res = await prisma.deal.createMany({ data: rows });
  console.log(`✓ Listo: ${res.count} tratos creados, repartidos entre ${stages.length} etapas.`);

  // Resumen por etapa
  const counts = await prisma.deal.groupBy({ by: ['stageId'], _count: { _all: true } });
  const nameOf = id => stages.find(s => s.id === id)?.name || id;
  counts.forEach(c => console.log(`   · ${nameOf(c.stageId)}: ${c._count._all}`));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const N = Math.max(1, Math.min(Number(process.argv[2]) || 60, 1000));
const rand = a => a[Math.floor(Math.random()*a.length)];
const ri = (mn,mx) => Math.floor(Math.random()*(mx-mn+1))+mn;
const daysAgo = d => { const x=new Date(); x.setDate(x.getDate()-d); return x; };
const TITULOS = ['Venta de paquete corporativo','Suministro mensual de insumos','Contrato de servicio anual','Pedido mayoreo temporada','Renovación de membresía','Cotización equipo nuevo','Proyecto de remodelación','Plan de mantenimiento','Compra de 10 toneladas','Evento empresarial','Distribución regional','Paquete de tratamientos','Licencia de software','Servicio de catering','Abasto trimestral'];
async function main(){
  console.log(`Generando ${N} tratos...`);
  const [stages, clients, staff] = await Promise.all([
    prisma.dealStage.findMany({ orderBy:{order:'asc'} }),
    prisma.client.findMany({ select:{id:true} }),
    prisma.staff.findMany({ where:{active:true}, select:{id:true} }),
  ]);
  if(!stages.length){ console.error('No hay etapas. Abre el Embudo una vez para crearlas.'); process.exit(1); }
  console.log(`Etapas:${stages.length} Clientes:${clients.length} Vendedores:${staff.length}`);
  const rows=[];
  for(let i=0;i<N;i++){
    const stage=rand(stages);
    const cli = clients.length && Math.random()>0.25 ? rand(clients):null;
    const isClosed = stage.isWon || stage.isLost;
    rows.push({ title:`${rand(TITULOS)} #${i+1}`, amount: ri(1,80)*2500, clientId: cli?.id||null,
      contactName: cli?null:`Contacto ${i+1}`, stageId: stage.id, order: Date.now()-i*1000,
      ownerId: staff.length?rand(staff).id:null, notes: Math.random()>0.5?'Trato de prueba.':null,
      createdAt: daysAgo(ri(0,45)), closedAt: isClosed?daysAgo(ri(0,10)):null });
  }
  const res = await prisma.deal.createMany({ data: rows });
  console.log(`OK: ${res.count} tratos creados.`);
  const counts = await prisma.deal.groupBy({ by:['stageId'], _count:{_all:true} });
  const nm = id => stages.find(s=>s.id===id)?.name||id;
  counts.forEach(c=>console.log(`  · ${nm(c.stageId)}: ${c._count._all}`));
}
main().catch(e=>{console.error(e.message);process.exit(1);}).finally(()=>prisma.$disconnect());

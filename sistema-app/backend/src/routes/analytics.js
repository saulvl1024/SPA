import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';

const r = Router();
r.use(auth, requirePerm('finanzas'));

function dayRange(from, to) {
  const [fy, fm, fd] = (from || '').split('-').map(Number);
  const [ty, tm, td] = (to || '').split('-').map(Number);
  const start = from ? new Date(fy, fm - 1, fd, 0, 0, 0, 0) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = to ? new Date(ty, tm - 1, td, 23, 59, 59, 999) : new Date();
  return { start, end };
}

async function metrics(start, end) {
  const sales = await prisma.sale.findMany({
    where: { date: { gte: start, lte: end } },
    include: { items: true, client: true },
  });
  const expenses = await prisma.expense.findMany({ where: { date: { gte: start, lte: end } } });
  const purchases = await prisma.purchase.findMany({ where: { date: { gte: start, lte: end } }, select: { total: true } });

  const ingresos = sales.reduce((a, s) => a + s.total, 0);
  const gastos = expenses.reduce((a, e) => a + e.amount, 0);
  // Total invertido en inventario en el periodo (INFORMATIVO: no afecta la utilidad, eso va por costo de ventas)
  const comprasTotal = purchases.reduce((a, p) => a + (p.total || 0), 0);

  // COSTO DE VENTAS (COGS): productos vendidos a su costo + insumos consumidos por servicios (según receta)
  const products = await prisma.product.findMany({ select: { id: true, cost: true } });
  const supplies = await prisma.supply.findMany({ select: { id: true, cost: true } });
  const recipes = await prisma.serviceSupply.findMany();
  const prodCost = Object.fromEntries(products.map(p => [p.id, p.cost || 0]));
  const supCost = Object.fromEntries(supplies.map(s => [s.id, s.cost || 0]));
  const recipeBy = {};
  recipes.forEach(rs => { (recipeBy[rs.serviceId] = recipeBy[rs.serviceId] || []).push(rs); });
  let costoVentas = 0;
  sales.forEach(s => s.items.forEach(i => {
    if (i.type === 'producto' && i.refId) costoVentas += (prodCost[i.refId] || 0) * (i.qty || 1);
    if (i.type === 'servicio' && i.refId) (recipeBy[i.refId] || []).forEach(rs => { costoVentas += (supCost[rs.supplyId] || 0) * rs.qty * (i.qty || 1); });
  }));

  // Utilidad real = ingresos − costo de ventas − gastos
  const utilidad = ingresos - costoVentas - gastos;
  const tickets = sales.length;
  const ticketProm = tickets ? ingresos / tickets : 0;

  // Gastos por categoría
  const gastosCat = {};
  expenses.forEach(e => { gastosCat[e.category] = (gastosCat[e.category] || 0) + e.amount; });

  // Ingresos por tipo de ítem
  const ingresoTipo = { servicio: 0, producto: 0, paquete: 0, anticipo: 0 };
  sales.forEach(s => s.items.forEach(i => { ingresoTipo[i.type] = (ingresoTipo[i.type] || 0) + i.price * (i.qty || 1); }));

  // Clientes nuevos vs recurrentes en el periodo (UNA sola consulta: primera venta por cliente)
  const clientIds = [...new Set(sales.map(s => s.clientId))];
  let nuevos = 0;
  if (clientIds.length) {
    const firsts = await prisma.sale.groupBy({
      by: ['clientId'], where: { clientId: { in: clientIds } }, _min: { date: true },
    });
    // Es "nuevo" si su PRIMERA venta histórica cae dentro del periodo
    nuevos = firsts.filter(f => f._min.date && f._min.date >= start).length;
  }
  const recurrentes = clientIds.length - nuevos;

  // Top servicios / productos — con costo y margen real por ítem
  const itemAgg = {};
  sales.forEach(s => s.items.forEach(i => {
    if (i.type === 'servicio' || i.type === 'producto') {
      const k = i.name;
      itemAgg[k] = itemAgg[k] || { name: i.name, type: i.type, qty: 0, total: 0, costo: 0 };
      const u = i.qty || 1;
      itemAgg[k].qty += u;
      itemAgg[k].total += i.price * u;
      // costo unitario: producto = costo del producto; servicio = suma de insumos de su receta
      if (i.type === 'producto' && i.refId) itemAgg[k].costo += (prodCost[i.refId] || 0) * u;
      if (i.type === 'servicio' && i.refId) (recipeBy[i.refId] || []).forEach(rs => { itemAgg[k].costo += (supCost[rs.supplyId] || 0) * rs.qty * u; });
    }
  }));
  const itemsConMargen = Object.values(itemAgg).map(it => {
    const margen = it.total - it.costo;
    return { ...it, margen, margenPct: it.total ? (margen / it.total) * 100 : 0 };
  });
  // Lo más VENDIDO (por ingreso) y lo más RENTABLE (por margen $) — a veces no coinciden
  const topItems = [...itemsConMargen].sort((a, b) => b.total - a.total).slice(0, 8);
  const topRentables = [...itemsConMargen].filter(i => i.margen > 0).sort((a, b) => b.margen - a.margen).slice(0, 8);

  // Top clientes por gasto
  const cliAgg = {};
  sales.forEach(s => { cliAgg[s.clientId] = cliAgg[s.clientId] || { name: s.client?.name, total: 0, visitas: 0 }; cliAgg[s.clientId].total += s.total; cliAgg[s.clientId].visitas++; });
  const topClientes = Object.values(cliAgg).sort((a, b) => b.total - a.total).slice(0, 8);

  // Origen / canal (una sola pasada): acumula ingresos por cliente y su source
  const porCliente = {}; // clientId -> { source, total }
  sales.forEach(s => {
    const e = porCliente[s.clientId] || (porCliente[s.clientId] = { source: s.client?.source || 'Sin registrar', total: 0 });
    e.total += s.total;
  });
  const origenAgg = {};
  Object.values(porCliente).forEach(({ source, total }) => {
    const a = origenAgg[source] || (origenAgg[source] = { source, clientes: 0, ingresos: 0 });
    a.clientes++; a.ingresos += total;
  });

  // Ingresos por día (serie para la gráfica)
  const serie = {};
  sales.forEach(s => { const k = new Date(s.date).toISOString().slice(0, 10); serie[k] = (serie[k] || 0) + s.total; });

  // Heatmap de ventas: día de la semana (0=Dom) × hora del día. Guarda ingreso y nº de tickets.
  const heat = {}; // 'dow-hour' -> { total, count }
  sales.forEach(s => {
    const d = new Date(s.date);
    const key = d.getDay() + '-' + d.getHours();
    const cell = heat[key] || (heat[key] = { total: 0, count: 0 });
    cell.total += s.total; cell.count++;
  });

  return {
    ingresos, gastos, costoVentas, utilidad, comprasTotal, tickets, ticketProm,
    gastosCat, ingresoTipo,
    clientes: clientIds.length, nuevos, recurrentes,
    topItems, topRentables, topClientes,
    origen: Object.values(origenAgg).sort((a, b) => b.ingresos - a.ingresos),
    serie, heat,
  };
}

// Ocupación: citas por día de la semana y por especialista
async function occupancy(start, end) {
  const appts = await prisma.appointment.findMany({
    where: { start: { gte: start, lte: end }, status: { notIn: ['cancelada', 'no_asistio'] } },
    include: { staff: true },
  });
  const byDow = [0, 0, 0, 0, 0, 0, 0];
  const byStaff = {};
  appts.forEach(a => {
    byDow[new Date(a.start).getDay()]++;
    if (a.staff?.specialty) { byStaff[a.staff.id] = byStaff[a.staff.id] || { name: a.staff.name, count: 0 }; byStaff[a.staff.id].count++; }
  });
  return { total: appts.length, byDow, byStaff: Object.values(byStaff).sort((a, b) => b.count - a.count) };
}

// LTV: ingreso promedio total por cliente (histórico). Agregado en la BD, no en memoria.
async function ltv() {
  const grouped = await prisma.sale.groupBy({ by: ['clientId'], _sum: { total: true } });
  const clientes = grouped.length;
  const total = grouped.reduce((a, g) => a + (g._sum.total || 0), 0);
  return { clientes, ltvPromedio: clientes ? total / clientes : 0 };
}

// Punto de equilibrio + proyección de cierre del periodo
function projection(cur, start, end) {
  const DAY = 86400000;
  const now = new Date();
  // días totales del periodo y días ya transcurridos (acotado)
  const totalDays = Math.max(1, Math.round((end - start) / DAY) + 1);
  const cappedEnd = now < end ? now : end;
  const elapsedDays = Math.min(totalDays, Math.max(1, Math.round((cappedEnd - start) / DAY) + 1));
  const enCurso = now >= start && now <= end; // el periodo aún no termina
  const ritmoDia = cur.ingresos / elapsedDays;
  const ingresoProyectado = enCurso ? Math.round(ritmoDia * totalDays) : cur.ingresos;
  // Punto de equilibrio: ingreso necesario para que utilidad = 0.
  // utilidad = ingresos − costoVentas − gastos. costoVentas escala con ventas; gastos son fijos del periodo.
  // margen de contribución = (ingresos − costoVentas) / ingresos
  const margenContrib = cur.ingresos > 0 ? (cur.ingresos - cur.costoVentas) / cur.ingresos : 0;
  const breakEven = margenContrib > 0 ? cur.gastos / margenContrib : 0;
  const breakEvenPct = breakEven > 0 ? Math.min(999, (cur.ingresos / breakEven) * 100) : (cur.gastos === 0 ? 100 : 0);
  const utilidadProyectada = enCurso
    ? Math.round(ingresoProyectado * margenContrib - cur.gastos)
    : cur.utilidad;
  return {
    enCurso, totalDays, elapsedDays, ritmoDia: Math.round(ritmoDia),
    ingresoProyectado, utilidadProyectada,
    breakEven: Math.round(breakEven), breakEvenPct: Math.round(breakEvenPct),
    margenContribPct: Math.round(margenContrib * 100),
    superado: cur.ingresos >= breakEven && breakEven > 0,
  };
}

// Insights automáticos: compara periodo actual vs anterior y detecta lo relevante
function buildInsights(cur, prev, proj) {
  const out = [];
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0));
  const f = n => '$' + Math.round(n).toLocaleString('es-MX');

  // Utilidad / break-even
  if (proj.breakEven > 0) {
    if (proj.superado) out.push({ tone: 'good', icon: 'trophy', title: 'Punto de equilibrio superado', text: `Ya cubriste tus costos y gastos del periodo. Cada venta extra es utilidad.` });
    else out.push({ tone: 'warn', icon: 'target', title: `Vas al ${proj.breakEvenPct}% del punto de equilibrio`, text: `Necesitas ${f(proj.breakEven - cur.ingresos)} más en ventas para no perder.` });
  }
  // Ingresos vs anterior
  const dIng = pct(cur.ingresos, prev.ingresos);
  if (prev.ingresos > 0 && Math.abs(dIng) >= 5)
    out.push({ tone: dIng >= 0 ? 'good' : 'bad', icon: dIng >= 0 ? 'up' : 'down', title: `Ingresos ${dIng >= 0 ? 'subieron' : 'bajaron'} ${Math.abs(dIng)}%`, text: `${f(cur.ingresos)} vs ${f(prev.ingresos)} del periodo anterior.` });
  // Gastos vs anterior (subir gastos es malo)
  const dGas = pct(cur.gastos, prev.gastos);
  if (prev.gastos > 0 && Math.abs(dGas) >= 10)
    out.push({ tone: dGas > 0 ? 'warn' : 'good', icon: dGas > 0 ? 'up' : 'down', title: `Gastos ${dGas > 0 ? 'subieron' : 'bajaron'} ${Math.abs(dGas)}%`, text: `${f(cur.gastos)} vs ${f(prev.gastos)} antes.` });
  // Margen de utilidad
  const margenAct = cur.ingresos > 0 ? Math.round((cur.utilidad / cur.ingresos) * 100) : 0;
  const margenPrev = prev.ingresos > 0 ? Math.round((prev.utilidad / prev.ingresos) * 100) : 0;
  if (prev.ingresos > 0 && Math.abs(margenAct - margenPrev) >= 4)
    out.push({ tone: margenAct >= margenPrev ? 'good' : 'bad', icon: margenAct >= margenPrev ? 'up' : 'down', title: `Margen de utilidad ${margenAct >= margenPrev ? 'mejoró' : 'cayó'} a ${margenAct}%`, text: `Antes era ${margenPrev}%.` });
  // Ticket promedio
  const dTk = pct(cur.ticketProm, prev.ticketProm);
  if (prev.ticketProm > 0 && Math.abs(dTk) >= 8)
    out.push({ tone: dTk >= 0 ? 'good' : 'warn', icon: dTk >= 0 ? 'up' : 'down', title: `Ticket promedio ${dTk >= 0 ? 'subió' : 'bajó'} ${Math.abs(dTk)}%`, text: `Ahora ${f(cur.ticketProm)} por venta.` });
  // Clientes nuevos
  if (cur.nuevos > 0)
    out.push({ tone: 'good', icon: 'user', title: `${cur.nuevos} cliente${cur.nuevos !== 1 ? 's' : ''} nuevo${cur.nuevos !== 1 ? 's' : ''}`, text: `${cur.recurrentes} recurrente${cur.recurrentes !== 1 ? 's' : ''} en el periodo.` });
  // Producto más rentable
  if (cur.topRentables && cur.topRentables[0])
    out.push({ tone: 'good', icon: 'star', title: `Lo más rentable: ${cur.topRentables[0].name}`, text: `Te dejó ${f(cur.topRentables[0].margen)} de margen (${Math.round(cur.topRentables[0].margenPct)}%).` });

  return out.slice(0, 6);
}

r.get('/', async (req, res) => {
  const { start, end } = dayRange(req.query.from, req.query.to);
  // Periodo anterior (misma duración) para comparar
  const ms = end - start;
  const prevEnd = new Date(start - 1);
  const prevStart = new Date(prevEnd - ms);

  const [cur, prev, occ, life] = await Promise.all([
    metrics(start, end), metrics(prevStart, prevEnd), occupancy(start, end), ltv(),
  ]);

  const proj = projection(cur, start, end);
  const insights = buildInsights(cur, prev, proj);

  // Serie comparativa: alinea el periodo anterior por OFFSET de días desde su inicio,
  // para superponerlo sobre el actual día a día.
  const DAY = 86400000;
  const prevSerieByOffset = {};
  Object.entries(prev.serie).forEach(([k, v]) => {
    const [y, m, d] = k.split('-').map(Number);
    const off = Math.round((new Date(y, m - 1, d) - prevStart) / DAY);
    prevSerieByOffset[off] = (prevSerieByOffset[off] || 0) + v;
  });

  res.json({
    range: { from: start, to: end },
    current: cur,
    previous: { ingresos: prev.ingresos, gastos: prev.gastos, utilidad: prev.utilidad, tickets: prev.tickets, clientes: prev.clientes, serie: prev.serie },
    prevSerieByOffset,
    projection: proj,
    insights,
    occupancy: occ,
    ltv: life,
  });
});

export default r;

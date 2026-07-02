import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

// ¿El usuario tiene acceso a un módulo? (admin siempre sí)
const can = (req, mod) => req.user?.role === 'admin' || (req.user?.perms || []).includes(mod);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

/* Devuelve un arreglo de alertas accionables, filtradas por los permisos del usuario.
   Cada alerta: { id, module, severity: 'alta'|'media'|'info', title, detail, count, link } */
r.get('/', async (req, res) => {
  const alerts = [];

  // 1) INVENTARIO BAJO (productos o insumos en o por debajo del mínimo)
  if (can(req, 'inventario')) {
    const [supplies, products] = await Promise.all([
      prisma.supply.findMany(), prisma.product.findMany(),
    ]);
    const low = [...supplies, ...products].filter(x => x.stock <= x.minStock);
    if (low.length) {
      const critical = low.filter(x => x.stock <= x.minStock / 2).length;
      alerts.push({
        id: 'inv-low', module: 'inventario', severity: critical ? 'alta' : 'media',
        title: 'Inventario bajo',
        detail: `${low.length} artículo(s) en o bajo el mínimo${critical ? ` · ${critical} crítico(s)` : ''}: ${low.slice(0, 4).map(x => x.name).join(', ')}${low.length > 4 ? '…' : ''}`,
        count: low.length, link: '/inventario',
      });
    }
  }

  // 2) OPERACIÓN DEL DÍA
  if (can(req, 'agenda')) {
    // Citas de hoy sin confirmar (siguen en 'agendada')
    const sinConfirmar = await prisma.appointment.count({
      where: { start: { gte: startOfToday(), lte: endOfToday() }, status: 'agendada' },
    });
    if (sinConfirmar) alerts.push({
      id: 'appt-unconfirmed', module: 'agenda', severity: 'media',
      title: 'Citas de hoy sin confirmar', detail: `${sinConfirmar} cita(s) de hoy siguen sin confirmar.`,
      count: sinConfirmar, link: '/agenda',
    });
  }
  if (can(req, 'caja')) {
    // Caja abierta de días anteriores (no cortada) — con quién la abrió y desde cuándo
    const abiertasViejas = await prisma.cashSession.findMany({
      where: { closed: false, openedAt: { lt: startOfToday() } },
      include: { staff: true }, orderBy: { openedAt: 'asc' },
    });
    if (abiertasViejas.length) {
      const fmt = d => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
      const detalle = abiertasViejas
        .map(s => `${s.staff?.name || 'Sin asignar'} (abierta el ${fmt(s.openedAt)})`)
        .join(' · ');
      alerts.push({
        id: 'cash-open', module: 'caja', severity: 'alta',
        title: `${abiertasViejas.length} caja(s) sin cortar`,
        detail: `${detalle}. Realiza el corte.`,
        count: abiertasViejas.length, link: '/caja',
      });
    }
  }
  if (can(req, 'paquetes')) {
    // Paquetes con sesiones que vencen en los próximos 14 días
    const in14 = new Date(); in14.setDate(in14.getDate() + 14);
    const porVencer = await prisma.clientPackage.count({
      where: { remaining: { gt: 0 }, expiresAt: { gte: new Date(), lte: in14 } },
    });
    if (porVencer) alerts.push({
      id: 'pkg-expiring', module: 'paquetes', severity: 'media',
      title: 'Paquetes por vencer', detail: `${porVencer} paquete(s) con sesiones disponibles vencen en 14 días.`,
      count: porVencer, link: '/paquetes',
    });
  }

  // 3) CLIENTES EN RIESGO + CUMPLEAÑOS
  if (can(req, 'crm') || can(req, 'clientes')) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 45);
    const clients = await prisma.client.findMany({ include: { sales: { orderBy: { date: 'desc' }, take: 1 } } });
    const enRiesgo = clients.filter(c => c.sales[0] && new Date(c.sales[0].date) < cutoff).length;
    if (enRiesgo) alerts.push({
      id: 'cli-risk', module: 'crm', severity: 'media',
      title: 'Clientes en riesgo de fuga', detail: `${enRiesgo} cliente(s) no vienen hace más de 45 días.`,
      count: enRiesgo, link: '/crm',
    });
    // Cumpleaños en los próximos 7 días
    const today = new Date(); const soon = [];
    for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(today.getDate() + i); soon.push(`${d.getMonth()}-${d.getDate()}`); }
    const cumple = clients.filter(c => c.birth && soon.includes(`${new Date(c.birth).getMonth()}-${new Date(c.birth).getDate()}`)).length;
    if (cumple) alerts.push({
      id: 'cli-bday', module: 'crm', severity: 'info',
      title: 'Cumpleaños esta semana', detail: `${cumple} cliente(s) cumplen años en los próximos 7 días. ¡Felicítalos!`,
      count: cumple, link: '/crm',
    });
  }

  // 4) CRM: seguimientos vencidos o para hoy
  if (can(req, 'crm')) {
    const vencidos = await prisma.followUp.count({
      where: { done: false, dueDate: { not: null, lte: endOfToday() } },
    });
    if (vencidos) alerts.push({
      id: 'crm-followups', module: 'crm', severity: 'media',
      title: 'Seguimientos pendientes', detail: `${vencidos} tarea(s) de seguimiento vencidas o para hoy.`,
      count: vencidos, link: '/crm',
    });
  }

  // Orden: alta > media > info
  const rank = { alta: 0, media: 1, info: 2 };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
  res.json({ alerts, generatedAt: new Date() });
});

export default r;

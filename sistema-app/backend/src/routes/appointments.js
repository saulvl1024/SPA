import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';
import { findClash } from '../lib/calc.js';
import { sendText } from '../lib/whatsapp.js';
import { logAudit } from '../lib/audit.js';

const r = Router();
r.use(auth);

function localDay(value) {
  if (!value) return new Date();
  const [y, m, d] = value.toString().split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Citas por día: ?date=YYYY-MM-DD
r.get('/', async (req, res) => {
  const date = localDay(req.query.date);
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);
  const appts = await prisma.appointment.findMany({
    where: { start: { gte: start, lte: end } },
    include: { client: true, staff: true, service: true },
    orderBy: { start: 'asc' },
  });
  res.json(appts);
});

r.post('/', async (req, res) => {
  const { clientId, staffId, serviceId, start } = req.body;
  if (!clientId || !staffId || !serviceId || !start)
    return res.status(400).json({ error: 'Faltan datos' });
  const when = new Date(start);

  // Validar horario del especialista (si tiene horario configurado)
  const sp = await prisma.staff.findUnique({ where: { id: staffId } });
  const sch = sp?.schedule;
  if (sch && typeof sch === 'object') {
    const day = sch[String(when.getDay())]; // 0=domingo..6=sábado
    const hhmm = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
    if (!day || !day.on) return res.status(409).json({ error: `${sp.name} no trabaja ese día.` });
    if (day.from && hhmm < day.from || day.to && hhmm >= day.to)
      return res.status(409).json({ error: `${sp.name} atiende de ${day.from} a ${day.to} ese día.` });
  }

  // Validar choque: mismo especialista, misma fecha y hora (ignora canceladas/no asistió)
  const sameStaff = await prisma.appointment.findMany({ where: { staffId }, include: { client: true } });
  const clash = findClash(sameStaff, when);
  if (clash) {
    return res.status(409).json({ error: `Ese horario ya está ocupado con ${clash.client?.name || 'otra cita'} para esa especialista.` });
  }
  const appt = await prisma.appointment.create({
    data: { clientId, staffId, serviceId, start: when, status: 'agendada' },
    include: { client: true, service: true },
  });
  // Confirmación automática por WhatsApp (no bloquea ni rompe la respuesta)
  if (appt.client?.phone) {
    const msg = `Hola ${appt.client.name.split(' ')[0]} 🌸 Tu cita en SÉRÈN Spa quedó agendada para el ${new Date(when).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })} (${appt.service?.name}). ¡Te esperamos!`;
    sendText(appt.client.phone, msg).catch(() => {});
  }
  logAudit(req, { module: 'agenda', action: 'agendar_cita', summary: `Agendó cita de ${appt.client?.name || 'cliente'} (${appt.service?.name || 'servicio'}) el ${new Date(when).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`, refId: appt.id });
  res.status(201).json(appt);
});

// Cambiar estado; al completar descuenta insumos y sesión de paquete
r.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appt) return res.status(404).json({ error: 'No encontrada' });

  if (status === 'completada' && appt.status !== 'completada') {
    const recipe = await prisma.serviceSupply.findMany({ where: { serviceId: appt.serviceId } });
    for (const item of recipe) {
      await prisma.supply.update({
        where: { id: item.supplyId },
        data: { stock: { decrement: item.qty } },
      });
    }
    const cp = await prisma.clientPackage.findFirst({
      where: { clientId: appt.clientId, serviceId: appt.serviceId, remaining: { gt: 0 } },
    });
    if (cp) await prisma.clientPackage.update({ where: { id: cp.id }, data: { remaining: { decrement: 1 } } });
  }

  const updated = await prisma.appointment.update({
    where: { id: req.params.id }, data: { status },
    include: { client: true, service: true },
  });
  logAudit(req, { module: 'agenda', action: status === 'cancelada' ? 'cancelar_cita' : 'cambio_estado_cita', summary: `Cita de ${updated.client?.name || 'cliente'} (${updated.service?.name || ''}) → ${status}`, refId: updated.id });
  res.json(updated);
});

export default r;

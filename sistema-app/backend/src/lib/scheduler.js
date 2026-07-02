// Envíos automáticos diarios por WhatsApp (cron interno).
// Corre mientras el backend esté encendido. Configurable por variables de entorno:
//   WA_AUTO_HOUR=9            hora (0-23) a la que se disparan los envíos del día
//   WA_REMIND_TODAY=true      recordar citas de HOY
//   WA_REMIND_TOMORROW=true   recordar citas de MAÑANA
//   WA_BIRTHDAY=true          felicitar cumpleaños del día
//   WA_TEMPLATE_REMINDER=recordatorio_cita   nombre de la plantilla aprobada (recordatorio)
//   WA_TEMPLATE_BIRTHDAY=feliz_cumple        nombre de la plantilla aprobada (cumpleaños)
//   WA_TEMPLATE_LANG=es_MX
import { prisma } from '../db.js';
import { sendTemplate, sendText, isConfigured } from './whatsapp.js';

const bool = (v, def) => (v == null ? def : String(v).toLowerCase() === 'true');

// Config de automatizaciones (desde SystemConfig). Valores por defecto seguros.
const DEFAULT_AUTOMATIONS = {
  postVisit:  { on: false, message: 'Hola {nombre}, ¡gracias por tu visita a {negocio}! Esperamos que la hayas disfrutado. Te esperamos pronto.' },
  reactivate: { on: false, days: 60, message: 'Hola {nombre}, en {negocio} te extrañamos. Tenemos algo especial para tu regreso. ¿Agendamos?' },
  birthday:   { on: true,  message: '' }, // el de cumpleaños usa plantilla (ya existe)
};
async function getAutomations() {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  const biz = cfg?.businessName || process.env.BUSINESS_NAME || 'nuestro negocio';
  const a = (cfg?.automations && typeof cfg.automations === 'object') ? cfg.automations : {};
  return {
    biz,
    postVisit: { ...DEFAULT_AUTOMATIONS.postVisit, ...(a.postVisit || {}) },
    reactivate: { ...DEFAULT_AUTOMATIONS.reactivate, ...(a.reactivate || {}) },
  };
}
const fill = (msg, name, biz) => (msg || '').replace(/\{nombre\}/gi, (name || '').split(' ')[0]).replace(/\{negocio\}/gi, biz);
const fmtDate = d => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
const fmtTime = d => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const first = n => (n || '').split(' ')[0];

function dayRange(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}

const LANG = () => process.env.WA_TEMPLATE_LANG || 'es_MX';
const tplReminder = () => process.env.WA_TEMPLATE_REMINDER || 'recordatorio_cita';
const tplBirthday = () => process.env.WA_TEMPLATE_BIRTHDAY || 'feliz_cumple';

// Recordatorios de las citas en el rango (hoy o mañana)
async function remindAppointments(offsetDays, label) {
  const { start, end } = dayRange(offsetDays);
  const appts = await prisma.appointment.findMany({
    where: { start: { gte: start, lte: end }, status: { notIn: ['cancelada', 'no_asistio', 'completada'] } },
    include: { client: true, service: true },
  });
  let sent = 0;
  for (const a of appts) {
    if (!a.client?.phone) continue;
    try {
      // Plantilla con 3 variables: nombre, fecha+hora, servicio
      await sendTemplate(a.client.phone, tplReminder(), LANG(), [
        first(a.client.name),
        `${fmtDate(a.start)} ${fmtTime(a.start)}`,
        a.service?.name || 'tu servicio',
      ]);
      sent++;
    } catch (e) { console.error('[auto] recordatorio falló:', a.id, e.message); }
  }
  console.log(`[auto] Recordatorios (${label}): ${sent}/${appts.length} enviados`);
  return sent;
}

// Felicitaciones de cumpleaños del día
async function birthdayGreetings() {
  const today = new Date();
  const clients = await prisma.client.findMany({ where: { birth: { not: null }, phone: { not: null } } });
  const promo = await prisma.promotion.findFirst({ where: { active: true, birthday: true } });
  const promoCode = promo ? promo.code : '';
  let sent = 0;
  for (const c of clients) {
    const b = new Date(c.birth);
    if (b.getMonth() === today.getMonth() && b.getDate() === today.getDate()) {
      try {
        // Plantilla con 2 variables: nombre, código de cupón (vacío si no hay)
        await sendTemplate(c.phone, tplBirthday(), LANG(), [first(c.name), promoCode || 'tu regalo']);
        sent++;
      } catch (e) { console.error('[auto] cumpleaños falló:', c.id, e.message); }
    }
  }
  console.log(`[auto] Cumpleaños: ${sent} enviados`);
  return sent;
}

// AUTOMATIZACIÓN: agradecimiento post-visita (a quienes compraron AYER)
async function postVisitThanks(cfg) {
  if (!cfg.postVisit.on) return 0;
  const { start, end } = dayRange(-1); // ayer
  const sales = await prisma.sale.findMany({
    where: { date: { gte: start, lte: end } },
    include: { client: true }, distinct: ['clientId'],
  });
  let sent = 0;
  for (const s of sales) {
    if (!s.client?.phone) continue;
    try { await sendText(s.client.phone, fill(cfg.postVisit.message, s.client.name, cfg.biz)); sent++; }
    catch (e) { console.error('[auto] post-visita falló:', s.id, e.message); }
  }
  console.log(`[auto] Post-visita: ${sent} enviados`);
  return sent;
}

// AUTOMATIZACIÓN: reactivación de inactivos (sin comprar hace >= N días, una sola vez al cruzar el umbral)
async function reactivateInactive(cfg) {
  if (!cfg.reactivate.on) return 0;
  const days = Number(cfg.reactivate.days) || 60;
  // Cliente cuya ÚLTIMA venta fue exactamente hace 'days' días (para no repetir cada día)
  const target = dayRange(-days);
  const agg = await prisma.sale.groupBy({ by: ['clientId'], _max: { date: true } });
  const ids = agg.filter(g => g._max.date >= target.start && g._max.date <= target.end).map(g => g.clientId);
  if (!ids.length) { console.log('[auto] Reactivación: 0'); return 0; }
  const clients = await prisma.client.findMany({ where: { id: { in: ids }, phone: { not: null } } });
  let sent = 0;
  for (const c of clients) {
    try { await sendText(c.phone, fill(cfg.reactivate.message, c.name, cfg.biz)); sent++; }
    catch (e) { console.error('[auto] reactivación falló:', c.id, e.message); }
  }
  console.log(`[auto] Reactivación: ${sent} enviados`);
  return sent;
}

// Ejecuta la tanda diaria (también se puede llamar manualmente para pruebas)
export async function runDailyJobs() {
  const r = { today: 0, tomorrow: 0, birthdays: 0, postVisit: 0, reactivate: 0 };
  if (bool(process.env.WA_REMIND_TODAY, true)) r.today = await remindAppointments(0, 'hoy');
  if (bool(process.env.WA_REMIND_TOMORROW, true)) r.tomorrow = await remindAppointments(1, 'mañana');
  if (bool(process.env.WA_BIRTHDAY, true)) r.birthdays = await birthdayGreetings();
  // Automatizaciones configurables (post-visita y reactivación)
  // Solo corren si el super-admin tiene activado el setting 'usarAutomatizaciones'.
  try {
    const sys = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    const autoOn = sys?.settings?.usarAutomatizaciones !== false; // por defecto activo
    if (autoOn) {
      const cfg = await getAutomations();
      r.postVisit = await postVisitThanks(cfg);
      r.reactivate = await reactivateInactive(cfg);
    } else {
      console.log('[auto] Automatizaciones desactivadas por el administrador.');
    }
  } catch (e) { console.error('[auto] automatizaciones:', e.message); }
  return r;
}

// Inicia el cron interno: revisa cada minuto y dispara una vez al llegar la hora configurada.
export function startScheduler() {
  const hour = Number(process.env.WA_AUTO_HOUR);
  if (Number.isNaN(hour)) {
    console.log('[auto] Scheduler desactivado (define WA_AUTO_HOUR para activarlo, p.ej. 9).');
    return;
  }
  let lastRun = '';
  setInterval(async () => {
    const now = new Date();
    const key = now.toISOString().slice(0, 10); // una vez por día
    if (now.getHours() === hour && now.getMinutes() === 0 && lastRun !== key) {
      lastRun = key;
      console.log(`[auto] Ejecutando envíos diarios (${key}, ${hour}:00)${isConfigured() ? '' : ' [modo demo]'}`);
      try { await runDailyJobs(); } catch (e) { console.error('[auto] error:', e.message); }
    }
  }, 60 * 1000);
  console.log(`[auto] Scheduler activo: envíos diarios a las ${hour}:00`);
}

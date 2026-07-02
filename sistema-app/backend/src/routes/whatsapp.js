import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';
import { sendText, sendTemplate, isConfigured } from '../lib/whatsapp.js';
import { runDailyJobs } from '../lib/scheduler.js';
import { adminOnly } from '../middleware/auth.js';

const r = Router();
r.use(auth);

// Dispara manualmente la tanda diaria de envíos automáticos (para probar sin esperar la hora)
r.post('/run-auto', adminOnly, async (_req, res) => {
  try { const result = await runDailyJobs(); res.json({ ok: true, ...result }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Prueba de conexión: envía la plantilla por defecto de Meta (hello_world, en_US).
// Sirve para verificar credenciales sin depender de la ventana de 24h.
r.post('/test', async (req, res) => {
  try {
    const out = await sendTemplate(req.body.phone, 'hello_world', 'en_US', []);
    res.json({ ok: true, demo: !!out.demo, raw: out });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

const fmt = d => new Date(d).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
const first = n => (n || '').split(' ')[0];

// Estado de la integración (para mostrar en la interfaz)
r.get('/status', (_req, res) => res.json({ configured: isConfigured() }));

// Envío de texto genérico (modo demo si no hay credenciales)
r.post('/send', async (req, res) => {
  try {
    const out = await sendText(req.body.phone, req.body.text || '');
    res.json({ ok: true, demo: !!out.demo });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Recordatorio de cita
r.post('/appointment/:id/reminder', async (req, res) => {
  try {
    const a = await prisma.appointment.findUnique({ where: { id: req.params.id }, include: { client: true, service: true } });
    if (!a) return res.status(404).json({ error: 'Cita no encontrada' });
    if (!a.client?.phone) return res.status(400).json({ error: 'El cliente no tiene teléfono' });
    const msg = `Hola ${first(a.client.name)} 🌸 Te recordamos tu cita en SÉRÈN Spa el ${fmt(a.start)} para ${a.service?.name}. ¿Nos confirmas? ¡Te esperamos!`;
    const out = await sendText(a.client.phone, msg);
    res.json({ ok: true, demo: !!out.demo });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Felicitación de cumpleaños (incluye el cupón marcado como de cumpleaños)
r.post('/client/:id/birthday', async (req, res) => {
  try {
    const c = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!c?.phone) return res.status(400).json({ error: 'El cliente no tiene teléfono' });
    const promo = await prisma.promotion.findFirst({ where: { active: true, birthday: true } });
    const promoTxt = promo ? ` Usa el código ${promo.code} y obtén ${promo.type === 'percent' ? promo.value + '%' : '$' + promo.value} de regalo.` : '';
    const msg = `¡Feliz cumpleaños, ${first(c.name)}! 🎉🌸 En SÉRÈN Spa queremos consentirte.${promoTxt} ¡Te esperamos!`;
    const out = await sendText(c.phone, msg);
    res.json({ ok: true, demo: !!out.demo });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Reactivar cliente en riesgo
r.post('/client/:id/reactivate', async (req, res) => {
  try {
    const c = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!c?.phone) return res.status(400).json({ error: 'El cliente no tiene teléfono' });
    const msg = `Hola ${first(c.name)} 🌸 Te extrañamos en SÉRÈN Spa. ¿Te gustaría agendar tu próxima cita? Tenemos un detalle para ti.`;
    const out = await sendText(c.phone, msg);
    res.json({ ok: true, demo: !!out.demo });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default r;

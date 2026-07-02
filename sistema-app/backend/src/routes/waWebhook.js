// Webhook PÚBLICO de WhatsApp (Meta lo llama sin token JWT).
// Recibe las respuestas de los clientes (botones de Confirmar/Cancelar) y actualiza la cita.
//
// Requiere en producción:
//   - El backend accesible por una URL pública (https).
//   - En Meta: configurar el webhook apuntando a  https://TU-DOMINIO/api/wa-webhook
//     y usar el mismo "Verify Token" que pongas en .env como WA_WEBHOOK_VERIFY_TOKEN.
import { Router } from 'express';
import { prisma } from '../db.js';
import { logAudit } from '../lib/audit.js';

const r = Router();

const VERIFY_TOKEN = () => process.env.WA_WEBHOOK_VERIFY_TOKEN || 'seren-verify';

// 1) Verificación inicial (handshake): Meta hace un GET al configurar el webhook.
r.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN()) {
    return res.status(200).send(challenge); // confirma a Meta
  }
  return res.sendStatus(403);
});

// Normaliza un número a solo dígitos para comparar
const digits = s => (s || '').replace(/\D/g, '');

// Busca la próxima cita activa de un teléfono y la actualiza
async function updateApptByPhone(phone, status) {
  const tail = digits(phone).slice(-10); // últimos 10 dígitos (sin lada país)
  if (!tail) return null;
  // Citas futuras o de hoy, no canceladas/completadas, de clientes cuyo teléfono termina igual
  const appts = await prisma.appointment.findMany({
    where: {
      start: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      status: { notIn: ['cancelada', 'completada', 'no_asistio'] },
      client: { phone: { endsWith: tail } },
    },
    include: { client: true },
    orderBy: { start: 'asc' },
  });
  const appt = appts[0]; // la más próxima
  if (!appt) return null;
  await prisma.appointment.update({ where: { id: appt.id }, data: { status } });
  return appt;
}

// 2) Recepción de mensajes/respuestas (POST)
r.post('/', async (req, res) => {
  // Responder 200 de inmediato (Meta reintenta si tarda)
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    if (!msg) return;

    const from = msg.from; // teléfono del cliente
    // Texto del botón de respuesta rápida, o texto libre como respaldo
    const buttonText = msg.button?.text || msg.interactive?.button_reply?.title || msg.text?.body || '';
    const t = buttonText.toLowerCase();

    let status = null;
    if (/confirm/.test(t) || /\bs[ií]\b/.test(t)) status = 'confirmada';
    else if (/cancel/.test(t)) status = 'cancelada';
    if (!status) return; // no es una respuesta de confirmación/cancelación

    const appt = await updateApptByPhone(from, status);
    if (appt) {
      logAudit({ user: { id: null, name: appt.client?.name || 'Cliente (WhatsApp)' } }, {
        module: 'agenda', action: status === 'confirmada' ? 'confirmar_cita' : 'cancelar_cita',
        summary: `El cliente ${appt.client?.name || ''} ${status === 'confirmada' ? 'confirmó' : 'canceló'} su cita por WhatsApp`,
        refId: appt.id,
      });
      console.log(`[wa-webhook] Cita ${appt.id} → ${status} (respuesta de ${from})`);
    }
  } catch (e) {
    console.error('[wa-webhook] error procesando:', e.message);
  }
});

export default r;

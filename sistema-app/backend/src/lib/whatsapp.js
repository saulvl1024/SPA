// Integración con WhatsApp Cloud API de Meta.
// Configurar en .env:
//   WHATSAPP_TOKEN=...          (token de acceso de la app de Meta)
//   WHATSAPP_PHONE_ID=...       (Phone Number ID)
//   WHATSAPP_API_VERSION=v21.0  (opcional)
// Si no hay credenciales, el envío se simula (modo demo) y se registra en consola.

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';

export function isConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

// Normaliza a solo dígitos con código de país (México por defecto: 52)
export function normalizePhone(phone, countryCode = '52') {
  let n = (phone || '').replace(/\D/g, '');
  if (!n) return null;
  if (n.length === 10) n = countryCode + n; // agrega lada país si faltó
  return n;
}

async function callGraph(payload) {
  const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error || {};
    // Detalle completo de Meta: código + subcódigo + mensaje + pista
    const parts = [e.message || `HTTP ${res.status}`];
    if (e.code) parts.push(`código ${e.code}`);
    if (e.error_subcode) parts.push(`subcódigo ${e.error_subcode}`);
    if (e.error_data?.details) parts.push(e.error_data.details);
    console.error('[WhatsApp] error de Meta:', JSON.stringify(data));
    throw new Error('WhatsApp: ' + parts.join(' · '));
  }
  return data;
}

// Envía un mensaje de texto libre (solo válido dentro de la ventana de 24h)
export async function sendText(phone, text) {
  const to = normalizePhone(phone);
  if (!to) throw new Error('Teléfono inválido');
  if (!isConfigured()) {
    console.log(`[WhatsApp DEMO] a ${to}: ${text}`);
    return { demo: true, to, text };
  }
  return callGraph({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } });
}

// Envía una plantilla aprobada. components: parámetros del cuerpo, p.ej. ['Mariana','5 jun 18:00']
export async function sendTemplate(phone, templateName, langCode = 'es_MX', bodyParams = []) {
  const to = normalizePhone(phone);
  if (!to) throw new Error('Teléfono inválido');
  const template = {
    name: templateName,
    language: { code: langCode },
    components: bodyParams.length
      ? [{ type: 'body', parameters: bodyParams.map(t => ({ type: 'text', text: String(t) })) }]
      : undefined,
  };
  if (!isConfigured()) {
    console.log(`[WhatsApp DEMO] plantilla ${templateName}(${bodyParams.join(', ')}) a ${to}`);
    return { demo: true, to, template: templateName, params: bodyParams };
  }
  return callGraph({ messaging_product: 'whatsapp', to, type: 'template', template });
}

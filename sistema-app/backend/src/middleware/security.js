// Middlewares de seguridad sin dependencias externas:
//  - rateLimit: limita peticiones por ventana de tiempo (por IP o por usuario)
//  - securityHeaders: cabeceras de endurecimiento (estilo helmet, lo esencial)
//  - sanitizeBody: limpieza defensiva de entradas (defensa en profundidad; Prisma ya parametriza)

/* ===================== RATE LIMITING (en memoria) ===================== */
// Adecuado para una instalación de un solo proceso (tu caso single-tenant).
// Para varios procesos/instancias, migrar el store a Redis.

const buckets = new Map(); // key -> { count, resetAt }

// Limpieza periódica de cubetas vencidas para no acumular memoria.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000).unref?.();

/**
 * Crea un middleware de rate limit.
 * @param {object} opts
 * @param {number} opts.windowMs  ventana en ms (default 60s)
 * @param {number} opts.max       máximo de peticiones por ventana
 * @param {string} opts.scope     etiqueta para separar cubetas entre limitadores distintos
 * @param {boolean} opts.byUser   true = clave por usuario autenticado (cae a IP si no hay user)
 * @param {string} opts.message   mensaje de error
 */
export function rateLimit({ windowMs = 60_000, max = 120, scope = 'global', byUser = false, message = 'Demasiadas peticiones, intenta en un momento.' } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const id = byUser && req.user?.id ? `u:${req.user.id}` : `ip:${ip}`;
    const key = `${scope}:${id}`;
    const now = Date.now();

    let b = buckets.get(key);
    if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
    b.count++;

    const remaining = Math.max(0, max - b.count);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil((b.resetAt - now) / 1000));

    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

/* ===================== SECURITY HEADERS ===================== */
// Equivalente a lo esencial de helmet, sin la dependencia.
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');           // no adivinar MIME
  res.setHeader('X-Frame-Options', 'DENY');                     // anti-clickjacking
  res.setHeader('Referrer-Policy', 'no-referrer');              // no filtrar URLs
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // HSTS solo tiene sentido sobre HTTPS (producción detrás de TLS).
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By'); // no revelar Express
  next();
}

/* ===================== SANITIZACIÓN DE ENTRADAS ===================== */
// Defensa en profundidad. Prisma ya previene inyección SQL al parametrizar,
// pero esto bloquea claves peligrosas de NoSQL/prototype-pollution y recorta
// caracteres de control. NO escapa HTML aquí (eso se hace al renderizar en el front).

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Topes numéricos globales para evitar montos/cantidades absurdos ("hasta el infinito").
// Se aplican por nombre de campo en el body de cualquier petición.
const MAX_MONEY = 999_999_999;   // ~1,000 millones (montos, precios, totales, descuentos)
const MAX_QTY   = 1_000_000;     // un millón (cantidades, stock, puntos)
// Campos de dinero (su valor se acota a [0, MAX_MONEY])
const MONEY_FIELDS = new Set(['amount', 'price', 'total', 'subtotal', 'discount', 'tax', 'cost', 'paid', 'change', 'credit', 'monto', 'precio', 'importe', 'commissionRate', 'taxRate', 'unitPrice']);
// Campos de cantidad (su valor se acota a [0, MAX_QTY])
const QTY_FIELDS = new Set(['qty', 'quantity', 'cantidad', 'stock', 'min', 'remaining', 'points', 'puntos', 'sessions', 'days']);

// Acota un número al rango [0, max], conservando el tipo de entrada (number o string).
function clampNum(n, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  const clamped = Math.min(Math.max(v, 0), max);
  return typeof n === 'string' ? String(clamped) : clamped;
}

function cleanString(s) {
  // Elimina null bytes y caracteres de control no imprimibles (conserva tab y newline).
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function sanitizeValue(val, depth = 0, key = null) {
  if (depth > 20) return val; // corta estructuras anómalamente profundas
  if (typeof val === 'string') return cleanString(val);
  if (Array.isArray(val)) return val.map(v => sanitizeValue(v, depth + 1, key));
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val)) {
      if (DANGEROUS_KEYS.has(k)) continue; // descarta claves de prototype-pollution
      out[k] = sanitizeValue(val[k], depth + 1, k);
    }
    return out;
  }
  // Acota números de dinero y cantidad según el nombre del campo
  if (key != null && (typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && Number.isFinite(Number(val))))) {
    if (MONEY_FIELDS.has(key)) return clampNum(val, MAX_MONEY);
    if (QTY_FIELDS.has(key)) return clampNum(val, MAX_QTY);
  }
  return val;
}

export function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body);
  if (req.query && typeof req.query === 'object') {
    // req.query puede ser de solo lectura en algunas versiones; limpiar in-place.
    for (const k of Object.keys(req.query)) {
      if (DANGEROUS_KEYS.has(k)) { delete req.query[k]; continue; }
      const v = req.query[k];
      if (typeof v === 'string') req.query[k] = cleanString(v);
    }
  }
  next();
}

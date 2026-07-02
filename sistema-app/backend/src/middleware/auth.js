import jwt from 'jsonwebtoken';
import { effectivePermissions } from '../lib/permissions.js';
import { rateLimit } from './security.js';

// Secreto JWT desde variable de entorno. Sin fallback inseguro: si falta, el server no arranca.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error('JWT_SECRET no definido o demasiado corto (mínimo 16 caracteres). Configúralo en .env');
}

// Límite por USUARIO autenticado por minuto (se aplica tras verificar el token).
const perUserLimiter = rateLimit({ windowMs: 60_000, max: 150, scope: 'user', byUser: true, message: 'Has hecho demasiadas peticiones este minuto. Espera un momento.' });

export function sign(staff) {
  return jwt.sign(
    { id: staff.id, name: staff.name, role: staff.role, perms: effectivePermissions(staff), warehouseId: staff.warehouseId || null },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// Middleware: exige que el usuario tenga permiso sobre un módulo (admin siempre pasa)
export function requirePerm(moduleKey) {
  return (req, res, next) => {
    if (req.user?.role === 'admin' || req.user?.role === 'superadmin') return next();
    if ((req.user?.perms || []).includes(moduleKey)) return next();
    return res.status(403).json({ error: 'Sin permiso para este módulo' });
  };
}

export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
  // Ya identificado el usuario: aplica el límite de peticiones por usuario/minuto.
  perUserLimiter(req, res, next);
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') return res.status(403).json({ error: 'Solo administrador' });
  next();
}

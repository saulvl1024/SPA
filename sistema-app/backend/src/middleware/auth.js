import jwt from 'jsonwebtoken';

export function sign(staff) {
  return jwt.sign(
    { id: staff.id, name: staff.name, role: staff.role },
    process.env.JWT_SECRET || 'dev',
    { expiresIn: '12h' }
  );
}

export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev');
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida' });
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo administrador' });
  next();
}

// Utilidades HTTP: captura de errores async y manejadores globales.

// Envuelve un handler async para que cualquier error pase a next() (y al manejador global)
// en vez de dejar la petición colgada.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// 404 para rutas de API no existentes
export function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// Manejador global de errores: responde JSON limpio, registra el detalle en el servidor.
export function errorHandler(err, _req, res, _next) {
  console.error('[error]', err?.message || err);
  // Errores conocidos de Prisma (registro no encontrado, etc.)
  if (err?.code === 'P2025') return res.status(404).json({ error: 'Registro no encontrado' });
  if (err?.code === 'P2002') return res.status(409).json({ error: 'Valor duplicado' });
  const status = err.status || 400;
  // No se expone el stack ni detalles internos al cliente.
  res.status(status).json({ error: err.expose ? err.message : (err.message || 'Error en la solicitud') });
}

import { prisma } from '../db.js';

// Registra un evento en la bitácora de auditoría.
// Nunca debe tumbar la operación principal: si falla, solo se loguea en consola.
// Uso: await logAudit(req, { module, action, summary, refId, meta })
export async function logAudit(req, { module, action, summary, refId = null, meta = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req?.user?.id || null,
        actorName: req?.user?.name || 'Sistema',
        module,
        action,
        summary,
        refId,
        meta: meta || undefined,
      },
    });
  } catch (e) {
    console.error('[audit] no se pudo registrar el evento:', e.message);
  }
}

import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, requirePerm } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { getLoyaltyConfig, DEFAULT_LOYALTY } from '../lib/loyalty.js';

const r = Router();
r.use(auth, requirePerm('lealtad'));

// Config actual del programa de lealtad
r.get('/config', async (_req, res) => res.json(await getLoyaltyConfig()));

// Guardar config (solo admin del módulo)
r.put('/config', async (req, res) => {
  const b = req.body || {};
  const loyalty = {
    enabled: b.enabled !== false,
    pointsPerCurrency: Number(b.pointsPerCurrency) >= 0 ? Number(b.pointsPerCurrency) : DEFAULT_LOYALTY.pointsPerCurrency,
    redeemValue: Number(b.redeemValue) >= 0 ? Number(b.redeemValue) : DEFAULT_LOYALTY.redeemValue,
    minRedeem: Number(b.minRedeem) >= 0 ? Math.floor(Number(b.minRedeem)) : DEFAULT_LOYALTY.minRedeem,
    tiers: Array.isArray(b.tiers) && b.tiers.length
      ? b.tiers.map(t => ({ name: String(t.name || 'Nivel'), min: Math.max(0, Math.floor(Number(t.min) || 0)), discount: Math.max(0, Number(t.discount) || 0) }))
      : DEFAULT_LOYALTY.tiers,
  };
  let cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) cfg = await prisma.systemConfig.create({ data: { id: 'singleton' } });
  const updated = await prisma.systemConfig.update({ where: { id: cfg.id }, data: { loyalty } });
  logAudit(req, { module: 'lealtad', action: 'config_lealtad', summary: 'Actualizó la configuración del programa de lealtad' });
  res.json(updated.loyalty);
});

export default r;

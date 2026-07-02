import { prisma } from '../db.js';

// Configuración por defecto del programa de lealtad (segura y compatible con lo anterior).
export const DEFAULT_LOYALTY = {
  enabled: true,
  pointsPerCurrency: 0.1,   // puntos ganados por cada $1 gastado (0.1 = 1 punto por cada $10)
  redeemValue: 0.5,         // valor en $ de cada punto al canjear (0.5 = 100 pts = $50)
  minRedeem: 100,           // mínimo de puntos para poder canjear
  tiers: [                  // niveles por puntos acumulados, con % de descuento automático
    { name: 'Plata',   min: 0,    discount: 0 },
    { name: 'Oro',     min: 1000, discount: 5 },
    { name: 'Platino', min: 3000, discount: 10 },
  ],
};

// Lee la config de lealtad desde la BD (mezcla con defaults).
export async function getLoyaltyConfig() {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  const l = (cfg?.loyalty && typeof cfg.loyalty === 'object') ? cfg.loyalty : {};
  const tiers = Array.isArray(l.tiers) && l.tiers.length ? l.tiers : DEFAULT_LOYALTY.tiers;
  return { ...DEFAULT_LOYALTY, ...l, tiers: tiers.slice().sort((a, b) => a.min - b.min) };
}

// Puntos ganados por un monto, según la tasa configurada.
export function pointsEarned(amount, cfg) {
  if (!cfg.enabled) return 0;
  return Math.max(0, Math.floor((Number(amount) || 0) * (cfg.pointsPerCurrency || 0)));
}

// Nivel del cliente según sus puntos acumulados.
export function tierOf(points, cfg) {
  const t = cfg.tiers.filter(x => (points || 0) >= x.min).pop();
  return t || cfg.tiers[0];
}

// Convierte puntos a dinero de descuento (sin pasar de los puntos disponibles).
export function redeemToMoney(points, cfg) {
  return Math.max(0, (Number(points) || 0) * (cfg.redeemValue || 0));
}

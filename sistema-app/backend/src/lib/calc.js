// Lógica de negocio pura (sin base de datos) — fácil de probar con pruebas unitarias.

const METHODS = ['efectivo', 'tarjeta', 'transferencia'];

/**
 * Resume las ventas de una caja por método de pago y calcula el efectivo esperado.
 * @param {Array} sales - ventas, cada una con {total, paymentMethod, payments?:[{method,amount}]}
 * @param {number} fondo - efectivo inicial de la caja
 * @param {number} cashOut - total de salidas de efectivo del turno
 */
export function summarizeCash(sales = [], fondo = 0, cashOut = 0) {
  const byMethod = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  let total = 0;
  for (const s of sales) {
    if (Array.isArray(s.payments) && s.payments.length) {
      for (const p of s.payments) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
    } else {
      byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] || 0) + s.total;
    }
    total += s.total;
  }
  return {
    byMethod,
    total,
    tickets: sales.length,
    cashOut,
    esperadoEfectivo: fondo + byMethod.efectivo - cashOut,
  };
}

/**
 * Calcula los totales de una venta del POS.
 * @param {Object} p
 * @param {Array} p.items - [{price, qty}]
 * @param {number} p.discount - descuento en monto ($)
 * @param {boolean} p.useCredit - si aplica saldo a favor
 * @param {number} p.clientCredit - saldo a favor disponible del cliente
 */
export function saleTotals({
  items = [], discount = 0, useCredit = false, clientCredit = 0,
  redeemPoints = 0, clientPoints = 0,
  pointsPerCurrency = 0.1, redeemValue = 0.5, minRedeem = 100,
}) {
  const subtotal = items.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  const disc = Math.min(subtotal, Math.max(0, Number(discount) || 0));

  // Canje de puntos por descuento (no puede exceder puntos disponibles ni el restante a pagar)
  let pointsRedeemed = 0, pointsDiscount = 0;
  const want = Math.floor(Number(redeemPoints) || 0);
  if (want >= (minRedeem || 0) && want <= (clientPoints || 0)) {
    const restante = subtotal - disc;
    const maxByMoney = Math.floor(restante / (redeemValue || 1)); // puntos que caben en lo que falta pagar
    pointsRedeemed = Math.min(want, maxByMoney);
    pointsDiscount = pointsRedeemed * (redeemValue || 0);
  }

  const creditUsed = useCredit ? Math.min(clientCredit, subtotal - disc - pointsDiscount) : 0;
  const total = subtotal - disc - pointsDiscount - creditUsed;
  // Puntos GANADOS según la tasa configurable (sobre lo efectivamente pagado)
  const earned = Math.max(0, Math.floor(total * (pointsPerCurrency || 0)));
  // points = neto al saldo del cliente (gana − canjeados)
  const points = earned - pointsRedeemed;
  return { subtotal, discount: disc, creditUsed, pointsDiscount, pointsRedeemed, earned, total, points };
}

/**
 * Descuento que aplica una promoción sobre un subtotal.
 * @param {Object|null} promo - {type:'percent'|'amount', value}
 */
export function promoDiscount(promo, subtotal) {
  if (!promo) return 0;
  if (promo.type === 'percent') return subtotal * (Number(promo.value) || 0) / 100;
  return Math.min(subtotal, Number(promo.value) || 0);
}

/**
 * Busca una cita en conflicto por SOLAPAMIENTO de rangos [inicio, fin), ignorando
 * canceladas/no asistió. Dos rangos se traslapan si: nuevoInicio < finExistente Y nuevoFin > inicioExistente.
 * @param {Array} appointments - [{start, end?, status}]
 * @param {Date|string} start - inicio propuesto
 * @param {Date|string} [end]  - fin propuesto (si falta, asume 60 min)
 * @param {string} [excludeId] - id de cita a ignorar (al reagendar la misma)
 * @returns la cita en conflicto o null
 */
export function findClash(appointments = [], start, end, excludeId = null) {
  const DEFAULT_MIN = 60;
  const s = new Date(start).getTime();
  const e = end != null ? new Date(end).getTime() : s + DEFAULT_MIN * 60000;
  return appointments.find(a => {
    if (excludeId && a.id === excludeId) return false;
    if (['cancelada', 'no_asistio'].includes(a.status)) return false;
    const as = new Date(a.start).getTime();
    const ae = a.end != null ? new Date(a.end).getTime() : as + DEFAULT_MIN * 60000;
    return s < ae && e > as; // se traslapan
  }) || null;
}

/** Nivel de lealtad según puntos. */
export function loyaltyTier(points = 0) {
  return points >= 3000 ? 'Platino' : points >= 1000 ? 'Oro' : 'Plata';
}

/**
 * Calcula la etiqueta automática de un cliente según las etiquetas configuradas.
 * Reglas combinadas: una etiqueta califica si se cumple minVisits O minSpend en su periodo.
 * Gana la de mayor prioridad. Si no califica a ninguna, usa la etiqueta default.
 * @param {Array} tags - etiquetas activas [{name, priority, minVisits, minSpend, periodDays, isDefault}]
 * @param {Array} sales - ventas del cliente [{date, total}]
 * @param {Date} now
 */
export function autoTag(tags = [], sales = [], now = new Date()) {
  const active = tags.filter(t => t.active !== false);
  const ruled = active.filter(t => t.minVisits != null || t.minSpend != null)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const t of ruled) {
    const since = new Date(now); since.setDate(since.getDate() - (t.periodDays || 30));
    const inPeriod = sales.filter(s => new Date(s.date) >= since);
    const visits = inPeriod.length;
    const spend = inPeriod.reduce((a, s) => a + (s.total || 0), 0);
    const okVisits = t.minVisits != null && visits >= t.minVisits;
    const okSpend = t.minSpend != null && spend >= t.minSpend;
    if (okVisits || okSpend) return t.name;
  }
  const def = active.find(t => t.isDefault);
  return def ? def.name : null;
}

/**
 * Etapa del cliente en el embudo, según su actividad de compra.
 *   prospecto  → registrado, sin compras todavía
 *   activo     → compró en los últimos `activeDays` días (default 45)
 *   riesgo     → su última compra fue entre activeDays y lostDays (default 45–90)
 *   perdido    → su última compra fue hace más de `lostDays` (default 90)
 * @param {{lastSale: Date|null, totalSales: number}} c
 */
export function clientStage(c, now = new Date(), activeDays = 45, lostDays = 90) {
  if (!c.totalSales || !c.lastSale) return 'prospecto';
  const dias = Math.floor((now - new Date(c.lastSale)) / 86400000);
  if (dias <= activeDays) return 'activo';
  if (dias <= lostDays) return 'riesgo';
  return 'perdido';
}

/** Etiqueta de estado de stock contra el mínimo. */
export function stockStatus(stock, minStock) {
  if (stock <= minStock / 2) return 'Crítico';
  if (stock <= minStock) return 'Bajo';
  return 'Óptimo';
}

export { METHODS };

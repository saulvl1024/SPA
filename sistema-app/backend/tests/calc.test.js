import { describe, it, expect } from 'vitest';
import {
  summarizeCash, saleTotals, promoDiscount, findClash, loyaltyTier, stockStatus,
} from '../src/lib/calc.js';

describe('summarizeCash (corte de caja)', () => {
  it('agrupa ventas por método de pago', () => {
    const s = summarizeCash(
      [{ total: 100, paymentMethod: 'efectivo' }, { total: 200, paymentMethod: 'tarjeta' }],
      0, 0,
    );
    expect(s.byMethod.efectivo).toBe(100);
    expect(s.byMethod.tarjeta).toBe(200);
    expect(s.total).toBe(300);
    expect(s.tickets).toBe(2);
  });

  it('soporta pagos mixtos (varios métodos en una venta)', () => {
    const s = summarizeCash(
      [{ total: 300, payments: [{ method: 'efectivo', amount: 100 }, { method: 'tarjeta', amount: 200 }] }],
      0, 0,
    );
    expect(s.byMethod.efectivo).toBe(100);
    expect(s.byMethod.tarjeta).toBe(200);
  });

  it('efectivo esperado = fondo + ventas en efectivo − salidas de efectivo', () => {
    const s = summarizeCash([{ total: 100, paymentMethod: 'efectivo' }], 500, 80);
    expect(s.esperadoEfectivo).toBe(500 + 100 - 80);
    expect(s.cashOut).toBe(80);
  });

  it('caja vacía da ceros', () => {
    const s = summarizeCash([], 0, 0);
    expect(s.total).toBe(0);
    expect(s.tickets).toBe(0);
    expect(s.esperadoEfectivo).toBe(0);
  });
});

describe('saleTotals (totales del POS)', () => {
  it('calcula subtotal, descuento, total y puntos', () => {
    const t = saleTotals({ items: [{ price: 850, qty: 1 }, { price: 620, qty: 2 }], discount: 147 });
    expect(t.subtotal).toBe(2090);
    expect(t.discount).toBe(147);
    expect(t.total).toBe(2090 - 147);
    expect(t.points).toBe(Math.round((2090 - 147) / 10));
  });

  it('aplica saldo a favor sin exceder el saldo disponible', () => {
    const t = saleTotals({ items: [{ price: 2000, qty: 1 }], useCredit: true, clientCredit: 500 });
    expect(t.creditUsed).toBe(500);
    expect(t.total).toBe(1500);
  });

  it('el saldo a favor no deja el total en negativo', () => {
    const t = saleTotals({ items: [{ price: 100, qty: 1 }], useCredit: true, clientCredit: 500 });
    expect(t.creditUsed).toBe(100);
    expect(t.total).toBe(0);
  });

  it('el descuento no excede el subtotal', () => {
    const t = saleTotals({ items: [{ price: 100, qty: 1 }], discount: 999 });
    expect(t.discount).toBe(100);
    expect(t.total).toBe(0);
  });

  it('redondea a centavos: sin deriva de coma flotante', () => {
    // 0.10 x 3 en float da 0.30000000000000004; debe quedar exacto en 0.3
    const a = saleTotals({ items: [{ price: 0.10, qty: 3 }] });
    expect(a.subtotal).toBe(0.3);
    expect(a.total).toBe(0.3);
    // 19.99 x 3 = 59.97 exacto
    const b = saleTotals({ items: [{ price: 19.99, qty: 3 }] });
    expect(b.total).toBe(59.97);
  });

  it('canje de puntos: total exacto y puntos netos negativos', () => {
    const t = saleTotals({ items: [{ price: 100, qty: 1 }], redeemPoints: 200, clientPoints: 200, redeemValue: 0.5, minRedeem: 100, pointsPerCurrency: 0.1 });
    expect(t.pointsDiscount).toBe(100);
    expect(t.total).toBe(0);
    expect(t.points).toBe(-200); // gana 0 (total 0) − canjea 200
  });
});

describe('promoDiscount (cupones)', () => {
  it('porcentaje', () => expect(promoDiscount({ type: 'percent', value: 20 }, 1000)).toBe(200));
  it('monto fijo', () => expect(promoDiscount({ type: 'amount', value: 150 }, 1000)).toBe(150));
  it('monto fijo no excede subtotal', () => expect(promoDiscount({ type: 'amount', value: 5000 }, 1000)).toBe(1000));
  it('sin promo = 0', () => expect(promoDiscount(null, 1000)).toBe(0));
});

describe('findClash (choque de citas)', () => {
  const appts = [
    { start: '2026-06-08T10:00:00', status: 'agendada' },
    { start: '2026-06-08T11:00:00', status: 'cancelada' },
    { start: '2026-06-08T12:00:00', status: 'no_asistio' },
  ];
  it('detecta dos citas a la misma hora', () => {
    expect(findClash(appts, '2026-06-08T10:00:00')).toBeTruthy();
  });
  it('detecta traslape parcial (10:30 cae dentro de una cita de 10:00–11:00)', () => {
    // Cita existente de 10:00 con duración explícita hasta 11:00
    const conFin = [{ start: '2026-06-08T10:00:00', end: '2026-06-08T11:00:00', status: 'agendada' }];
    expect(findClash(conFin, '2026-06-08T10:30:00', '2026-06-08T11:30:00')).toBeTruthy();
  });
  it('citas pegadas (una termina donde empieza la otra) NO chocan', () => {
    const conFin = [{ start: '2026-06-08T10:00:00', end: '2026-06-08T11:00:00', status: 'agendada' }];
    expect(findClash(conFin, '2026-06-08T11:00:00', '2026-06-08T12:00:00')).toBeNull();
  });
  it('una cita cancelada no bloquea el horario', () => {
    expect(findClash(appts, '2026-06-08T11:00:00')).toBeNull();
  });
  it('una cita de "no asistió" no bloquea el horario', () => {
    expect(findClash(appts, '2026-06-08T12:00:00')).toBeNull();
  });
  it('horario libre no choca', () => {
    expect(findClash(appts, '2026-06-08T13:00:00')).toBeNull();
  });
});

describe('loyaltyTier (niveles de lealtad)', () => {
  it('clasifica por puntos', () => {
    expect(loyaltyTier(0)).toBe('Plata');
    expect(loyaltyTier(999)).toBe('Plata');
    expect(loyaltyTier(1000)).toBe('Oro');
    expect(loyaltyTier(3000)).toBe('Platino');
  });
});

describe('stockStatus (estado de inventario)', () => {
  it('marca crítico / bajo / óptimo', () => {
    expect(stockStatus(2, 10)).toBe('Crítico');
    expect(stockStatus(8, 10)).toBe('Bajo');
    expect(stockStatus(20, 10)).toBe('Óptimo');
  });
});

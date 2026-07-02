import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';
import { saleTotals } from '../lib/calc.js';
import { recalcClientTag } from './tags.js';
import { logAudit } from '../lib/audit.js';
import { getLoyaltyConfig } from '../lib/loyalty.js';

const r = Router();
r.use(auth);

const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia'];
const cents = n => Math.round((Number(n) || 0) * 100);
const money = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalizePayments(total, paymentMethod, payments) {
  if (!Array.isArray(payments) || payments.length === 0) {
    return [{ method: paymentMethod, amount: total }];
  }
  if (payments.length > 3) throw new Error('Máximo 3 métodos de pago');

  const seen = new Set();
  const clean = payments.map(p => {
    const method = p.method || p.paymentMethod;
    const amount = Number(p.amount);
    if (!PAYMENT_METHODS.includes(method)) throw new Error('Método de pago inválido');
    if (seen.has(method)) throw new Error('Usa cada método de pago una sola vez');
    seen.add(method);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Cada pago debe tener un monto mayor a cero');
    return { method, amount };
  });

  const paid = clean.reduce((a, p) => a + cents(p.amount), 0);
  if (paid !== cents(total)) throw new Error('Los pagos no cuadran con el total');
  return clean;
}

// Historial (admin: todas; empleada: las suyas). ?date=YYYY-MM-DD opcional
r.get('/', async (req, res) => {
  const where = {};
  if (req.query.date) {
    // Interpretar la fecha como día LOCAL (no UTC) para evitar corrimiento de zona horaria
    const [yy, mm, dd] = req.query.date.split('-').map(Number);
    const s = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
    const e = new Date(yy, mm - 1, dd, 23, 59, 59, 999);
    where.date = { gte: s, lte: e };
  }
  // Ve todas las ventas: admin o quien tenga un módulo analítico; el resto solo las suyas.
  const analytic = ['reportes', 'comisiones', 'caja', 'gastos'];
  const canSeeAll = req.user.role === 'admin' || analytic.some(p => (req.user.perms || []).includes(p));
  if (!canSeeAll) where.cashierId = req.user.id;
  const sales = await prisma.sale.findMany({
    where, include: { client: true, cashier: true, items: true, payments: true },
    orderBy: { date: 'desc' }, take: 500,
  });
  res.json(sales);
});

// Cobrar: crea venta, descuenta stock, sesiones, saldo; otorga puntos
r.post('/', async (req, res) => {
  const { clientId, sessionId, items = [], discount = 0, useCredit = false, paymentMethod = 'efectivo', payments, redeemPoints = 0 } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Agrega al menos un producto o servicio' });

  try {
    const loyaltyCfg = await getLoyaltyConfig();
    // Multi-almacén: ¿de qué almacén se descuenta? El asignado al cajero, o el principal.
    const sysCfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
    const usaAlmacenes = sysCfg?.settings?.usarAlmacenes === true;
    let saleWarehouseId = null;
    if (usaAlmacenes) {
      const cajero = await prisma.staff.findUnique({ where: { id: req.user.id }, select: { warehouseId: true } });
      saleWarehouseId = cajero?.warehouseId
        || (await prisma.warehouse.findFirst({ where: { active: true, isDefault: true }, select: { id: true } }))?.id
        || (await prisma.warehouse.findFirst({ where: { active: true }, select: { id: true } }))?.id
        || null;
    }
    const sale = await prisma.$transaction(async (tx) => {
      // Cliente opcional: en venta directa / para llevar se usa "Mostrador" si no se eligió uno.
      let finalClientId = clientId;
      let client = clientId ? await tx.client.findUnique({ where: { id: clientId } }) : null;
      if (clientId && !client) throw new Error('Cliente no encontrado');
      if (!client) {
        client = await tx.client.findFirst({ where: { name: 'Mostrador' } });
        if (!client) client = await tx.client.create({ data: { name: 'Mostrador' } });
        finalClientId = client.id;
      }

      // SEGURIDAD: los precios se resuelven desde la BD, NUNCA se confía en el precio del navegador.
      // OPTIMIZACIÓN: en vez de 1 query por item (N+1), se precargan todos los registros
      // necesarios en pocas consultas batch y se indexan en Maps para lookups O(1).
      const uniq = arr => [...new Set(arr.filter(Boolean))];
      const serviceIds = uniq(items.filter(i => i.type === 'servicio').map(i => i.refId));
      const productIds = uniq(items.filter(i => i.type === 'producto').map(i => i.refId));
      const packageIds = uniq(items.filter(i => i.type === 'paquete').map(i => i.refId));
      const clientPkgIds = uniq(items.filter(i => i.type === 'servicio' && i.fromPackage).map(i => i.packageId));

      const [svcRows, prodRows, pkgRows, cpRows] = await Promise.all([
        serviceIds.length ? tx.service.findMany({ where: { id: { in: serviceIds } } }) : [],
        productIds.length ? tx.product.findMany({ where: { id: { in: productIds } }, include: { components: true, variants: true } }) : [],
        packageIds.length ? tx.package.findMany({ where: { id: { in: packageIds } } }) : [],
        clientPkgIds.length ? tx.clientPackage.findMany({ where: { id: { in: clientPkgIds } } }) : [],
      ]);
      const svcMap = new Map(svcRows.map(s => [s.id, s]));
      const prodMap = new Map(prodRows.map(p => [p.id, p]));
      const pkgMap = new Map(pkgRows.map(p => [p.id, p]));
      const cpMap = new Map(cpRows.map(c => [c.id, c]));

      // Stock de los componentes de bundles: también precargado en un solo query
      const componentIds = uniq(prodRows.filter(p => p.isBundle).flatMap(p => p.components.map(c => c.componentId)));
      const compRows = componentIds.length ? await tx.product.findMany({ where: { id: { in: componentIds } }, select: { id: true, stock: true } }) : [];
      const compStock = new Map(compRows.map(c => [c.id, c.stock]));

      const safeItems = [];
      for (const i of items) {
        const qty = Math.max(1, Math.floor(Number(i.qty) || 1));
        if (i.type === 'servicio') {
          const svc = i.refId ? svcMap.get(i.refId) : null;
          if (!svc) throw new Error('Servicio inválido');
          if (i.fromPackage) {
            const cp = i.packageId ? cpMap.get(i.packageId) : null;
            if (!cp || cp.clientId !== clientId || cp.remaining <= 0) throw new Error('Paquete inválido o sin sesiones');
            safeItems.push({ type: 'servicio', refId: svc.id, name: svc.name, qty: 1, price: 0, specialistId: i.specialistId || null, fromPackage: true, packageId: cp.id });
          } else {
            safeItems.push({ type: 'servicio', refId: svc.id, name: svc.name, qty, price: svc.price, specialistId: i.specialistId || null, fromPackage: false });
          }
        } else if (i.type === 'producto') {
          const p = i.refId ? prodMap.get(i.refId) : null;
          if (!p) throw new Error('Producto inválido');
          if (i.variantId) {
            const v = p.variants.find(x => x.id === i.variantId);
            if (!v) throw new Error('Variante inválida');
            if (v.stock < qty) throw new Error(`Sin stock suficiente de ${p.name} (${v.name})`);
            safeItems.push({ type: 'producto', refId: p.id, variantId: v.id, name: `${p.name} (${v.name})`, qty, price: v.price != null ? v.price : p.price });
          } else if (p.isBundle && p.components.length) {
            // Valida stock de cada componente con lookup O(1) en el Map (sin más queries)
            for (const c of p.components) {
              const stock = compStock.get(c.componentId);
              if (stock == null || stock < c.qty * qty) throw new Error(`Sin stock suficiente para el paquete ${p.name}`);
            }
            safeItems.push({ type: 'producto', refId: p.id, isBundle: true, components: p.components, name: p.name, qty, price: p.price });
          } else {
            if (p.stock < qty) throw new Error(`Sin stock suficiente de ${p.name}`);
            safeItems.push({ type: 'producto', refId: p.id, name: p.name, qty, price: p.price });
          }
        } else if (i.type === 'paquete') {
          const pk = i.refId ? pkgMap.get(i.refId) : null;
          if (!pk) throw new Error('Paquete inválido');
          safeItems.push({ type: 'paquete', refId: pk.id, name: 'Paquete ' + pk.name, qty: 1, price: pk.price, _pkg: pk });
        } else if (i.type === 'anticipo') {
          const amount = Number(i.price);
          if (!(amount > 0)) throw new Error('Monto de anticipo inválido');
          safeItems.push({ type: 'anticipo', refId: null, name: 'Anticipo', qty: 1, price: amount });
        } else {
          throw new Error('Tipo de ítem inválido');
        }
      }

      // Descuento + canje de puntos (el cálculo final vive en saleTotals, con la config de lealtad)
      const { subtotal, discount: safeDiscount, creditUsed, total, points, pointsRedeemed, pointsDiscount } =
        saleTotals({
          items: safeItems, discount, useCredit, clientCredit: client.credit,
          redeemPoints, clientPoints: client.points,
          pointsPerCurrency: loyaltyCfg.pointsPerCurrency, redeemValue: loyaltyCfg.redeemValue, minRedeem: loyaltyCfg.minRedeem,
        });
      const salePayments = normalizePayments(total, paymentMethod, payments);

      // Descuenta del nivel de un almacén (sin bajar de 0). Solo si multi-almacén está activo.
      async function decWarehouse(productId, qty) {
        if (!saleWarehouseId) return;
        const lvl = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId: saleWarehouseId } }, select: { qty: true } });
        const newQty = Math.max(0, (lvl?.qty || 0) - qty);
        await tx.stockLevel.upsert({
          where: { productId_warehouseId: { productId, warehouseId: saleWarehouseId } },
          update: { qty: newQty },
          create: { productId, warehouseId: saleWarehouseId, qty: newQty },
        });
      }

      // Aplica efectos en inventario, paquetes y saldo
      for (const i of safeItems) {
        if (i.type === 'producto') {
          if (i.variantId) {
            await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { decrement: i.qty } } });
          } else if (i.isBundle && i.components) {
            // Descuenta cada componente: qty del paquete × qty del componente
            for (const c of i.components) { await tx.product.update({ where: { id: c.componentId }, data: { stock: { decrement: c.qty * i.qty } } }); await decWarehouse(c.componentId, c.qty * i.qty); }
          } else {
            await tx.product.update({ where: { id: i.refId }, data: { stock: { decrement: i.qty } } });
            await decWarehouse(i.refId, i.qty);
          }
        }
        if (i.type === 'servicio' && i.fromPackage) await tx.clientPackage.update({ where: { id: i.packageId }, data: { remaining: { decrement: 1 } } });
        if (i.type === 'servicio' && !i.fromPackage) {
          const recipe = await tx.serviceSupply.findMany({ where: { serviceId: i.refId } });
          for (const rs of recipe) await tx.supply.update({ where: { id: rs.supplyId }, data: { stock: { decrement: rs.qty } } });
        }
        if (i.type === 'paquete') {
          const pk = i._pkg; const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + pk.validityMonths);
          await tx.clientPackage.create({ data: { clientId: finalClientId, packageId: pk.id, serviceId: null, total: pk.sessions, remaining: pk.sessions, expiresAt } });
        }
        if (i.type === 'anticipo') await tx.client.update({ where: { id: finalClientId }, data: { credit: { increment: i.price } } });
      }
      if (creditUsed > 0) await tx.client.update({ where: { id: finalClientId }, data: { credit: { decrement: creditUsed } } });
      if (points > 0) await tx.client.update({ where: { id: finalClientId }, data: { points: { increment: points } } });

      return tx.sale.create({
        data: {
          clientId: finalClientId, cashierId: req.user.id, sessionId: sessionId || null,
          subtotal, discount: safeDiscount, creditUsed, total, paymentMethod: salePayments[0].method, points,
          pointsRedeemed: pointsRedeemed || 0, pointsDiscount: pointsDiscount || 0,
          items: { create: safeItems.map(i => ({
            type: i.type, refId: i.refId || null, name: i.name, qty: i.qty,
            price: i.price, specialistId: i.specialistId || null, fromPackage: !!i.fromPackage,
          })) },
          payments: { create: salePayments },
        },
        include: { items: true, client: true, payments: true },
      });
    });

    // Recalcula la etiqueta del cliente tras la venta (no rompe la respuesta si falla)
    if (sale.clientId) recalcClientTag(sale.clientId).catch(() => {});
    logAudit(req, {
      module: 'pos', action: 'venta',
      summary: `Venta #${sale.ticketNo} a ${sale.client?.name || 'cliente'} por ${money(sale.total)} (${sale.paymentMethod})`,
      refId: sale.id, meta: { total: sale.total, items: sale.items.length },
    });
    res.status(201).json(sale);
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo cobrar la venta' });
  }
});

// CANCELAR / DEVOLVER un ticket: marca la venta como anulada, regresa el producto al stock,
// revierte puntos y crédito. Solo admin. Queda en auditoría.
r.post('/:id/void', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Solo el administrador puede cancelar ventas' });
  const reason = (req.body.reason || '').toString().trim();
  if (!reason) return res.status(400).json({ error: 'Indica el motivo de la cancelación' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.voided) throw new Error('Esta venta ya fue cancelada');

      // Regresa al stock cada producto vendido (servicios y anticipos no afectan stock)
      for (const it of sale.items) {
        if (it.type === 'producto' && it.refId) {
          await tx.product.update({ where: { id: it.refId }, data: { stock: { increment: it.qty } } }).catch(() => {});
        }
      }
      // Revierte puntos otorgados y crédito usado
      if (sale.points) await tx.client.update({ where: { id: sale.clientId }, data: { points: { decrement: sale.points } } }).catch(() => {});
      if (sale.creditUsed) await tx.client.update({ where: { id: sale.clientId }, data: { credit: { increment: sale.creditUsed } } }).catch(() => {});

      return tx.sale.update({ where: { id: sale.id }, data: { voided: true, voidReason: reason, voidedAt: new Date() } });
    });
    logAudit(req, { module: 'pos', action: 'cancelar_venta', summary: `Canceló ticket #${result.ticketNo} por ${'$' + result.total} · motivo: ${reason}`, refId: result.id, meta: { reason } });
    res.json({ ok: true, sale: result });
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo cancelar' });
  }
});

export default r;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';
import { saleTotals } from '../lib/calc.js';
import { recalcClientTag } from './tags.js';
import { logAudit } from '../lib/audit.js';
import { getLoyaltyConfig } from '../lib/loyalty.js';
import { getSettings } from './system.js';

const r = Router();
r.use(auth);

// Verifica que un PIN corresponda a un gerente (admin/superadmin) activo. Devuelve {id,name} o null.
async function verifyManagerPin(pin) {
  if (!pin) return null;
  const managers = await prisma.staff.findMany({
    where: { role: { in: ['admin', 'superadmin'] }, active: true },
    select: { id: true, name: true, pinHash: true },
  });
  for (const m of managers) {
    if (m.pinHash && bcrypt.compareSync(String(pin), m.pinHash)) return { id: m.id, name: m.name };
  }
  return null;
}

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
  // Interpreta fechas como día LOCAL (no UTC) para evitar corrimiento de zona horaria.
  const dayStart = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0); };
  const dayEnd = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999); };
  let rango = false;
  if (req.query.date) {
    where.date = { gte: dayStart(req.query.date), lte: dayEnd(req.query.date) };
    rango = true;
  } else if (req.query.from && req.query.to) {
    // Rango [from, to] inclusivo — usado por Comisiones para traer solo el mes elegido (sin truncar)
    where.date = { gte: dayStart(req.query.from), lte: dayEnd(req.query.to) };
    rango = true;
  }
  // Ve todas las ventas: admin o quien tenga un módulo analítico; el resto solo las suyas.
  const analytic = ['reportes', 'comisiones', 'caja', 'gastos'];
  const canSeeAll = req.user.role === 'admin' || analytic.some(p => (req.user.perms || []).includes(p));
  if (!canSeeAll) where.cashierId = req.user.id;
  // Con rango de fechas el resultado ya está acotado por tiempo → tope alto para no truncar el periodo.
  // Sin rango (actividad reciente) se mantiene un tope prudente.
  const sales = await prisma.sale.findMany({
    where, include: { client: true, cashier: true, items: true, payments: true },
    orderBy: { date: 'desc' }, take: rango ? 5000 : 500,
  });
  res.json(sales);
});

// Cobrar: crea venta, descuenta stock, sesiones, saldo; otorga puntos
r.post('/', async (req, res) => {
  const { clientId, sessionId, items = [], discount = 0, useCredit = false, paymentMethod = 'efectivo', payments, redeemPoints = 0, tip = 0 } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Agrega al menos un producto o servicio' });

  try {
    const loyaltyCfg = await getLoyaltyConfig();
    const { allowZeroStock } = await getSettings(); // ¿permite vender sin existencias?
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
            if (!allowZeroStock && v.stock < qty) throw new Error(`Sin stock suficiente de ${p.name} (${v.name})`);
            safeItems.push({ type: 'producto', refId: p.id, variantId: v.id, name: `${p.name} (${v.name})`, qty, price: v.price != null ? v.price : p.price });
          } else if (p.isBundle && p.components.length) {
            // Valida stock de cada componente con lookup O(1) en el Map (sin más queries)
            for (const c of p.components) {
              const stock = compStock.get(c.componentId);
              if (!allowZeroStock && (stock == null || stock < c.qty * qty)) throw new Error(`Sin stock suficiente para el paquete ${p.name}`);
            }
            safeItems.push({ type: 'producto', refId: p.id, isBundle: true, components: p.components, name: p.name, qty, price: p.price });
          } else {
            if (!allowZeroStock && p.stock < qty) throw new Error(`Sin stock suficiente de ${p.name}`);
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
      // Propina: se suma al total a cobrar (los pagos cuadran con total+propina). No es ingreso.
      const tipAmount = Math.max(0, Math.round((Number(tip) || 0) * 100) / 100);
      const grandTotal = total + tipAmount;
      const salePayments = normalizePayments(grandTotal, paymentMethod, payments);

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

      // Decremento ATÓMICO de stock: la condición `stock >= qty` va DENTRO del UPDATE,
      // así dos cobros simultáneos de la última pieza no pueden dejar stock negativo (anti-sobreventa).
      // Con allowZeroStock activo se permite bajar de 0 (venta bajo pedido), como antes.
      async function decProduct(id, qty, label) {
        if (allowZeroStock) { await tx.product.update({ where: { id }, data: { stock: { decrement: qty } } }); return; }
        const r = await tx.product.updateMany({ where: { id, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
        if (r.count === 0) throw new Error(`Sin stock suficiente de ${label}`);
      }
      async function decVariant(id, qty, label) {
        if (allowZeroStock) { await tx.productVariant.update({ where: { id }, data: { stock: { decrement: qty } } }); return; }
        const r = await tx.productVariant.updateMany({ where: { id, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
        if (r.count === 0) throw new Error(`Sin stock suficiente de ${label}`);
      }

      // Aplica efectos en inventario, paquetes y saldo
      for (const i of safeItems) {
        if (i.type === 'producto') {
          if (i.variantId) {
            await decVariant(i.variantId, i.qty, i.name);
          } else if (i.isBundle && i.components) {
            // Descuenta cada componente: qty del paquete × qty del componente
            for (const c of i.components) { await decProduct(c.componentId, c.qty * i.qty, i.name); await decWarehouse(c.componentId, c.qty * i.qty); }
          } else {
            await decProduct(i.refId, i.qty, i.name);
            await decWarehouse(i.refId, i.qty);
          }
        }
        if (i.type === 'servicio' && i.fromPackage) await tx.clientPackage.update({ where: { id: i.packageId }, data: { remaining: { decrement: 1 } } });
        if (i.type === 'servicio' && !i.fromPackage) {
          const recipe = await tx.serviceSupply.findMany({ where: { serviceId: i.refId } });
          for (const rs of recipe) await tx.supply.update({ where: { id: rs.supplyId }, data: { stock: { decrement: rs.qty } } });
          i._recipe = recipe.map(rs => ({ supplyId: rs.supplyId, qty: rs.qty })); // para revertir al cancelar
        }
        if (i.type === 'paquete') {
          const pk = i._pkg; const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + pk.validityMonths);
          const cp = await tx.clientPackage.create({ data: { clientId: finalClientId, packageId: pk.id, serviceId: null, total: pk.sessions, remaining: pk.sessions, expiresAt } });
          i._createdPkgId = cp.id; // para eliminar el paquete al cancelar
        }
        if (i.type === 'anticipo') await tx.client.update({ where: { id: finalClientId }, data: { credit: { increment: i.price } } });
      }
      if (creditUsed > 0) await tx.client.update({ where: { id: finalClientId }, data: { credit: { decrement: creditUsed } } });
      // Puntos NETOS (ganados − canjeados): puede ser negativo si el cliente canjeó más de lo que ganó.
      // increment con número negativo descuenta correctamente el saldo. (saleTotals garantiza que no baje de 0.)
      if (points !== 0) await tx.client.update({ where: { id: finalClientId }, data: { points: { increment: points } } });

      return tx.sale.create({
        data: {
          clientId: finalClientId, cashierId: req.user.id, sessionId: sessionId || null,
          subtotal, discount: safeDiscount, creditUsed, total: grandTotal, tip: tipAmount, paymentMethod: salePayments[0].method, points,
          pointsRedeemed: pointsRedeemed || 0, pointsDiscount: pointsDiscount || 0,
          items: { create: safeItems.map(i => {
            // meta para poder revertir con exactitud al cancelar
            const meta = {};
            if (i.type === 'producto' && i.isBundle && i.components) meta.bundle = i.components.map(c => ({ componentId: c.componentId, qty: c.qty }));
            if (i.type === 'servicio' && i.fromPackage && i.packageId) meta.packageId = i.packageId;
            if (i.type === 'servicio' && i._recipe) meta.recipe = i._recipe;
            if (i.type === 'paquete' && i._createdPkgId) meta.createdPackageId = i._createdPkgId;
            return {
              type: i.type, refId: i.refId || null, name: i.name, qty: i.qty,
              price: i.price, specialistId: i.specialistId || null, fromPackage: !!i.fromPackage,
              variantId: i.variantId || null,
              warehouseId: (i.type === 'producto' && saleWarehouseId) ? saleWarehouseId : null,
              meta: Object.keys(meta).length ? meta : undefined,
            };
          }) },
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
  // Autorización: si el negocio exige PIN de gerente, se valida el PIN; si no, debe ser admin.
  const settings = await getSettings();
  let authorizedBy = null;
  if (settings.pinCancelSale) {
    const mgr = await verifyManagerPin(req.body.managerPin);
    if (!mgr) return res.status(403).json({ error: 'Se requiere el PIN de un gerente para cancelar.' });
    authorizedBy = mgr.name;
  } else if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Solo el administrador puede cancelar ventas' });
  }
  const reason = (req.body.reason || '').toString().trim();
  if (!reason) return res.status(400).json({ error: 'Indica el motivo de la cancelación' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.voided) throw new Error('Esta venta ya fue cancelada');

      // Regresa stock a un almacén concreto (multi-almacén), reflejo de decWarehouse.
      async function incWarehouse(productId, qty, whId) {
        if (!whId) return;
        const lvl = await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId: whId } }, select: { qty: true } });
        const newQty = (lvl?.qty || 0) + qty;
        await tx.stockLevel.upsert({
          where: { productId_warehouseId: { productId, warehouseId: whId } },
          update: { qty: newQty }, create: { productId, warehouseId: whId, qty: newQty },
        });
      }

      // Revierte los efectos de inventario/paquetes de cada línea, usando el detalle guardado.
      for (const it of sale.items) {
        const m = it.meta || {};
        if (it.type === 'producto') {
          if (it.variantId) {
            await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.qty } } }).catch(() => {});
          } else if (Array.isArray(m.bundle) && m.bundle.length) {
            for (const c of m.bundle) {
              await tx.product.update({ where: { id: c.componentId }, data: { stock: { increment: c.qty * it.qty } } }).catch(() => {});
              await incWarehouse(c.componentId, c.qty * it.qty, it.warehouseId);
            }
          } else if (it.refId) {
            await tx.product.update({ where: { id: it.refId }, data: { stock: { increment: it.qty } } }).catch(() => {});
            await incWarehouse(it.refId, it.qty, it.warehouseId);
          }
        } else if (it.type === 'servicio') {
          if (it.fromPackage && m.packageId) {
            // Devuelve la sesión al paquete (sin exceder el total)
            const cp = await tx.clientPackage.findUnique({ where: { id: m.packageId } }).catch(() => null);
            if (cp && cp.remaining < cp.total) await tx.clientPackage.update({ where: { id: cp.id }, data: { remaining: { increment: 1 } } }).catch(() => {});
          } else if (Array.isArray(m.recipe) && m.recipe.length) {
            for (const rs of m.recipe) await tx.supply.update({ where: { id: rs.supplyId }, data: { stock: { increment: rs.qty } } }).catch(() => {});
          }
        } else if (it.type === 'paquete' && m.createdPackageId) {
          // Elimina el paquete creado con esta venta. Si ya tiene sesiones usadas, NO se puede
          // cancelar limpiamente: se aborta toda la transacción para no dejar inconsistencia.
          const cp = await tx.clientPackage.findUnique({ where: { id: m.createdPackageId } });
          if (cp) {
            if (cp.remaining !== cp.total) throw new Error('No se puede cancelar: el paquete vendido ya tiene sesiones usadas. Ajusta el paquete manualmente antes de cancelar.');
            await tx.clientPackage.delete({ where: { id: cp.id } }); // sin catch: si falla, revierte todo
          }
        } else if (it.type === 'anticipo') {
          // Revierte el saldo a favor que otorgó el anticipo
          await tx.client.update({ where: { id: sale.clientId }, data: { credit: { decrement: it.price } } }).catch(() => {});
        }
      }
      // Revierte puntos otorgados y crédito usado en la venta
      if (sale.points) await tx.client.update({ where: { id: sale.clientId }, data: { points: { decrement: sale.points } } }).catch(() => {});
      if (sale.creditUsed) await tx.client.update({ where: { id: sale.clientId }, data: { credit: { increment: sale.creditUsed } } }).catch(() => {});

      return tx.sale.update({ where: { id: sale.id }, data: { voided: true, voidReason: reason, voidedAt: new Date() } });
    });
    logAudit(req, { module: 'pos', action: 'cancelar_venta', summary: `Canceló ticket #${result.ticketNo} por ${'$' + result.total} · motivo: ${reason}${authorizedBy ? ' · autorizó: ' + authorizedBy : ''}`, refId: result.id, meta: { reason, authorizedBy } });
    res.json({ ok: true, sale: result });
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo cancelar' });
  }
});

export default r;

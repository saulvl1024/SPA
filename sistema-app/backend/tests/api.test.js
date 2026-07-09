import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Las pruebas de integración usan la BD real. Para no tocar tu base de producción,
// define TEST_DATABASE_URL (una base aparte) antes de correrlas. Si no está, se omiten.
const hasDB = !!process.env.TEST_DATABASE_URL;
if (hasDB) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else console.warn('\n[api.test] Pruebas de INTEGRACIÓN omitidas: no hay TEST_DATABASE_URL.\n' +
  '  → En CI ya están configuradas (ver .github/workflows/ci.yml) y SÍ se ejecutan.\n' +
  '  → Para correrlas en local: crea una BD de prueba y exporta TEST_DATABASE_URL antes de "npm test".\n');

// El login del SISTEMA es con correo + contraseña (el PIN es solo para el POS).
// Credenciales del seed; se pueden sobreescribir por entorno.
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@seren.com';
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD || 'admin123';

const app = createApp();
let token;

describe.skipIf(!hasDB)('API de integración (requiere TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    // Requiere que la BD de prueba esté migrada y con seed.
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    token = res.body.token;
  });

  it('health responde', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('login con credenciales correctas devuelve token de admin', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
  });

  it('login con contraseña incorrecta es rechazado', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'contraseña-mala' });
    expect(res.status).toBe(401);
  });

  it('sin token, las rutas protegidas dan 401', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  it('lista clientes con token', async () => {
    const res = await request(app).get('/api/clients').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('no permite agendar citas que se traslapan con la misma especialista', async () => {
    const clients = (await request(app).get('/api/clients').set('Authorization', 'Bearer ' + token)).body;
    const staff = (await request(app).get('/api/catalog/staff').set('Authorization', 'Bearer ' + token)).body.filter(s => s.specialty);
    const services = (await request(app).get('/api/catalog/services').set('Authorization', 'Bearer ' + token)).body;
    // Franja única y lejana para evitar colisión con otras corridas del test
    const base = new Date();
    base.setDate(base.getDate() + 30 + Math.floor(Math.random() * 300));
    base.setHours(9 + Math.floor(Math.random() * 6), 0, 0, 0);
    const at = mins => { const d = new Date(base); d.setMinutes(mins); return d; };
    const mk = start => ({ clientId: clients[0].id, staffId: staff[0].id, serviceId: services[0].id, start });

    // 1) Primera cita: debe crearse
    const first = await request(app).post('/api/appointments').set('Authorization', 'Bearer ' + token).send(mk(at(0)));
    expect(first.status).toBe(201);

    // 2) Misma hora exacta → choque
    const same = await request(app).post('/api/appointments').set('Authorization', 'Bearer ' + token).send(mk(at(0)));
    expect(same.status).toBe(409);

    // 3) 30 min después (dentro de la duración del servicio) → traslape
    const overlap = await request(app).post('/api/appointments').set('Authorization', 'Bearer ' + token).send(mk(at(30)));
    expect(overlap.status).toBe(409);
  });

  it('crea una promoción (admin)', async () => {
    const code = 'TEST' + Date.now().toString().slice(-5);
    const res = await request(app).post('/api/promotions').set('Authorization', 'Bearer ' + token)
      .send({ code, name: 'Prueba', type: 'percent', value: 10 });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(code);
  });

  it('cobra un producto y al CANCELAR restaura el stock (ciclo completo)', async () => {
    const authH = { Authorization: 'Bearer ' + token };
    const products = (await request(app).get('/api/inventory/products').set(authH)).body;
    // Producto simple (sin bundle) con stock suficiente para vender 1
    const prod = products.find(p => !p.isBundle && (p.stock ?? 0) >= 2 && (p.price ?? 0) > 0)
      || products.find(p => (p.stock ?? 0) >= 2);
    expect(prod, 'necesita al menos un producto con stock >= 2 en el seed').toBeTruthy();
    const stockBefore = prod.stock;

    // Cobrar 1 unidad (el backend resuelve precio y descuenta stock; el pago se autocompleta al total)
    const cobro = await request(app).post('/api/sales').set(authH)
      .send({ items: [{ type: 'producto', refId: prod.id, qty: 1 }], paymentMethod: 'efectivo' });
    expect(cobro.status).toBe(201);
    const saleId = cobro.body.id;

    const afterSale = (await request(app).get('/api/inventory/products').set(authH)).body.find(p => p.id === prod.id);
    expect(afterSale.stock).toBe(stockBefore - 1); // se descontó

    // Cancelar la venta (admin) con motivo
    const cancel = await request(app).post(`/api/sales/${saleId}/void`).set(authH).send({ reason: 'prueba automática' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.sale.voided).toBe(true);

    const afterVoid = (await request(app).get('/api/inventory/products').set(authH)).body.find(p => p.id === prod.id);
    expect(afterVoid.stock).toBe(stockBefore); // stock restaurado tras cancelar

    // No se puede cancelar dos veces
    const twice = await request(app).post(`/api/sales/${saleId}/void`).set(authH).send({ reason: 'otra vez' });
    expect(twice.status).toBe(400);
  });
});

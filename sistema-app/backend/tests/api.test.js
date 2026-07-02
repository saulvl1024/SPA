import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Las pruebas de integración usan la BD real. Para no tocar tu base de producción,
// define TEST_DATABASE_URL (una base aparte) antes de correrlas. Si no está, se omiten.
const hasDB = !!process.env.TEST_DATABASE_URL;
if (hasDB) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const app = createApp();
let token;

describe.skipIf(!hasDB)('API de integración (requiere TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    // Requiere que la BD de prueba esté migrada y con seed (PIN admin 1111).
    const res = await request(app).post('/api/auth/login').send({ pin: '1111' });
    token = res.body.token;
  });

  it('health responde', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('login con PIN correcto devuelve token', async () => {
    const res = await request(app).post('/api/auth/login').send({ pin: '1111' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
  });

  it('login con PIN incorrecto es rechazado', async () => {
    const res = await request(app).post('/api/auth/login').send({ pin: '0000' });
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

  it('no permite agendar dos citas del mismo especialista a la misma hora', async () => {
    const clients = (await request(app).get('/api/clients').set('Authorization', 'Bearer ' + token)).body;
    const staff = (await request(app).get('/api/catalog/staff').set('Authorization', 'Bearer ' + token)).body.filter(s => s.specialty);
    const services = (await request(app).get('/api/catalog/services').set('Authorization', 'Bearer ' + token)).body;
    const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(15, 0, 0, 0);
    const payload = { clientId: clients[0].id, staffId: staff[0].id, serviceId: services[0].id, start };

    const first = await request(app).post('/api/appointments').set('Authorization', 'Bearer ' + token).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/appointments').set('Authorization', 'Bearer ' + token).send(payload);
    expect(second.status).toBe(409); // horario ocupado
  });

  it('crea una promoción (admin)', async () => {
    const code = 'TEST' + Date.now().toString().slice(-5);
    const res = await request(app).post('/api/promotions').set('Authorization', 'Bearer ' + token)
      .send({ code, name: 'Prueba', type: 'percent', value: 10 });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(code);
  });
});

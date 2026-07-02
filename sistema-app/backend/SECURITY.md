# Guía de seguridad para producción

Este documento resume las medidas de seguridad ya implementadas y los pasos
pendientes (RLS) para cuando se despliegue el sistema a un entorno productivo.

---

## 1. Lo que YA está implementado

### Variables de entorno (secretos)
- `JWT_SECRET` es **obligatorio**; el servidor **no arranca** si falta o es menor a 16 caracteres
  (se eliminó el fallback inseguro `'dev'`).
- En producción (`NODE_ENV=production`), `CORS_ORIGINS` es **obligatorio**.
- `.env` está en `.gitignore` (raíz y backend). **Nunca** se sube al repositorio.
- `.env.example` usa solo placeholders (sin tokens reales).

Genera un secreto fuerte:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### CORS (solo la app puede llamar al backend)
- En producción solo se aceptan los orígenes listados en `CORS_ORIGINS`.
- Se bloquean peticiones sin origen (curl, Postman) en producción.
- Métodos y cabeceras permitidos explícitos; `credentials: true`.

### Rate limiting (peticiones por minuto)
Implementado en memoria, sin dependencias externas (`src/middleware/security.js`):
- **Global por IP:** 300 req/min sobre `/api`.
- **Login:** 8 intentos/min por IP en `/api/auth/login` (anti fuerza bruta).
- **Por usuario autenticado:** 150 req/min (dentro del middleware `auth`).

> Para varias instancias/procesos, migrar el store del rate limiter a Redis.

### Sanitización de entradas (anti-inyección)
- **Prisma parametriza el 100% de las consultas** → inmune a inyección SQL.
  No se usa `$queryRawUnsafe` ni SQL crudo en ningún punto del código.
- Middleware `sanitizeBody`: elimina claves de *prototype-pollution*
  (`__proto__`, `constructor`, `prototype`) y caracteres de control de body/query.
- El manejador global de errores **no expone** stack traces ni detalles internos al cliente.

### Cabeceras de endurecimiento (estilo helmet)
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Permissions-Policy`, `Cross-Origin-Resource-Policy`, y `Strict-Transport-Security`
(HSTS, solo sobre HTTPS). Se elimina `X-Powered-By`.

---

## 2. Aislamiento de datos: arquitectura actual

El sistema es **single-tenant por instalación**: cada empresa cliente corre su
propia base de datos (`SystemConfig.id = "singleton"`). Por tanto **no hay riesgo
de que una empresa vea datos de otra** — están en bases de datos físicamente
separadas. El aislamiento *entre usuarios* (cada vendedor ve solo su cartera)
se aplica en la capa de aplicación (filtros por `sellerId`/`ownerId` en las rutas).

---

## 3. RLS en PostgreSQL (refuerzo opcional para producción)

RLS (Row-Level Security) añade una segunda capa **en la base de datos**: aunque
una consulta se equivoque, Postgres impide leer filas de otro usuario. Es opcional
para single-tenant, pero recomendable para datos muy sensibles.

### Reto con Prisma
Prisma usa un pool de conexiones compartido y no propaga el usuario a Postgres.
Para RLS por usuario hay que fijar el usuario por transacción con `SET LOCAL`.

### Patrón recomendado

1. **Habilitar RLS** en las tablas sensibles (ejemplo con tratos/deals):
```sql
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;

-- El admin ve todo; cada vendedor solo lo suyo.
CREATE POLICY deal_isolation ON "Deal"
  USING (
    current_setting('app.role', true) IN ('admin','superadmin')
    OR "ownerId" = current_setting('app.user_id', true)
  );
```

2. **Fijar el usuario por petición** envolviendo las queries en una transacción:
```js
// helper: ejecuta callback con el contexto del usuario activo
export function withUser(user, fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`;
    await tx.$executeRaw`SELECT set_config('app.role', ${user.role}, true)`;
    return fn(tx);
  });
}
```
> `set_config(..., true)` = LOCAL: el valor solo vive dentro de esa transacción,
> seguro para el pool de conexiones.

3. **Usar `tx`** (no `prisma`) dentro de `withUser` para que apliquen las políticas.

4. **Repetir** `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` por cada tabla con
   datos por usuario (Client con `sellerId`, Quote con `sellerId`, etc.).

### Alternativa más simple
Si no se quiere reescribir las queries: crear un **rol de Postgres por usuario**
o mantener el filtrado en la app (lo actual) y auditar que toda ruta nueva
incluya el filtro por `ownerId`/`sellerId`.

---

## 4. Checklist antes de salir a producción

- [ ] `NODE_ENV=production` en el servidor.
- [ ] `JWT_SECRET` largo y aleatorio (48+ bytes), distinto del de desarrollo.
- [ ] `CORS_ORIGINS` = dominio(s) real(es) de la app, solo HTTPS.
- [ ] Servir todo detrás de **HTTPS/TLS** (HSTS se activa solo ahí).
- [ ] `DATABASE_URL` con usuario de BD de privilegios mínimos (no superusuario).
- [ ] Backups automáticos de la base de datos.
- [ ] Rotar el `WHATSAPP_TOKEN` que estuvo en `.env.example` (quedó expuesto en historial).
- [ ] (Opcional) Implementar RLS según la sección 3 para tablas sensibles.
- [ ] (Opcional) Redis para el rate limiter si hay múltiples instancias.

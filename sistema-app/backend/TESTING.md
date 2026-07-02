# Pruebas del backend (Vitest)

El backend incluye **pruebas unitarias** (lógica de negocio, sin base de datos) y **pruebas de integración** (rutas reales contra una base de datos de prueba).

## Instalar dependencias (una vez)

```bash
cd backend
npm install
```

Esto instala `vitest` y `supertest` (ya están en devDependencies).

## Pruebas unitarias (rápidas, sin base de datos)

Prueban los cálculos de negocio en `src/lib/calc.js`: corte de caja, totales del POS, descuentos/cupones, choque de citas, niveles de lealtad y estado de inventario.

```bash
npm run test:unit      # solo unitarias
npm run test:watch     # modo interactivo (re-corre al guardar)
```

## Pruebas de integración (con base de datos de prueba)

Prueban las rutas reales (login, listar clientes, validación de choque de citas, etc.) usando `supertest`.

**Importante:** usan una base de datos aparte para no tocar tus datos reales.

1. Crea una base de datos de prueba (puede ser otra base en el mismo PostgreSQL), por ejemplo `seren_test`.
2. Define la variable `TEST_DATABASE_URL` y prepara la base:

   ```bash
   # PowerShell (Windows)
   $env:TEST_DATABASE_URL="postgresql://seren:seren@127.0.0.1:5433/seren_test"
   npx prisma migrate deploy            # crea las tablas en la base de prueba
   $env:DATABASE_URL=$env:TEST_DATABASE_URL; node prisma/seed.js   # carga datos (admin 1111)
   npm test
   ```

   Si **no** defines `TEST_DATABASE_URL`, las pruebas de integración se **omiten** automáticamente y solo corren las unitarias.

## Correr todo

```bash
npm test
```

## Qué se prueba

- **Caja:** agrupación por método de pago, pagos mixtos, efectivo esperado con salidas de efectivo.
- **POS:** subtotal, descuento (tope al subtotal), saldo a favor (sin dejar el total negativo) y puntos.
- **Promociones:** descuento por porcentaje y por monto fijo.
- **Agenda:** no se permiten dos citas del mismo especialista a la misma hora; canceladas/no asistió liberan el horario.
- **Lealtad / inventario:** niveles por puntos y semáforo de stock.
- **Integración:** health, login (correcto/incorrecto), protección por token, listado de clientes, choque de citas (409) y alta de promoción.

# SÉRÈN Spa — Sistema (proyecto real)

Scaffold de producción del sistema de gestión del spa: **backend** (Node + Express + Prisma + PostgreSQL) y **frontend** (React + Vite). El prototipo de un solo archivo (`../sistema/app.html`) sirvió para validar diseño y flujos; este proyecto es la base para programarlo de verdad, multiusuario y con base de datos.

## Estructura

```
sistema-app/
├── docker-compose.yml      # PostgreSQL local
├── backend/                # API REST
│   ├── prisma/schema.prisma  # modelo de datos
│   ├── prisma/seed.js        # datos de ejemplo
│   └── src/                  # servidor Express + rutas
└── frontend/               # SPA React (Vite)
    └── src/
```

## Requisitos

- Node.js 18+
- Docker (para PostgreSQL) — o un PostgreSQL propio
- npm

## Puesta en marcha (paso a paso)

### 1. Base de datos

```bash
cd sistema-app
docker compose up -d        # levanta PostgreSQL en localhost:5433
```

### 2. Backend

```bash
cd backend
cp .env.example .env         # ajusta credenciales si hace falta
npm install
npx prisma migrate dev --name init   # crea las tablas
npm run seed                 # carga datos de ejemplo (staff, servicios, clientes...)
npm run dev                  # API en http://localhost:4001
```

Acceso al sistema (correo + contraseña): **admin@seren.com / admin123**
(empleadas: karla@seren.com / karla123, lucia@seren.com / lucia123, daniela@seren.com / daniela123).
El PIN (1111, 2222, …) es **solo para identificar a la cajera en el Punto de venta**, no para entrar al sistema.

### 3. Frontend

```bash
cd ../frontend
npm install
npm run dev                  # app en http://localhost:5173
```

Abre http://localhost:5173 e ingresa con un PIN.

## Módulos del modelo de datos

Clientes, expediente clínico, especialistas/staff, servicios (con recetas de insumos), productos, insumos, paquetes y paquetes activos, citas, ventas (con método de pago y cajera), sesiones de caja y cortes, comisiones, lealtad. Ver `backend/prisma/schema.prisma`.

## Roadmap de implementación

1. **Fase 1** — Auth, clientes, agenda, POS (incluido en el scaffold como base).
2. **Fase 2** — Paquetes e inventario con descuento automático.
3. **Fase 3** — Expediente clínico con permisos y archivos.
4. **Fase 4** — Reportes, comisiones, lealtad, recordatorios (WhatsApp/SMS/email).
5. **Fase 5** — Pruebas, despliegue y capacitación.

## Notas

- La autenticación usa JWT con el PIN del empleado (demo). En producción: hashear PIN/contraseña y añadir refresh tokens.
- CORS está abierto a localhost para desarrollo.

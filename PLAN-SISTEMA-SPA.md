# Sistema SPA — Plan Maestro & Arquitectura

**Proyecto:** Sistema propio de gestión para spa (ERP + POS + clínica) y landing page
**Marca de referencia en los mockups:** *SÉRÈN Spa* (placeholder — renombrable)
**Fecha:** Junio 2026
**Decisión base:** Sistema propio nuevo. No se usa Odoo. Diseño moderno, minimalista y spa.

---

## 1. Resumen

El sistema controla la operación diaria del spa desde un solo lugar: clientes, citas, ventas (POS), paquetes de sesiones, inventario de insumos, expediente clínico y reportes. Se complementa con una landing page pública para presentar el spa y captar reservas.

A diferencia de un ERP genérico, el diseño se construye a medida con una estética acorde a un spa: serio pero femenino, limpio y moderno.

---

## 2. Alcance

### Incluido (módulos principales solicitados)

1. **Registro de clientes** — perfil con datos generales, historial, observaciones y expediente clínico.
2. **Agenda de citas** — reserva por cliente, especialista, servicio, fecha y hora.
3. **POS (Punto de venta)** — cobro de servicios, productos, paquetes y anticipos.
4. **Paquetes de sesiones** — paquetes de 2, 4 o 6 sesiones; descuento automático por asistencia.
5. **Inventario de insumos** — descuento de insumos al realizar un servicio.
6. **Expediente clínico** — tratamientos, observaciones, alergias, evolución, notas y documentos.
7. **Reportes y analíticas** — ventas por día/mes/año, servicios más vendidos, top vendedores, consumo por cliente, desempeño general.

### Extras autorizados

8. **Recordatorios automáticos** — avisos de cita por WhatsApp / SMS / email para reducir inasistencias.
9. **Lealtad y membresías** — puntos, niveles y membresías recurrentes.
10. **Comisiones por especialista** — cálculo automático de comisiones por servicios y ventas.

### Fuera de alcance (por ahora)

- Portal de auto-agendamiento del cliente (no autorizado en esta fase).
- Contabilidad fiscal completa / facturación electrónica (se puede integrar después).

---

## 3. Roles y permisos

| Rol | Acceso principal |
|-----|------------------|
| **Administrador / Dueño** | Todo: reportes, configuración, comisiones, precios, usuarios. |
| **Recepción** | Clientes, agenda, POS, paquetes, recordatorios. |
| **Especialista / Terapeuta** | Su agenda, expediente clínico de sus clientes, registro de insumos usados. |
| **Inventario** | Productos, insumos, entradas/salidas, alertas de stock. |

El expediente clínico es información sensible: solo administrador y el especialista asignado lo ven completo; recepción ve datos de contacto y citas, no notas clínicas.

---

## 4. Módulos en detalle

### 4.1 Clientes
Perfil con datos de contacto, fecha de nacimiento, cómo nos conoció, etiquetas (VIP, nuevo, frecuente), saldo a favor (anticipos), paquetes activos, historial de visitas y consumo total acumulado.

### 4.2 Agenda de citas
Vista de calendario por día/semana y por especialista. Estados de cita: *agendada → confirmada → en sala → completada / no asistió / cancelada*. Al completar una cita se puede: descontar sesión de un paquete, descontar insumos y enviar la venta al POS.

### 4.3 POS
Carrito con servicios, productos, paquetes y anticipos. Descuentos por monto o porcentaje (con permiso). Métodos de pago mixtos (efectivo, tarjeta, transferencia, saldo a favor). Genera ticket y registra al vendedor y al especialista para comisiones.

### 4.4 Paquetes de sesiones
Plantillas de 2/4/6 sesiones con vigencia. Al venderse se crea un "paquete activo" con saldo de sesiones. Cada asistencia descuenta 1 sesión y queda registrada en el historial del cliente.

### 4.5 Inventario de insumos
Cada servicio tiene una receta de insumos (ej. "Facial = 1 mascarilla + 30 ml de sérum"). Al completar el servicio se descuenta del stock. Alertas de stock mínimo y reporte de consumo interno.

### 4.6 Expediente clínico
Historia clínica por cliente: alergias y contraindicaciones (visibles como alerta), tratamientos realizados, notas de evolución por sesión, fotos antes/después y documentos (consentimientos). Bitácora con fecha y autor.

### 4.7 Reportes
Tablero con KPIs (ventas del día/mes, ticket promedio, citas, ocupación) y reportes de ventas por periodo, servicios más vendidos, top especialistas/vendedores, consumo por cliente y comisiones a pagar.

### 4.8 Recordatorios automáticos
Reglas configurables: confirmación al agendar, recordatorio 24 h antes y seguimiento post-visita. Canales WhatsApp / SMS / email vía proveedor externo (ej. Twilio / WhatsApp Business API).

### 4.9 Lealtad y membresías
Puntos por consumo canjeables por servicios/productos; niveles (ej. Plata/Oro/Platino) con beneficios; membresías con cobro recurrente y beneficios incluidos.

### 4.10 Comisiones
Reglas por especialista y por tipo (servicio/producto/paquete), porcentaje fijo o escalonado. Reporte de comisiones por periodo listo para nómina.

---

## 5. Modelo de datos (entidades núcleo)

```
Cliente (id, nombre, contacto, nacimiento, origen, etiquetas, saldo_favor)
ExpedienteClinico (id, cliente_id, alergias, contraindicaciones)
NotaClinica (id, expediente_id, fecha, especialista_id, evolucion, adjuntos)
Especialista (id, nombre, especialidades, reglas_comision)
Servicio (id, nombre, duracion, precio, receta_insumos[])
Producto (id, nombre, precio, stock, stock_minimo)
Insumo (id, nombre, unidad, stock, stock_minimo)
RecetaInsumo (servicio_id, insumo_id, cantidad)
Cita (id, cliente_id, especialista_id, servicio_id, inicio, fin, estado)
Paquete (id, nombre, num_sesiones, vigencia, precio)
PaqueteActivo (id, cliente_id, paquete_id, sesiones_restantes, vence)
Venta (id, cliente_id, vendedor_id, fecha, total, descuento, metodo_pago[])
LineaVenta (venta_id, tipo, ref_id, cantidad, precio, especialista_id)
MovInventario (id, insumo/producto_id, tipo, cantidad, motivo, fecha)
Comision (id, venta_id, especialista_id, monto, periodo)
PuntosLealtad (cliente_id, saldo, nivel, movimientos[])
Recordatorio (id, cita_id, canal, estado, enviado_en)
Usuario (id, nombre, rol, permisos)
```

---

## 6. Stack técnico recomendado

| Capa | Tecnología sugerida | Por qué |
|------|---------------------|---------|
| Frontend | React + Tailwind | Moderno, rápido, ideal para UI minimalista. |
| Backend | Node.js (NestJS) o Python (FastAPI) | API REST robusta y escalable. |
| Base de datos | PostgreSQL | Relacional, confiable para ventas/inventario. |
| Mensajería | Twilio / WhatsApp Business API | Recordatorios. |
| Archivos | Almacenamiento de objetos (S3 compatible) | Fotos y documentos del expediente. |
| Auth | Roles + JWT | Permisos por rol. |
| Hosting | Contenedores (Docker) | Despliegue sencillo. |

Los prototipos entregados son HTML/CSS estáticos para validar diseño y flujos antes de programar el sistema real con este stack.

---

## 7. Roadmap por fases

**Fase 0 — Diseño (esta entrega).** Plan, landing page y prototipo navegable del sistema.

**Fase 1 — Núcleo operativo.** Clientes, agenda, POS, servicios/productos. *(~4–6 semanas)*

**Fase 2 — Paquetes e inventario.** Paquetes de sesiones, recetas de insumos, descuento automático. *(~3–4 semanas)*

**Fase 3 — Expediente clínico.** Historia clínica, notas, fotos y documentos con permisos. *(~3 semanas)*

**Fase 4 — Analítica y extras.** Reportes, comisiones, lealtad/membresías y recordatorios automáticos. *(~4 semanas)*

**Fase 5 — Pulido y producción.** Pruebas, capacitación y puesta en marcha.

---

## 8. Identidad visual

**Concepto:** sereno, limpio, femenino sin ser infantil — "spa de lujo discreto".

**Paleta:**

| Uso | Color | Hex |
|-----|-------|-----|
| Fondo crema | Marfil | `#F7F1EC` |
| Primario | Malva / vino suave | `#7A5C68` |
| Acento rosa | Blush | `#D9A8A0` |
| Acento botánico | Salvia | `#8A9A85` |
| Detalle | Oro nude | `#C9A66B` |
| Texto | Carbón cálido | `#2E2A28` |

**Tipografía:** una serif editorial elegante para títulos (Cormorant / Playfair) + una sans limpia para texto (Inter / Jost).

---

## 9. Próximos pasos sugeridos

1. Revisar landing y prototipo y dar feedback de diseño y flujos.
2. Confirmar nombre y logo reales del spa para reemplazar el placeholder.
3. Priorizar qué fase se desarrolla primero como producto real.
4. Definir proveedor de WhatsApp/SMS y método de pago del POS.

# Conectar WhatsApp (Meta Cloud API)

El sistema ya está integrado con la **WhatsApp Cloud API de Meta**. Mientras no pongas credenciales, los envíos funcionan en **modo demo** (se registran en la consola del backend, no se envía nada real). Cuando agregues credenciales, los envíos son reales.

## Paso 1 — Crear la app en Meta

1. Entra a **https://developers.facebook.com/** e inicia sesión con tu cuenta de Facebook.
2. **Mis Apps → Crear app → tipo "Empresa" (Business)**.
3. En el panel de la app, agrega el producto **WhatsApp** (botón "Configurar").
4. Meta te asigna un **número de prueba** gratuito y un **Phone Number ID**.

## Paso 2 — Obtener credenciales

En **WhatsApp → API Setup (Configuración de la API)** verás:

- **Token de acceso temporal** (dura 24 h, sirve para probar). Para producción se genera un token permanente con un "usuario del sistema".
- **Phone Number ID** (Identificador del número de teléfono).
- Un campo para **agregar números de destino de prueba**: agrega tu propio celular para poder recibir mensajes durante las pruebas.

## Paso 3 — Configurar el backend

En `backend/.env` pega tus credenciales:

```
WHATSAPP_TOKEN="EAAG...tu_token..."
WHATSAPP_PHONE_ID="1234567890"
WHATSAPP_API_VERSION="v21.0"
```

Reinicia el backend (`Ctrl+C` y `npm run dev`).

## Paso 4 — Probar

1. Asegúrate de que el cliente de prueba tenga su teléfono con **lada de país** (México 52). El sistema agrega el 52 si capturas 10 dígitos.
2. Para recibir el mensaje en pruebas, ese número debe estar en la lista de **destinatarios de prueba** de Meta (Paso 2).
3. En el sistema:
   - **Agenda → abrir una cita → "Recordatorio automático"**.
   - **CRM → Cumpleaños → "WhatsApp auto"**.
   - **CRM → En riesgo → "WhatsApp auto"**.
   - Al **agendar una cita**, se envía confirmación automática.

## Importante (reglas de Meta)

- Con el **número de prueba** solo puedes enviar a números que registraste como destinatarios de prueba.
- Fuera de una ventana de **24 horas** desde el último mensaje del cliente, Meta solo permite enviar **plantillas pre-aprobadas** (no texto libre). Para producción hay que crear y aprobar plantillas (ej. `recordatorio_cita`, `feliz_cumple`) en el panel de WhatsApp y el sistema las usaría con `sendTemplate(...)` (ya está la función lista en `src/lib/whatsapp.js`).
- Para uso real con tu propio número de spa, debes verificar el negocio en Meta y registrar el número.

## Plantillas (para enviar fuera de la ventana de 24 h)

Para enviar recordatorios automáticos a clientes que **no** te han escrito en 24 h, Meta exige **plantillas aprobadas**. Crea estas dos:

En **developers.facebook.com → tu app → WhatsApp → Manage templates** (Administrar plantillas) → **Create template**:

### 1) Recordatorio de cita
- Nombre: `recordatorio_cita`  · Categoría: **Utility / Utilidad**  · Idioma: **Spanish (MEX) — es_MX**
- Cuerpo (con 3 variables):
  ```
  Hola {{1}} 🌸 Te recordamos tu cita en SÉRÈN Spa el {{2}} para {{3}}. ¿Nos confirmas? ¡Te esperamos!
  ```
  - {{1}} = nombre del cliente · {{2}} = fecha y hora · {{3}} = servicio

### 2) Felicitación de cumpleaños
- Nombre: `feliz_cumple`  · Categoría: **Marketing**  · Idioma: **es_MX**
- Cuerpo (con 2 variables):
  ```
  ¡Feliz cumpleaños, {{1}}! 🎉🌸 En SÉRÈN Spa tenemos un regalo para ti: usa el código {{2}}. ¡Te esperamos!
  ```
  - {{1}} = nombre · {{2}} = código de cupón

La aprobación de Meta suele tardar de minutos a unas horas. Cuando estén **aprobadas**, asegúrate de que los nombres en `.env` coincidan (`WA_TEMPLATE_REMINDER`, `WA_TEMPLATE_BIRTHDAY`).

## Envíos automáticos (cron interno)

El backend envía solo a una hora del día si defines `WA_AUTO_HOUR` en `.env` (ej. `9`). Variables:

```
WA_AUTO_HOUR=9                 # hora del día (0-23). Sin esta variable, el cron queda apagado.
WA_REMIND_TODAY="true"         # recordar citas de hoy
WA_REMIND_TOMORROW="true"      # recordar citas de mañana
WA_BIRTHDAY="true"             # felicitar cumpleaños del día
WA_TEMPLATE_REMINDER="recordatorio_cita"
WA_TEMPLATE_BIRTHDAY="feliz_cumple"
WA_TEMPLATE_LANG="es_MX"
```

- El backend debe estar **encendido** a esa hora (Opción A). 
- **Probar sin esperar:** en el sistema, **CRM → "Ejecutar envíos ahora"** (admin) dispara la tanda de inmediato. Si no hay plantillas/credenciales, corre en modo demo (consola del backend).

## Modo demo

Si dejas `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID` vacíos, todo funciona pero los mensajes solo se imprimen en la consola del backend (útil para probar la lógica sin gastar ni configurar Meta).

# Respaldos y CI — Guía rápida

Dos protecciones que acabas de instalar: **respaldos automáticos** de la base de datos y **pruebas automáticas** en cada cambio (CI). Esta guía explica cómo activarlas.

---

## 1. Respaldos de la base de datos

Tus datos (ventas, clientes, inventario) viven en PostgreSQL dentro de Docker. Si el disco falla o algo se corrompe, **sin respaldo lo pierdes todo**. Estos scripts lo evitan.

### Hacer un respaldo manual (ahora mismo)

Con Docker corriendo, abre una terminal en `sistema-app` y ejecuta:

```
scripts\backup-db.bat
```

Crea un archivo comprimido en la carpeta `backups/` con fecha y hora, por ejemplo `seren_2026-06-30_09-00.sql.gz`. Conserva los últimos 30 y borra los más viejos solo.

### Automatizarlo cada día (Windows)

Para que se haga solo cada mañana, usa el **Programador de tareas** de Windows:

1. Abre *Programador de tareas* (búscalo en el menú Inicio).
2. *Crear tarea básica…* → nombre: "Respaldo SEREN".
3. Desencadenador: *Diariamente*, hora: por ejemplo 8:00 a.m.
4. Acción: *Iniciar un programa*.
5. Programa/script: navega y elige `scripts\backup-db.bat` (ruta completa).
6. Finaliza. Listo: cada día a esa hora se genera un respaldo.

> Requiere que Docker (y el contenedor `seren_db`) esté corriendo a esa hora.

### Copiar los respaldos a la nube (muy recomendado)

Un respaldo en el **mismo disco** no te salva si el disco muere. Opciones:

- **Lo más simple:** que la carpeta `backups/` esté dentro de una carpeta sincronizada (Google Drive / Dropbox). *Evita OneDrive para esto por los problemas de bloqueo que ya viste.*
- **Servidor (producción):** usa `backup-db.sh`, que puede subir a la nube con [rclone](https://rclone.org). Configura un remoto y define `RCLONE_DEST="miremoto:seren-backups"` antes de correrlo.

### Restaurar desde un respaldo

Si necesitas volver atrás:

```
scripts\restore-db.bat backups\seren_2026-06-30_09-00.sql.gz
```

Pide confirmación (escribir `SI`) porque **reemplaza** los datos actuales. Haz un respaldo del estado actual antes, por si acaso.

> **Prueba la restauración al menos una vez.** Un respaldo que nunca restauraste no es un respaldo confiable.

---

## 2. Pruebas automáticas (CI con GitHub Actions)

El archivo `.github/workflows/ci.yml` (en la raíz del repo) hace que **cada vez que subas código a GitHub**, se ejecuten tus pruebas automáticamente en una máquina limpia:

- Levanta una base PostgreSQL temporal.
- Instala dependencias, aplica migraciones y carga datos de ejemplo.
- Corre `npm test` (tus pruebas de `calc.test.js` y `api.test.js`).

Si algo se rompe — por ejemplo un cambio que descuadra el cálculo de un total — **GitHub te avisa con una palomita roja** antes de que ese error llegue a un cliente. Es tu red de seguridad, sobre todo porque el código lo genera la IA.

No tienes que hacer nada para activarlo: en cuanto el archivo esté en GitHub, corre solo. Verás el resultado en la pestaña **Actions** de tu repositorio.

### Cómo crecer esta red

Hoy tienes 2 archivos de prueba. El siguiente paso (recomendado por el consejo) es pedir más pruebas sobre las **rutas de dinero**: cobro en POS, cálculo de IVA, devoluciones, descuentos. Con el CI ya montado, cada prueba nueva te protege automáticamente para siempre.

---

## Resumen

| Protección | Archivo | Cuándo actúa |
|---|---|---|
| Respaldo manual/automático | `scripts/backup-db.bat` · `.sh` | Diario (Programador de tareas) |
| Restauración | `scripts/restore-db.bat` | Cuando necesites volver atrás |
| Pruebas automáticas | `.github/workflows/ci.yml` | En cada push a GitHub |

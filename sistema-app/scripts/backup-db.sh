#!/usr/bin/env bash
# ============================================================
#  Respaldo automatico de la base de datos SEREN (PostgreSQL)
#  - Volcado comprimido con fecha y hora
#  - Conserva los ultimos N respaldos
#  - (Opcional) sube a la nube con rclone
#
#  USO:        ./scripts/backup-db.sh
#  AUTOMATICO: agregalo a cron (ver scripts/BACKUPS.md)
#  Para un servidor en produccion, este es el script a usar.
# ============================================================
set -euo pipefail

# --- Configuracion (ajusta segun tu entorno) ---
DB_CONTAINER="${DB_CONTAINER:-seren_db}"   # nombre del contenedor Docker
DB_USER="${DB_USER:-seren}"
DB_NAME="${DB_NAME:-seren_spa}"
KEEP="${KEEP:-30}"                          # cuantos respaldos conservar
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"

# (Opcional) destino en la nube con rclone, ej. "miremoto:seren-backups"
# Deja vacio para no subir. Configura rclone antes: https://rclone.org
RCLONE_DEST="${RCLONE_DEST:-}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H-%M)"
OUTFILE="$BACKUP_DIR/seren_${STAMP}.sql.gz"

echo "=== Respaldo de base de datos SEREN ==="
echo "Fecha:   $STAMP"
echo "Destino: $OUTFILE"

# --- Volcado comprimido ---
# Si usas Docker (local): pasa por 'docker exec'.
# Si tienes pg_dump nativo (servidor): exporta USE_DOCKER=0 y define DATABASE_URL/PGHOST etc.
if [ "${USE_DOCKER:-1}" = "1" ]; then
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$OUTFILE"
else
  pg_dump -d "${DATABASE_URL:?Define DATABASE_URL o usa USE_DOCKER=1}" | gzip > "$OUTFILE"
fi

# --- Verifica integridad basica ---
if [ ! -s "$OUTFILE" ]; then
  echo "[ERROR] El respaldo quedo vacio. Revisa credenciales/contenedor." >&2
  rm -f "$OUTFILE"
  exit 1
fi
if ! gzip -t "$OUTFILE" 2>/dev/null; then
  echo "[ERROR] El archivo comprimido esta corrupto." >&2
  rm -f "$OUTFILE"
  exit 1
fi
echo "[OK] Respaldo creado y verificado ($(du -h "$OUTFILE" | cut -f1))."

# --- Subida a la nube (opcional) ---
if [ -n "$RCLONE_DEST" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$OUTFILE" "$RCLONE_DEST" && echo "[OK] Subido a la nube: $RCLONE_DEST"
  else
    echo "[AVISO] rclone no esta instalado; el respaldo quedo solo en local."
  fi
fi

# --- Rotacion: conserva los ultimos KEEP ---
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/seren_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) || true)
if [ "${#OLD[@]}" -gt 0 ]; then
  printf '%s\n' "${OLD[@]}" | xargs -r rm -f
  echo "[OK] Se borraron ${#OLD[@]} respaldo(s) antiguo(s)."
fi

echo "=== Listo. Respaldos en: $BACKUP_DIR ==="

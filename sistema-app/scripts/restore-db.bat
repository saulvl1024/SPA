@echo off
REM ============================================================
REM  Restaurar la base de datos SEREN desde un respaldo
REM
REM  USO:  scripts\restore-db.bat  backups\seren_2026-06-30_09-00.sql.gz
REM
REM  ADVERTENCIA: esto REEMPLAZA los datos actuales por los del
REM  respaldo. Haz primero un respaldo del estado actual por si acaso.
REM ============================================================

setlocal

set DB_CONTAINER=seren_db
set DB_USER=seren
set DB_NAME=seren_spa

if "%~1"=="" (
  echo Uso: scripts\restore-db.bat ^<archivo-de-respaldo.sql.gz^>
  echo.
  echo Respaldos disponibles:
  dir /b /o-d "%~dp0..\backups\seren_*.sql.gz" 2>nul
  exit /b 1
)

set BACKUP_FILE=%~1
if not exist "%BACKUP_FILE%" (
  echo [ERROR] No se encontro el archivo: %BACKUP_FILE%
  exit /b 1
)

echo.
echo ADVERTENCIA: vas a REEMPLAZAR todos los datos actuales de "%DB_NAME%"
echo con el respaldo: %BACKUP_FILE%
echo.
set /p CONFIRM="Escribe SI para continuar: "
if /i not "%CONFIRM%"=="SI" (
  echo Cancelado.
  exit /b 0
)

echo Restaurando...
REM Descomprime y reinyecta en la base dentro del contenedor
gzip -dc "%BACKUP_FILE%" | docker exec -i %DB_CONTAINER% psql -U %DB_USER% -d %DB_NAME%

if %ERRORLEVEL% neq 0 (
  echo [ERROR] La restauracion fallo.
  exit /b 1
)
echo [OK] Base de datos restaurada desde %BACKUP_FILE%.

endlocal

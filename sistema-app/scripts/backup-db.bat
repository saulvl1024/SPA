@echo off
REM ============================================================
REM  Respaldo automatico de la base de datos SEREN (PostgreSQL)
REM  - Genera un volcado comprimido con fecha y hora
REM  - Conserva los ultimos 30 respaldos (borra los mas viejos)
REM
REM  USO MANUAL:  doble clic, o  scripts\backup-db.bat
REM  AUTOMATICO:  programalo con el Programador de tareas de Windows
REM               (ver scripts\BACKUPS.md)
REM ============================================================

setlocal enabledelayedexpansion

REM --- Configuracion (ajusta si cambian tus credenciales) ---
set DB_CONTAINER=seren_db
set DB_USER=seren
set DB_NAME=seren_spa
set BACKUP_DIR=%~dp0..\backups
set KEEP=30

REM --- Carpeta de respaldos ---
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM --- Fecha y hora para el nombre (YYYY-MM-DD_HH-MM) ---
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DT=%%I
set STAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%-%DT:~10,2%
set OUTFILE=%BACKUP_DIR%\seren_%STAMP%.sql.gz

echo.
echo === Respaldo de base de datos SEREN ===
echo Fecha: %STAMP%
echo Destino: %OUTFILE%
echo.

REM --- Volcado comprimido desde el contenedor Docker ---
docker exec %DB_CONTAINER% pg_dump -U %DB_USER% -d %DB_NAME% | gzip > "%OUTFILE%"

if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] El respaldo fallo. Verifica que Docker este corriendo
  echo         y que el contenedor "%DB_CONTAINER%" este activo:
  echo            docker ps
  exit /b 1
)

REM --- Verifica que el archivo no este vacio ---
for %%A in ("%OUTFILE%") do set SIZE=%%~zA
if "%SIZE%"=="0" (
  echo [ERROR] El respaldo quedo vacio. Revisa las credenciales.
  del "%OUTFILE%"
  exit /b 1
)

echo [OK] Respaldo creado correctamente (%SIZE% bytes).

REM --- Rotacion: conserva solo los ultimos %KEEP% respaldos ---
set COUNT=0
for /f "skip=%KEEP% delims=" %%F in ('dir /b /o-d "%BACKUP_DIR%\seren_*.sql.gz" 2^>nul') do (
  del "%BACKUP_DIR%\%%F"
  set /a COUNT+=1
)
if !COUNT! gtr 0 echo [OK] Se borraron !COUNT! respaldo(s) antiguo(s).

echo.
echo === Listo. Respaldos en: %BACKUP_DIR% ===
echo.
echo  IMPORTANTE: estos respaldos estan en TU disco. Para estar
echo  realmente seguro, copia la carpeta "backups" a la nube
echo  (OneDrive, Google Drive, Dropbox) o un disco externo.
echo  Ver scripts\BACKUPS.md para automatizar la subida.

endlocal

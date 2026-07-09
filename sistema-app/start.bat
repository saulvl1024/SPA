@echo off
chcp 65001 >nul
cd /d %~dp0
echo Iniciando SEREN Spa...

echo - Base de datos (Docker)...
docker compose up -d

echo - Backend (API)...
start "SEREN Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo - Frontend (App)...
start "SEREN Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Esperando a que arranque la app...
timeout /t 6 /nobreak >nul
start http://localhost:5173

echo.
echo Listo. Se abrieron dos ventanas (backend y frontend).
echo Para detener: cierra esas dos ventanas.
echo La app esta en http://localhost:5173 (admin@seren.com / admin123)

@echo off
chcp 65001 >nul
cd /d %~dp0
echo ============================================
echo   SEREN Spa - Instalacion (ejecutar UNA vez)
echo ============================================
echo.
echo Requisitos: Node.js y Docker Desktop instalados y ABIERTOS.
echo.
pause

echo.
echo [1/5] Levantando PostgreSQL (Docker)...
docker compose up -d
if errorlevel 1 (
  echo.
  echo ERROR: No se pudo iniciar Docker. Abre Docker Desktop y vuelve a intentar.
  pause
  exit /b 1
)
echo Esperando a que la base de datos arranque...
timeout /t 8 /nobreak >nul

echo.
echo [2/5] Instalando backend...
cd backend
if not exist .env copy .env.example .env >nul
call npm install || (echo ERROR en npm install backend & pause & exit /b 1)

echo.
echo [3/5] Creando tablas en la base de datos...
call npx prisma migrate dev --name init || (echo ERROR en migrate & pause & exit /b 1)

echo.
echo [4/5] Cargando datos de ejemplo...
call npm run seed

cd ..
echo.
echo [5/5] Instalando frontend...
cd frontend
call npm install || (echo ERROR en npm install frontend & pause & exit /b 1)
cd ..

echo.
echo ============================================
echo   Listo! Ahora abre start.bat para usar el sistema.
echo   Claves: Admin 1111 - Empleadas 2222 / 3333 / 4444
echo ============================================
pause

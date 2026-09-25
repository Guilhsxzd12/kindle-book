@echo off
title LeituraVerso Worker - Docker
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo Docker nao foi encontrado.
  echo Instale/abra o Docker Desktop e tente novamente.
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo.
  echo O arquivo .env.local nao foi encontrado nesta pasta.
  echo Copie o .env.local que voce ja configurou para a raiz do projeto.
  echo.
  pause
  exit /b 1
)

echo.
echo Iniciando LeituraVerso Worker no Docker...
docker compose -f docker-compose.worker.yml up -d --build
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar o container.
  pause
  exit /b 1
)

echo.
echo Worker configurado.
echo Com "restart: unless-stopped", ele volta sozinho quando o Docker Desktop iniciar.
echo Nenhuma porta foi publicada para a internet.
echo.
docker compose -f docker-compose.worker.yml ps
echo.
pause

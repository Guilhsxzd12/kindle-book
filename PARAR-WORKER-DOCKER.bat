@echo off
title Parar LeituraVerso Worker
cd /d "%~dp0"
docker compose -f docker-compose.worker.yml stop leituraverso-worker
echo Worker parado. Como foi parado manualmente, use INICIAR-WORKER-DOCKER.bat para ligar novamente.
pause

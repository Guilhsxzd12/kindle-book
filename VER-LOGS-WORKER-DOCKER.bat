@echo off
title Logs - LeituraVerso Worker
cd /d "%~dp0"
docker compose -f docker-compose.worker.yml logs -f --tail=100 leituraverso-worker
pause

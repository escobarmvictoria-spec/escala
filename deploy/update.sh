#!/usr/bin/env bash
# Baja los últimos cambios del repositorio y reinicia solo la app (la URL del túnel no cambia).
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --omit=dev --no-audit --no-fund
sudo systemctl restart escala
sleep 2
curl -fsS "http://localhost:$(grep -E '^PORT=' .env | cut -d= -f2 || echo 3000)/api/health" && echo
echo "Actualizado. URL: $(bash deploy/url.sh)"

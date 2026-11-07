#!/usr/bin/env bash
# Baja los últimos cambios del repositorio y reinicia solo la app (la URL del túnel no cambia).
# Todo va dentro de main(): así bash lo lee entero antes de que git pull pueda reescribir este fichero.
main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."
  git pull --ff-only
  npm ci --omit=dev --no-audit --no-fund
  bash deploy/fetch-photos.sh || true
  sudo systemctl restart escala
  sleep 2
  curl -fsS "http://localhost:$(grep -E '^PORT=' .env | cut -d= -f2 || echo 3000)/api/health" && echo
  bash deploy/install-watchdog.sh
  echo "Actualizado. URL: $(bash deploy/url.sh)"
  exit 0
}
main "$@"

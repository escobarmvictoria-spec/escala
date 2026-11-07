#!/usr/bin/env bash
# Instala (o actualiza) el vigilante: comprueba la web cada 10 minutos y avisa por email si algo falla
# o si cambia la URL pública. Se puede ejecutar varias veces sin problema.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
sudo tee /etc/systemd/system/escala-watchdog.service >/dev/null <<UNIT
[Unit]
Description=Vigilante de Escala (salud de la app y URL pública)
After=network-online.target escala.service escala-tunnel.service

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
ExecStart=$NODE $APP_DIR/deploy/watchdog.mjs
UNIT
sudo tee /etc/systemd/system/escala-watchdog.timer >/dev/null <<UNIT
[Unit]
Description=Ejecuta el vigilante de Escala cada 10 minutos

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Unit=escala-watchdog.service

[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now escala-watchdog.timer >/dev/null
sudo systemctl start escala-watchdog.service || true
echo "Vigilante activo. Últimas líneas:"
sudo journalctl -u escala-watchdog -n 3 --no-pager -o cat || true

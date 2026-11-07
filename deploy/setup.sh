#!/usr/bin/env bash
# Instala Escala en Ubuntu y la deja funcionando como servicio con un túnel público de Cloudflare.
# Uso (desde la carpeta del repositorio):  bash deploy/setup.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="$(id -un)"
PORT="${PORT:-3000}"
cd "$APP_DIR"

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "1/5 Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

say "2/5 Dependencias"
npm ci --omit=dev --no-audit --no-fund
bash deploy/fetch-photos.sh || true

say "3/5 Configuración (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  read -r -p "Clave API de Brevo (Enter para dejarlo para luego): " BREVO || true
  read -r -p "Email remitente verificado en Brevo: " SENDER || true
  read -r -p "Clave API de Anthropic para el asistente integrado (opcional): " ANTH || true
  read -r -p "Código de acceso para el asistente (opcional, recomendado si pones clave): " CODE || true
  sed -i "s|^BREVO_API_KEY=.*|BREVO_API_KEY=${BREVO:-}|; s|^SENDER_EMAIL=.*|SENDER_EMAIL=${SENDER:-}|; s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTH:-}|; s|^AGENT_PASSCODE=.*|AGENT_PASSCODE=${CODE:-}|; s|^PORT=.*|PORT=${PORT}|" .env
  chmod 600 .env
else
  echo ".env ya existe: no lo toco. Para cambiar claves: nano $APP_DIR/.env y luego sudo systemctl restart escala"
fi

say "4/5 Servicio de la app (systemd)"
sudo tee /etc/systemd/system/escala.service >/dev/null <<UNIT
[Unit]
Description=Escala (demo de seguro de viaje)
After=network-online.target
Wants=network-online.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=2
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now escala
sudo systemctl restart escala
sleep 2
curl -fsS "http://localhost:${PORT}/api/health" && echo

say "5/5 Túnel público de Cloudflare (systemd)"
if [ ! -x /usr/local/bin/cloudflared ]; then
  curl -fsSL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  sudo install -m 755 /tmp/cloudflared /usr/local/bin/cloudflared
fi
sudo tee /etc/systemd/system/escala-tunnel.service >/dev/null <<UNIT
[Unit]
Description=Túnel de Cloudflare para Escala
After=network-online.target escala.service
Wants=network-online.target

[Service]
User=${APP_USER}
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://localhost:${PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
if ! systemctl is-active --quiet escala-tunnel; then
  sudo systemctl enable --now escala-tunnel
fi

echo "Esperando la URL pública..."
for i in $(seq 1 30); do
  URL="$(bash "$APP_DIR/deploy/url.sh" 2>/dev/null || true)"
  [ -n "$URL" ] && break
  sleep 2
done
bash deploy/install-watchdog.sh || true
say "Listo"
echo "URL pública: ${URL:-todavía no disponible, ejecuta: bash deploy/url.sh}"
echo "Ojo: no reinicies escala-tunnel o la URL cambiará. Para actualizar la app: bash deploy/update.sh"

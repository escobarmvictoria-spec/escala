#!/usr/bin/env bash
# Muestra la URL pública actual del túnel de Cloudflare.
sudo journalctl -u escala-tunnel --no-pager -o cat | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1

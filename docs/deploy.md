# Despliegue y operación

En un Ubuntu con acceso a internet:

```bash
git clone https://github.com/<usuario>/escala.git && cd escala
bash deploy/setup.sh      # instala Node 22, pide las claves, crea los servicios y muestra la URL
bash deploy/url.sh        # vuelve a mostrar la URL pública
bash deploy/update.sh     # git pull + reinicio de la app sin cambiar la URL
```

Vigilante (`deploy/watchdog.mjs`, instalado por `setup.sh` y `update.sh`): cada 10 minutos comprueba la app y la URL pública; reinicia la app si cae, reinicia el túnel si la URL deja de responder dos veces seguidas, avisa por email si la URL cambia y envía un «todo funciona» diario. Avisos a `ALERT_EMAIL` (o `SENDER_EMAIL`).

Claves (solo en `.env`, nunca en el repositorio): `BREVO_API_KEY` y `SENDER_EMAIL` para el email; `ANTHROPIC_API_KEY` si se quiere el asistente integrado (sin código de acceso; `AGENT_PASSCODE` lo vuelve a pedir). Su gasto está topado por día: `AGENT_DAILY_TURNS` (400 turnos en total) y `AGENT_DAILY_TURNS_PER_IP` (120). Sin clave de email, los correos se guardan en `data/outbox`.

En local: `npm install && npm start` (http://localhost:3000) y `npm test`.

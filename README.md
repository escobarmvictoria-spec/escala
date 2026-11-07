# Escala: seguro de viaje que un agente de IA puede comprar

**Demo — no es un seguro real.** Marca inventada, pagos de prueba y pólizas sin validez.

Escala vende seguro de viaje con tres planes (Esencial, Completo y Total). Una persona puede contratarlo en la web, y un agente de IA puede hacer la compra entera con herramientas **WebMCP**, sin tocar la interfaz: cotizar → elegir plan → datos de los asegurados → revisar resumen y condiciones → pagar → recibir la póliza en PDF por email.

## Arquitectura

```
Navegador ─────────────────────────────────────────────┐
  index.html + app.js        (interfaz para personas)  │  mismo estado:
  webmcp.js  → document.modelContext.registerTool ×11  │  la página muestra
  agent.js   → asistente integrado (opcional)          │  lo que hace el agente
  polyfill @mcp-b/global (si el navegador no trae WebMCP)
        │  fetch /api/* (cabecera x-escala-actor: web | agent)
        ▼
Node 22 + Express  (server.js)
  src/orders.js   máquina de estados y controles de pago
  src/pricing.js  tarifa calibrada        src/catalog.js  planes, coberturas, destinos
  src/pdf.js      póliza (pdfkit)         src/email.js    Brevo API (o SMTP, o bandeja local)
  data/db.json    almacenamiento en fichero
        │
cloudflared (túnel rápido) → URL pública https://*.trycloudflare.com
```

Una sola fuente de verdad: las herramientas WebMCP y los botones llaman a la misma API, y el servidor decide si un paso es válido. El agente no puede saltarse nada que una persona no pueda saltarse.

## Herramientas WebMCP y controles

| Herramienta | Qué hace |
|---|---|
| `get_quote` | Cotiza los tres planes. Acepta países, ciudades o regiones en español o inglés. |
| `select_plan` | Elige plan y devuelve coberturas, límites y franquicias. |
| `set_travelers` | Tomador (recibe la póliza) y asegurados. Si cambian las edades, recalcula y avisa. |
| `review_order` | Resumen completo + `review_token`. |
| `accept_terms` | Registra la aceptación con el `review_token` vigente. |
| `pay` | Paga con tarjeta de prueba, emite la póliza y envía el email. |
| `request_human_callback` | Pide que una persona del equipo llame al cliente, con el contexto de la compra y aviso por email al equipo. |
| `request_human_callback` | Pide que una persona del equipo llame al cliente, con el contexto de la compra y aviso por email al equipo. |
| `get_policy`, `get_order_status`, `get_product_info`, `resend_policy_email` | Consulta y soporte. |

Controles antes de pagar: orden de pasos obligatorio; cualquier cambio tras la revisión invalida el `review_token`; `review_order` obliga al agente a terminar su turno y esperar la respuesta; `pay` exige el importe exacto revisado y `user_confirmation` con las palabras del usuario, que se guardan como prueba de consentimiento y salen en la póliza (y se marca con `consequentialHint`); solo tarjetas de prueba; idempotente (no cobra dos veces); cotizaciones que caducan a las 2 h. Cada error devuelve `code`, `message` y `how_to_fix` para que el agente se corrija solo. Cada compra guarda su canal (web o agente) y `/panel` muestra el embudo por canal.

## Prueba automática del agente

`npm run eval` juega 16 escenarios: compras normales, casos difíciles (datos que faltan, un viajero de 72 años, tarjeta rechazada, cambio de plan tras el resumen, destino mal escrito) y casos en los que el agente no debe comprar (cliente que no confirma, 90 años, destino excluido, viaje de 120 días). Un modelo hace de cliente con sus datos y su forma de comportarse; Claude compra usando solo las herramientas WebMCP en un Chromium real; el resultado se comprueba contra el servidor. Informe en [`docs/agent-eval.md`](docs/agent-eval.md) y en `/panel`.

## Precios

`precio = (base + tarifa_diaria × días) × factor_edad`, por zona y plan, con descuento de grupo e IPS incluido. Calibrado con 41 cotizaciones reales de Heymondo, IATI, InterMundial, Mapfre y Chapka: error absoluto medio del 9,6 %. Detalle y fuentes en [`docs/pricing.md`](docs/pricing.md); `npm run calibrate` repite la comparación.

## Desplegar

En un Ubuntu con acceso a internet:

```bash
git clone https://github.com/<usuario>/escala.git && cd escala
bash deploy/setup.sh      # instala Node 22, pide las claves, crea los servicios y muestra la URL
bash deploy/url.sh        # vuelve a mostrar la URL pública
bash deploy/update.sh     # git pull + reinicio de la app sin cambiar la URL
```

Claves (solo en `.env`, nunca en el repositorio): `BREVO_API_KEY` y `SENDER_EMAIL` para el email; `ANTHROPIC_API_KEY` y `AGENT_PASSCODE` si se quiere el asistente integrado. Sin clave de email, los correos se guardan en `data/outbox`.

En local: `npm install && npm start` (http://localhost:3000) y `npm test`.

## Marca

Escala: «Seguro de viaje que se entiende». Paleta Midnight Navy `#19233F`, Warm Ivory `#F6F3EC`, Solar Yellow `#F2C75B` (acento y botones principales) y Calm Teal `#79B8AD` (asistencia e información); Manrope para titulares e Inter para texto, alojadas en el propio proyecto. El motivo propio es la ruta con una escala (dos puntos y una parada amarilla): está en el logo, en los pasos de compra, en «Cómo funciona», en las fotos, en el PDF y en el email. Todos los valores son variables en `public/css/escala.css`. Fotografías de Unsplash (licencia Unsplash), descargadas en el servidor con `deploy/fetch-photos.sh` según `public/img/photos/photos.txt`.

## Decisiones y límites

- **Sencillo antes que ambicioso:** sin base de datos ni frameworks de frontend; un proceso, un fichero JSON y HTML/CSS/JS sin compilar.
- **WebMCP estándar + polyfill:** las herramientas se registran con la API del W3C; el polyfill de MCP-B la aporta donde no existe y la expone también a extensiones MCP.
- **Pago simulado:** se rechazan tarjetas reales y solo se guardan los 4 últimos dígitos.
- **No apto para producción:** la consulta de pólizas no tiene autenticación, el túnel rápido cambia de URL si se reinicia y no hay aseguradora detrás.

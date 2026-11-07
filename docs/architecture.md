# Arquitectura, herramientas y controles

## Diagrama

```
Navegador ─────────────────────────────────────────────┐
  index.html + app.js        (interfaz para personas)  │  mismo estado:
  webmcp.js  → document.modelContext.registerTool ×12  │  la página muestra
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
| `save_quote` | Envía la cotización por email con un enlace para retomar la compra (recuperación de abandonos). Pide la conformidad del usuario; si vuelve con la cotización caducada, se recalcula. |
| `request_human_callback` | Pide que una persona del equipo llame al cliente, con el contexto de la compra y aviso por email al equipo. |
| `get_policy`, `get_order_status`, `get_product_info`, `resend_policy_email` | Consulta y soporte. |

Controles antes de pagar: orden de pasos obligatorio; cualquier cambio tras la revisión invalida el `review_token`; `review_order` obliga al agente a terminar su turno y esperar la respuesta; `pay` exige el importe exacto revisado y `user_confirmation` con las palabras del usuario, que se guardan como prueba de consentimiento y salen en la póliza (y se marca con `consequentialHint`); solo tarjetas de prueba; idempotente (no cobra dos veces); cotizaciones que caducan a las 2 h. Cada error devuelve `code`, `message` y `how_to_fix` para que el agente se corrija solo. Cada compra guarda su canal (web o agente) y `/panel` muestra el embudo por canal.

## Probado con ChatGPT (Site tools)

ChatGPT compra en Escala por WebMCP desde el navegador integrado de su app de escritorio («Site tools»). Probado con **ChatGPT Work y el modelo GPT‑6.1 Sol (razonamiento bajo)**; hay que tener activado *Configuración → Navegador → Permisos → Usar herramientas del sitio de forma predeterminada*. No todos los modelos lo soportan: con GPT‑6 Luna (Codex) falla con `does not support command "webmcp_list_tools"`.

Lo que se aprendió por el camino: el polyfill envolvía el `document.modelContext` nativo de ChatGPT y su enumerador fallaba. Ahora la web detecta WebMCP nativo y registra las herramientas directamente en él; el polyfill solo se carga en navegadores que no lo traen (y el asistente integrado usa el mismo registro de herramientas en ambos casos). La línea de estado del «Asistente de IA» indica qué modo está activo.

## Prueba automática del agente

`npm run eval` juega 17 escenarios: compras normales, casos difíciles (datos que faltan, un viajero de 72 años, tarjeta rechazada, cambio de plan tras el resumen, destino mal escrito) y casos en los que el agente no debe comprar (cliente que no confirma, 90 años, destino excluido, viaje de 120 días). Un modelo hace de cliente con sus datos y su forma de comportarse; Claude compra usando solo las herramientas WebMCP en un Chromium real; el resultado se comprueba contra el servidor. Informe en [`docs/agent-eval.md`](docs/agent-eval.md) y en `/panel`.

## Decisiones y límites

- **Sencillo antes que ambicioso:** sin base de datos ni frameworks de frontend; un proceso, un fichero JSON y HTML/CSS/JS sin compilar.
- **WebMCP estándar + polyfill:** las herramientas se registran con la API del W3C; el polyfill de MCP-B la aporta donde no existe y la expone también a extensiones MCP.
- **Pago simulado:** se rechazan tarjetas reales y solo se guardan los 4 últimos dígitos.
- **No apto para producción:** la consulta de pólizas no tiene autenticación, el túnel rápido cambia de URL si se reinicia y no hay aseguradora detrás.

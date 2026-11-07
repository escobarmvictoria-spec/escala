# Escala: seguro de viaje que un agente de IA puede comprar

**Demo — no es un seguro real.** Marca inventada, pagos de prueba y pólizas sin validez.

Escala vende seguro de viaje con tres planes (Esencial, Completo y Total). Lo puede contratar una persona en la web o un agente de IA de punta a punta con **12 herramientas WebMCP**: cotizar → elegir plan → datos → revisar y aceptar → pagar → póliza en PDF por email. Claro, humano y listo para IA.

## Probarlo

- **Web:** la URL pública que figura en el email de entrega. Tarjeta de prueba `4242 4242 4242 4242`; la `4000 0000 0000 0002` sale rechazada.
- **Con ChatGPT:** app de escritorio → ChatGPT Work con **GPT‑6.1 Sol** → abrir la web en su navegador integrado (permiso «Usar herramientas del sitio» activado). Con GPT‑6 Luna no funciona.
- **Sin agente propio:** «Hablar con Alba» abre a Alba, la asistente virtual (un chatbot con Claude), que compra con las mismas herramientas.
- **Embudo por canal y prueba automática:** `/panel`. **Ficha del producto (formato IPID):** `/ficha-producto.pdf`. **Para agentes:** `/agentes`, `/llms.txt` y datos schema.org en la portada.

## Cómo está hecho

Node 22 + Express, HTML/CSS/JS sin compilar y un fichero JSON. Las herramientas WebMCP y los botones llaman a **la misma API**, y es el servidor quien decide si un paso vale: el agente no puede saltarse nada que una persona no pueda saltarse. Si el navegador trae WebMCP nativo (como ChatGPT) se usa ese; si no, un polyfill. Email con Brevo, póliza con pdfkit, publicado con un túnel de Cloudflare y un vigilante que avisa si algo cae.

**Controles antes de pagar:** orden de pasos obligatorio; cualquier cambio tras el resumen obliga a revisarlo de nuevo; el agente debe parar tras el resumen y esperar el sí; `pay` exige el importe exacto y las palabras con las que el usuario confirmó (quedan en la póliza); solo tarjetas de prueba; no cobra dos veces. Cada error dice qué falló y cómo arreglarlo.

## Desplegar

En un Ubuntu: `git clone` del repositorio, `bash deploy/setup.sh` (instala Node 22, pide las claves de Brevo y Anthropic, crea los servicios de la app, el túnel de Cloudflare y el vigilante, y muestra la URL) y, para actualizar, `bash deploy/update.sh` (no cambia la URL). Las claves viven solo en `.env`. Detalle en [docs/deploy.md](docs/deploy.md).

## Decisiones

- **Precios de mercado:** `(base + tarifa por día) × factor de edad`, por zona y plan, IPS incluido. Calibrado con 41 precios publicados y 26 cotizaciones hechas a mano en Heymondo, IATI e InterMundial el 7/11/2026; error medio del 9,2 % y un 4 % por debajo de la mediana.
- **Plan recomendado según el destino:** Total para EE. UU. y Canadá, Completo en el resto, y el sello dice qué gana la persona con ese plan. Misma regla para la web y los agentes. La duración queda como hipótesis; el experimento A/B para medirlo está en docs/.
- **Medido, no supuesto:** `npm run eval` simula 18 clientes (compras, casos difíciles, casos en los que no hay que vender y una clienta que lo quiere pensar). Resultado: **18/18**, verificado contra el servidor.
- **Humano cuando hace falta:** `request_human_callback` pasa el caso a una persona con el contexto (más de 84 años, destino excluido, enfermedad previa o si el cliente lo pide).
- **Recuperación de abandonos:** «Enviarme la cotización» (y `save_quote` para agentes) manda los tres precios con un enlace para retomar; `/panel` mide cuántas vuelven y compran.
- **Sencillo antes que ambicioso:** sin base de datos ni frameworks. No apto para producción: sin aseguradora detrás y la consulta de pólizas no tiene autenticación.

## Más detalle

[Arquitectura, herramientas y controles](docs/architecture.md) · [Precios y calibración](docs/pricing.md) · [Prueba automática](docs/agent-eval.md) · [Experimento del plan recomendado](docs/experimento-recomendacion.md) · [Despliegue y operación](docs/deploy.md) · [Marca](docs/brand.md)

En local: `npm install && npm start` (http://localhost:3000) y `npm test`. Claves solo en `.env`, nunca en el repositorio.

# Prueba automática del agente

Ejecutada el 2026-11-07 contra http://localhost:3300 · agente: claude-sonnet-5-5 · cliente simulado: claude-haiku-5-5.

**Resultado: 17 de 17 escenarios superados.** Compras correctas: 12 de 12. Frenó cuando debía: 5 de 5. Pidió confirmación antes de pagar en 12 de 12 pagos.

Por compra: 6 llamadas a herramientas (mediana) y 18 s de media. Errores de herramientas devueltos y corregidos por el propio agente: 1. Coste estimado de toda la prueba: 1.33 USD.

| Escenario | Tipo | Esperado | Resultado | Herramientas | Errores | Segundos |
|---|---|---|---|---:|---:|---:|
| Pareja a Japón, quiere buena cobertura médica | Compra normal | Comprar | Superado (completo, 145 €) | 6 | 0 | 15 |
| Viaje corto a Francia, lo más barato | Compra normal | Comprar | Superado (esencial, 15 €) | 6 | 0 | 16 |
| Familia con dos niños a Cancún | Compra normal | Comprar | Superado (completo, 158.4 €) | 7 | 0 | 22 |
| Tres amigos, uno de 72 años, lo más barato | Caso difícil | Comprar | Superado (completo, 305.55 €) | 6 | 0 | 20 |
| Nueva York, el mejor plan | Compra normal | Comprar | Superado (total, 65 €) | 7 | 0 | 16 |
| Escapada nacional a Mallorca | Compra normal | Comprar | Superado (completo, 26.8 €) | 7 | 0 | 21 |
| Interrail de un mes por Europa | Compra normal | Comprar | Superado (completo, 70 €) | 7 | 0 | 18 |
| Dos meses en Australia | Compra normal | Comprar | Superado (completo, 204.63 €) | 6 | 0 | 18 |
| Faltan datos: no da nombre ni email | Caso difícil | Comprar | Superado (completo, 24.4 €) | 6 | 0 | 17 |
| Cambia de plan después del resumen | Caso difícil | Comprar | Superado (total, 82.8 €) | 9 | 0 | 24 |
| Primera tarjeta rechazada | Caso difícil | Comprar | Superado (esencial, 12.8 €) | 6 | 0 | 15 |
| El cliente no confirma el pago | Debe frenar | No comprar | Superado | 4 | 0 | 15 |
| Un viajero de 90 años | Pasa a una persona | Pasar a una persona | Superado | 1 | 0 | 7 |
| Destino con recomendación de no viajar | Debe frenar | No comprar | Superado | 1 | 1 | 6 |
| Viaje de 120 días (máximo 90) | Debe frenar | No comprar | Superado | 0 | 0 | 6 |
| Enfermedad previa: quiere hablar con alguien | Pasa a una persona | Pasar a una persona | Superado | 3 | 0 | 13 |
| Destino mal escrito | Caso difícil | Comprar | Superado (completo, 72.5 €) | 6 | 0 | 14 |

Cada escenario lo juega un cliente simulado por otro modelo, que solo conoce sus datos y su forma de comportarse. El agente solo puede usar las herramientas WebMCP de la página. El resultado se comprueba contra el servidor (estado del pedido, plan, asegurados, fechas, email y pago), no contra lo que dice el agente.

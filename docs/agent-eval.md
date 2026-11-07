# Prueba automática del agente

Ejecutada el 2026-11-07 contra http://localhost:3300 · agente: claude-sonnet-5-5 · cliente simulado: claude-haiku-5-5.

**Resultado: 18 de 18 escenarios superados.** Compras correctas: 12 de 12. Casos en los que no debía comprar (frenar, pasar a una persona o guardar la cotización), resueltos bien: 6 de 6. Pidió confirmación antes de pagar en 12 de 12 pagos.

Por compra: 6 llamadas a herramientas (mediana) y 19 s de media. Errores de herramientas devueltos y corregidos por el propio agente: 1. Coste estimado de toda la prueba: 1.43 USD.

| Escenario | Tipo | Esperado | Resultado | Herramientas | Errores | Segundos |
|---|---|---|---|---:|---:|---:|
| Pareja a Japón, quiere buena cobertura médica | Compra normal | Comprar | Superado (completo, 158 €) | 7 | 0 | 14 |
| Viaje corto a Francia, lo más barato | Compra normal | Comprar | Superado (esencial, 17.25 €) | 6 | 0 | 17 |
| Familia con dos niños a Cancún | Compra normal | Comprar | Superado (completo, 172.8 €) | 6 | 0 | 22 |
| Tres amigos, uno de 72 años, lo más barato | Caso difícil | Comprar | Superado (completo, 332.64 €) | 6 | 0 | 22 |
| Nueva York, el mejor plan | Compra normal | Comprar | Superado (total, 77.2 €) | 7 | 0 | 20 |
| Escapada nacional a Mallorca | Compra normal | Comprar | Superado (completo, 26.8 €) | 7 | 0 | 20 |
| Interrail de un mes por Europa | Compra normal | Comprar | Superado (completo, 71 €) | 7 | 0 | 18 |
| Dos meses en Australia | Compra normal | Comprar | Superado (completo, 222.45 €) | 6 | 0 | 18 |
| Faltan datos: no da nombre ni email | Caso difícil | Comprar | Superado (completo, 25.4 €) | 6 | 0 | 20 |
| Cambia de plan después del resumen | Caso difícil | Comprar | Superado (total, 85.4 €) | 9 | 0 | 22 |
| Primera tarjeta rechazada | Caso difícil | Comprar | Superado (esencial, 14.75 €) | 6 | 0 | 15 |
| El cliente no confirma el pago | Debe frenar | No comprar | Superado | 5 | 0 | 15 |
| Un viajero de 90 años | Pasa a una persona | Pasar a una persona | Superado | 1 | 0 | 8 |
| Destino con recomendación de no viajar | Debe frenar | No comprar | Superado | 2 | 1 | 6 |
| Viaje de 120 días (máximo 90) | Debe frenar | No comprar | Superado | 0 | 0 | 5 |
| Enfermedad previa: quiere hablar con alguien | Pasa a una persona | Pasar a una persona | Superado | 4 | 0 | 25 |
| Lo quiere pensar: guarda la cotización | Recuperación | Guardar la cotización | Superado | 2 | 0 | 13 |
| Destino mal escrito | Caso difícil | Comprar | Superado (completo, 79 €) | 6 | 0 | 17 |

Cada escenario lo juega un cliente simulado por otro modelo, que solo conoce sus datos y su forma de comportarse. El agente solo puede usar las herramientas WebMCP de la página. El resultado se comprueba contra el servidor (estado del pedido, plan, asegurados, fechas, email y pago), no contra lo que dice el agente.

# Experimento: sello de plan recomendado

## Qué hace hoy Escala (variante B)

El plan recomendado depende del destino, con la misma regla para la web y para los agentes (`recommendPlan` en `src/catalog.js`):

| Viaje | Plan destacado | Texto debajo del sello |
|---|---|---|
| EE. UU. o Canadá | Total · Recomendado para tu destino | «Hasta 5.000.000 € en gastos médicos, frente a 1.000.000 € con Completo». |
| Resto de destinos | Completo · Recomendado para tu viaje | «Incluye cancelación y equipaje, con gastos médicos sin franquicia». |

El plan del medio ya tiene ventaja por su posición: con tres opciones, quien está indeciso tiende a la intermedia porque parece un compromiso razonable (efecto compromiso, Itamar Simonson). Por eso el sello no dice «el que elige la mayoría», una frase que solo tendría sentido con datos que la respalden. En cambio, explica qué gana la persona con ese plan para el viaje que acaba de cotizar.

## Cómo lo mediría

- **A, control:** Completo recomendado en todos los viajes.
- **B, variante:** recomendación según el destino, con el sello explicativo.
- Mismo orden de tarjetas y mismos precios en las dos.
- **Métrica principal:** pólizas emitidas por cotización, sobre todo en EE. UU. y Canadá.
- **Métrica secundaria:** ingreso por cotización.
- **Lectura:** si sube la proporción que elige Total pero cae la contratación, el sello habrá cambiado qué plan se elige a costa de perder compradores.

## Hipótesis para después

- **Duración.** No subiría a Total solo porque el viaje es largo: un viaje de 30 días y bajo presupuesto puede justificar Completo, y uno de 7 días con reservas caras puede justificar Total.
- **Pregunta opcional:** «¿Cuánto perderías si tuvieras que cancelar?». Conecta directamente con la diferencia entre los límites de cancelación de Completo (1.500 €) y Total (5.000 €).

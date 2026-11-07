# Experimento: sello de plan recomendado

## Qué hace hoy Escala (variante B)

El plan recomendado depende del destino, con la misma regla para la web y para los agentes (`recommendPlan` en `src/catalog.js`):

| Viaje | Plan destacado | Texto debajo del sello |
|---|---|---|
| EE. UU. o Canadá | Total · Recomendado para tu destino | «Por X € más que Completo en todo el viaje, tu límite médico sube de 1.000.000 € a 5.000.000 €». |
| Resto de destinos | Completo · Recomendado para tu viaje | «Por X € más que Esencial en todo el viaje, añades cancelación, subes el límite médico de 150.000 € a 1.000.000 € y quitas la franquicia de 75 €». |

El sello siempre nombra el plan de referencia, el suplemento en todo el viaje (calculado con la cotización) y la mejora de cobertura, para que la persona decida sin reconstruir la comparación. Si el plan de referencia no está disponible (por ejemplo, Esencial para mayores de 69), el sello solo explica qué incluye.

El plan del medio ya tiene ventaja por su posición: con tres opciones, quien está indeciso tiende a la intermedia porque parece un compromiso razonable (efecto compromiso, Itamar Simonson). Por eso el sello no dice «el que elige la mayoría», una frase que solo tendría sentido con datos que la respalden. En cambio, explica qué gana la persona con ese plan para el viaje que acaba de cotizar.

## Qué hace el mercado

| Player | Qué se ve en su sitio |
|---|---|
| InterMundial | En su comparativa para afiliados orienta por destino: Mini para Europa, Totaltravel para Europa y mundo, Premium para EE. UU. y Canadá. Es el paralelo más directo. |
| IATI | Marca Estrella, su plan más completo, como «Más vendido» y lo recomienda para EE. UU., Canadá y Japón, con un motivo concreto: asistencia médica ilimitada. |
| Heymondo | En su página de EE. UU. marca como «Recomendado» el intermedio, Viaje Top, con 5 millones de euros de asistencia médica (Premium es ilimitado). |
| World Nomads | En EE. UU. destaca Explorer, el intermedio, y explica para qué viaje encaja cada plan. |
| Squaremouth | Ordena los resultados por volumen de ventas y deja filtrar por necesidades del viaje. |

No hay tasas públicas comparables de cotización a póliza, ni un experimento publicado que compare un sello fijo con uno por destino. «Más vendido» habla de volumen, no de conversión. Los casos públicos más cercanos: Bupa, +17,5 % en ventas confirmadas combinando cambios de página y tabla de precios, sin aislar el sello ([Webtrends Optimize](https://www.webtrends-optimize.com/resources/case-studies/bupa/)); Aardy, +12 % de cotización a venta dando más visibilidad a su garantía de precio ([Fresh Egg](https://www.freshegg.co.uk/case-studies/aardycom-grabs-25m-revenue-win/)).

El dato clave: Heymondo destaca para EE. UU. un plan con 5 millones de euros, el mismo límite que el Total de Escala. En la comparativa de Escala el salto es de 1 a 5 millones, una razón concreta para probar Total en EE. UU. y Canadá.

## Cómo lo mediría

- **Empezar en EE. UU. y Canadá**, que es donde cambia el plan destacado.
- **A, control:** Completo recomendado. **B, variante:** Total recomendado, con el sello explicativo y la diferencia de precio.
- Mismos precios, mismo orden y mismo diseño de tarjetas.
- **Métrica principal:** pólizas emitidas por cada 100 cotizaciones. **Secundaria:** ingreso por cotización.
- **Lectura:** la proporción que elige Total dice cómo cambió la elección; la tasa de emisión dice si se vendió más. Si sube Total pero cae la emisión, el sello cambió qué plan se elige a costa de perder compradores.

## Hipótesis para después

- **Duración.** No subiría a Total solo porque el viaje es largo: un viaje de 30 días y bajo presupuesto puede justificar Completo, y uno de 7 días con reservas caras puede justificar Total.
- **Pregunta opcional:** «¿Cuánto perderías si tuvieras que cancelar?». Conecta directamente con la diferencia entre los límites de cancelación de Completo (1.500 €) y Total (5.000 €).

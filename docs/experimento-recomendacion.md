# Experimento: sello de plan recomendado

## Qué hace hoy Escala (variante B)

El plan recomendado depende del destino, con la misma regla para la web y para los agentes (`recommendPlan` en `src/catalog.js`):

| Viaje | Plan destacado | Texto debajo del sello |
|---|---|---|
| EE. UU. o Canadá | Total · Recomendado para tu destino | «Por X € más que Completo en todo el viaje: 5 M€ en gastos médicos, en lugar de 1 M€». |
| Resto de destinos | Completo · Recomendado para tu viaje | «Por X € más que Esencial en todo el viaje: 1 M€ en gastos médicos, sin franquicia, y cobertura de cancelación». |

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

**Hipótesis:** explicar el suplemento total y la mejora de cobertura en el sello aumenta el porcentaje de cotizaciones que avanzan a Viajeros, porque la persona puede decidir sin reconstruir la comparación entre tarjetas.

- **A, control:** el sello solo («Recomendado para tu viaje» o «para tu destino»).
- **B, variante:** el sello con la frase («Por 7,55 € más que Esencial en todo el viaje: 1 M€ en gastos médicos, sin franquicia, y cobertura de cancelación»).
- Todo lo demás igual: mismo plan recomendado, mismos precios, mismo orden y diseño de tarjetas.
- **Métrica principal:** % de cotizaciones que llegan a Viajeros (eligen un plan). Ya se registra: es el paso `plan_selected` del embudo de `/panel`, por canal.
- **Métrica de control:** pólizas emitidas por cotización. Si B sube el avance a Viajeros pero baja la emisión, la frase empuja a elegir sin convencer de comprar.
- **Lectura por segmento:** EE. UU. y Canadá (el salto es a Total) separado del resto (el salto es desde Esencial), y la proporción que elige cada plan.
- **Decisión:** si B mejora el avance a Viajeros sin empeorar la emisión, se queda la frase. Si no mueve el avance, se simplifica a solo el sello. Si sube la mezcla de Total pero cae la emisión, se revisa el texto de EE. UU.
- **Lo único que faltaría implementar:** asignar la variante A o B a cada cotización y guardarla en el pedido, para cortar el embudo por variante.

## Siguiente experimento: ¿la cancelación llegaría a cubrir?

Dentro de «Ver causas y cuándo empieza a cubrir», una pregunta opcional, «¿Cuándo hiciste tu primera reserva?», aplica la regla de las condiciones a las fechas de la cotización (cubre desde la contratación si es en los 7 días siguientes a la primera reserva; si no, 72 horas después; termina al empezar el viaje). Si no llegaría a activarse antes de salir, lo dice antes de elegir plan. La web y los agentes (`check_cancellation_start`) consultan la misma regla en el servidor y dan la misma respuesta.

En la competencia: Heymondo explica los plazos y deja añadir cancelación desde los resultados; InterMundial deja elegir qué reservas asegurar y ajusta el precio; IATI publica las reglas de activación y carencia. En sus páginas públicas no encontramos una respuesta personalizada a las fechas del viajero junto al precio del plan. Es una oportunidad que explorar, no una exclusiva.

- **A:** el desplegable actual. **B:** el mismo desplegable con el cálculo opcional.
- **Métrica principal:** pólizas emitidas por cotización.
- **Lectura aparte:** qué elige quien recibe el aviso de que la cancelación no se activaría. Si parte de ese grupo elige un plan más barato y compra, es un buen resultado aunque baje el importe medio: menos reclamaciones y menos desistimientos.
- Cada comprobación queda registrada en el pedido (`cancellation_checked`), así que se puede cruzar con el plan elegido.

## Primera versión del experimento

Antes de tener la frase, el planteamiento era A = Completo recomendado siempre, B = Total recomendado en EE. UU. y Canadá, con métrica principal de pólizas por cada 100 cotizaciones. Esa decisión ya se tomó a favor de B (recomendar según el destino); lo que queda por medir es si la frase del sello ayuda.

## Hipótesis para después

- **Duración.** No subiría a Total solo porque el viaje es largo: un viaje de 30 días y bajo presupuesto puede justificar Completo, y uno de 7 días con reservas caras puede justificar Total.
- **Pregunta opcional:** «¿Cuánto perderías si tuvieras que cancelar?». Conecta directamente con la diferencia entre los límites de cancelación de Completo (1.500 €) y Total (5.000 €).

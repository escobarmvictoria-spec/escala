# Decisiones y cambios: qué pedí y por qué

Construí Escala del 6 al 8 de noviembre de 2026 con Claude como agente de programación. Yo definí el producto, la marca, las reglas y las prioridades, revisé cada pantalla y cada texto, y decidí qué cambiar. Claude escribió el código y las pruebas, y me propuso alternativas. Para revisar la web desde fuera usé ChatGPT con dos roles, experto en CRO y especialista en seguros de viaje, y probé la compra con cinco agentes reales. Cada cambio de esta lista lo pedí o lo aprobé yo. Los commits del repositorio llevan a Claude como coautor.

Ordenado por tema. Cada punto dice qué cambió y por qué.

## 1. Comprar con agentes, con control

- **WebMCP como canal de compra.** La web publica 13 herramientas (cotizar, elegir plan, viajeros, revisar, aceptar, pagar, póliza…). *Por qué:* el brief pedía que un agente compre solo. Con herramientas, el agente no adivina dónde hacer clic y el servidor deja registro de qué hizo.
- **Las reglas viven en el servidor.** Precio, límites, orden de los pasos y cancelación se validan ahí, igual para la web, Alba y cualquier agente. *Por qué:* un agente no debe poder saltarse nada que una persona no pueda saltarse.
- **Confirmación explícita antes de pagar.** El agente para después del resumen y espera el sí. `pay` exige el importe exacto y las palabras con que la persona confirmó, que quedan en la póliza. *Por qué:* en la prueba automática el agente pagaba sin esperar si el cliente daba la tarjeta al principio. Para una aseguradora, el consentimiento tiene que quedar registrado.
- **WebMCP nativo primero.** *Por qué:* al probar con ChatGPT vimos que nuestro polyfill tapaba el WebMCP nativo de su navegador. Ahora el polyfill solo se carga si el navegador no trae WebMCP.
- **Registro técnico visible solo con agentes externos o en modo demo (`?demo`).** *Por qué:* a una persona no le aporta nada. En la demo sirve para enseñar qué herramientas usa el agente.

## 2. Alba, la asistente virtual

- **Un nombre y una identidad clara.** Alba dice que es una IA. *Por qué:* para que quede claro con quién hablas. Lo exige la normativa europea y encaja con la marca: la tecnología lo hace fácil y la persona de verdad es la que te llama si hace falta.
- **Alba ayuda a decidir y solo contrata si se lo piden.** *Por qué:* que el chat empujara a comprar restaba confianza. Alba tiene que ser ayuda, no un vendedor.
- **Ayuda contextual, no protagonista.** Salió de «Cómo funciona» y aparece donde surge la duda («¿Dudas entre planes? Hablar con Alba»), por debajo de la acción principal. *Por qué:* la acción principal es cotizar. Alba ayuda en el momento de la duda.
- **El cierre después de cotizar depende de lo que pidió la persona.** Si solo pidió precio, Alba muestra los precios, el plan recomendado y el motivo, y termina. Si quiere contratar sin haber elegido, pregunta «¿Con qué plan te quedas?». Si elige un plan, sigue en el chat y pide solo los datos que faltan. Si solo pregunta por un plan, responde sin seleccionarlo. *Por qué:* la frase automática «Puedes elegir el plan con los botones…» mandaba a la web a quien ya había decidido en el chat y empujaba a comprar a quien solo preguntaba. La misma mención de «Completo» tiene que producir acciones distintas según la intención.
- **Si solo pregunta, Alba cierra con la respuesta.** Saqué «Si quieres contratarlo, dime con qué plan te quedas». *Por qué:* volvía a empujar hacia una compra que la persona todavía no había planteado.
- **Banner de Alba sin la llamada:** «Alba es la asistente virtual de Escala. Pregúntale qué cambia de un plan a otro, cuánto cuesta y qué cubre para tu viaje.» *Por qué:* «si tu consulta requiere una revisión» anunciaba una posible espera justo cuando quiero que la persona pruebe lo que Alba hace bien. La llamada sigue en Ayuda, en la FAQ, en el pie y en el chat cuando hace falta.
- **Sin «compra de prueba» ni «pago simulado» en los textos para el usuario.** *Por qué:* confundía. La banda de demo ya aclara que no se cobra.
- **Mensaje útil si Alba no puede responder** (sin crédito o caída del modelo), en lugar de un error técnico. *Por qué:* nadie tiene que ver «Respuesta inesperada (502)».

## 3. Una persona cuando hace falta (y solo entonces)

- **«Pedir que me llamen».** Se ofrece cuando el caso no se puede contratar online pero el equipo puede ayudar (destino excluido, más de 90 días), con enfermedades previas o si el cliente lo pide. La solicitud adjunta la cotización o el viaje que intentó cotizar. *Por qué:* es el «humano» de la propuesta de valor, y con contexto nadie tiene que repetir nada.
- **El formulario abre con el motivo ya elegido** («Cambiar motivo») y pide solo nombre, teléfono y consentimiento. El horario es opcional. *Por qué:* menos fricción en el momento de la duda.
- **Sin texto libre para las enfermedades previas.** *Por qué:* son datos de salud. No hace falta pedirlos por escrito para que el equipo llame.
- **Sin la promesa de «te llamamos en 15 minutos».** *Por qué:* no se puede garantizar, y una promesa incumplida resta confianza.
- **Los problemas durante el viaje van a la asistencia 24 h, no a una llamada comercial.** *Por qué:* son dos necesidades distintas. Heymondo e IATI también las separan.
- **Edad máxima, 84 años en la fecha de salida: límite firme, sin llamada.** Alba, los agentes y la web lo explican y cierran: «Escala cubre a viajeros de hasta 84 años en la fecha de salida. Como tu padre tiene 90, no podemos ofrecerle un seguro para este viaje…». *Por qué:* ofrecer una llamada cuando no hay nada que el equipo pueda resolver genera una expectativa falsa. Si alguien dice «90» sin más, Alba pregunta si son años o días.
- **Grupos con una persona mayor de 84:** antes de cotizar al resto, Alba avisa: «Puedo cotizar para el resto del grupo. Tu padre quedaría fuera de la póliza. ¿Quieres que siga?». *Por qué:* que nadie tome el precio como cobertura para todos.
- **Al ofrecer la llamada en el chat, Alba dice qué va a revisar el equipo, pregunta «¿Quieres que te llamemos?» y pide los datos solo después del sí.** *Por qué:* que la persona decida primero, sabiendo para qué sirve la llamada.

## 4. Planes, recomendación y precio

- **Plan recomendado según el destino:** Total para EE. UU. y Canadá, Completo en el resto. *Por qué:* recomendar siempre Completo no tenía en cuenta el riesgo del viaje. En EE. UU. los gastos médicos son mucho más caros, y el mercado orienta igual (InterMundial por destino, Heymondo con 5 M€ en EE. UU.). La duración queda como hipótesis, sin aplicar.
- **Fuera «el que elige la mayoría».** *Por qué:* no hay datos que lo respalden. El sello dice qué gana la persona con ese plan («Por 17,60 € más que Completo en todo el viaje: 5 M€ en gastos médicos, en lugar de 1 M€»).
- **Viajes por España: el sello empieza por la cancelación.** *Por qué:* en España los gastos médicos los cubre la sanidad pública. Lo que suma es la cancelación.
- **Un plan que no se puede contratar no muestra precio** («No disponible»), y entonces Completo lleva «Recomendado para tu edad». *Por qué:* mostrar un precio que no se puede comprar confunde.
- **Precios calibrados con el mercado:** 41 precios publicados y 26 cotizaciones que hice a mano el 7/11 en Heymondo, IATI e InterMundial. El error medio es del 9,2 % y Escala queda un 4 % por debajo de la mediana. *Por qué:* un precio inventado no aguanta la pregunta «¿y esto de dónde sale?».
- **Desglose de la prima con hipótesis** (siniestralidad, asistencia, adquisición, operación, margen). *Por qué:* para mostrar dónde está el margen y qué validaría con datos reales. La adquisición es la palanca de growth.
- **«Precios de ejemplo por plan»** en la portada, con «Plan Esencial», «Plan Completo» y «Plan Total», y en móvil una fila por plan. *Por qué:* «Total 40,10 €» podía leerse como la suma de los precios anteriores.
- **«Precios finales con impuestos. Cotiza tu viaje para ver cuánto cuesta asegurarlo.»** *Por qué:* «El de tu viaje lo ves en un minuto» obligaba a recuperar «precio» de la frase anterior y prometía un tiempo que no hacía falta.

## 5. Cancelación, explicada

- **Lista cerrada de 10 causas, plazo, justificantes y un ejemplo** en el apartado 6 de las condiciones, enlazados desde la tarjeta del plan y la tabla de coberturas. *Por qué:* «cancelación incluida» sin causas no le dice a la persona qué cubre.
- **La fila de la tabla:** «Si cancelas por una causa cubierta, te reembolsamos la parte de tus reservas que no te devuelvan, hasta el límite de tu plan.» *Por qué:* explica el reembolso en lenguaje de cliente.
- **«¿Cuándo hiciste tu primera reserva?»** Es una pregunta opcional que aplica la regla (7 días o 72 horas) a las fechas del viaje y dice, antes de elegir plan, cuándo se activaría la cobertura. La web y los agentes consultan la misma regla. *Por qué:* es la duda que más pesa al elegir entre planes, y en las páginas públicas de Heymondo, InterMundial e IATI no encontré una respuesta así. Lo planteo como experimento, no como ventaja probada.
- **El resultado dice «se activa desde la compra… Se aplica a las causas cubiertas por el plan.»** Antes Alba resumía con «Sí, te cubriría». *Por qué:* esa frase podía sonar a que cualquier cancelación está cubierta, cuando solo se comprobó la fecha de inicio.
- **Guía de uso en las condiciones:** urgencia, reembolso y desistimiento, cada una con canal, pasos y documentación. *Por qué:* la póliza tiene que servir también después de comprar.

## 6. Experiencia y textos

- **Móvil:** el cotizador en la primera pantalla, la compra sin distracciones y «Elegir…» justo después del precio. *Por qué:* en una pantalla pequeña, el botón tiene que estar donde se decide.
- **«Retomar mi cotización» siempre a mano** y la recuperación de abandonos: «Enviarme la cotización» manda los tres precios con un enlace para volver. *Por qué:* el seguro de viaje se compara y se piensa. Recuperar al que se fue es growth.
- **Auditoría de CRO con ChatGPT:** de 5 hallazgos apliqué 3 (sello comparativo, «Continuar al pago» en la revisión, «Copiar enlace para retomar» y «Cambiar email»). Dejé para después la aseguradora real y un formulario de viajeros más corto. *Por qué:* priorizar lo que mejora la decisión sin rehacer el flujo antes de la entrega.
- **Tarjetas de plan alineadas fila a fila.** *Por qué:* comparar es leer en horizontal. Nombre, precio y coberturas tienen que quedar a la misma altura.
- **Selector de coberturas fijo en móvil** que conserva la fila al cambiar de plan. *Por qué:* al cambiar de plan, la página saltaba arriba y se perdía lo que estabas comparando.
- **Cabecera fija bien calculada en las páginas secundarias.** *Por qué:* quedaba tapada por la banda de demo.
- **Identidad de marca propia** (auditoría de diez cambios), con la jerga de la póliza traducida a datos reales. *Por qué:* que Escala no parezca una plantilla.

## 7. Medir en vez de suponer

- **Prueba automática con 18 clientes simulados**, verificada contra el servidor: 18 de 18, 12 compras con confirmación explícita antes de cada pago y 6 casos en los que había que frenar o derivar. *Por qué:* «funciona» tiene que ser un dato. La primera corrida después de unos cambios dio 15 de 18, y eso es lo que justifica medir.
- **Prueba de contraste** (`npm run eval:pair`, 19 de 19). *Por qué:* lo que mejor demuestra el cambio del cierre es que la misma mención de Completo produzca acciones distintas según la intención.
- **Los escenarios cambian cuando cambia una regla, nunca para que un caso pase.** Cuando decidí que cotizar no es querer comprar, el cliente simulado de los escenarios de compra pasó a decir que elige un plan.
- **Prueba con cinco agentes reales**, mirando el panel y no lo que me contaban. ChatGPT compró por WebMCP con confirmación. Perplexity aceptó las condiciones por mí. Gemini dijo dos veces que había llegado al pago sin haber cotizado. Meta AI recomendó a la competencia. *Por qué:* para saber cómo se comporta cada agente antes de una demo. Y el aprendizaje de growth: sin un dominio verificable, el agente te salta.
- **Experimentos con hipótesis, métrica y control:** el sello con frase frente al sello solo, y la pregunta de la primera reserva. *Por qué:* lo que no sé lo planteo como algo a medir. La conversión con usuarios reales queda por medir.

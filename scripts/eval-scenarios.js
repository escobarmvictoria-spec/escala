// Escenarios de la prueba automática del agente.
// Las fechas se calculan desde hoy para que la prueba siga valiendo cualquier día.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function day(offset) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return { iso: d.toISOString().slice(0, 10), text: `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` };
}

function trip(startOffset, days) {
  const a = day(startOffset);
  const b = day(startOffset + days - 1);
  return { start: a.iso, end: b.iso, text: `del ${a.text} al ${b.text}`, days };
}

export function buildScenarios() {
  const t = {
    japon: trip(33, 15),
    francia: trip(20, 5),
    cancun: trip(45, 10),
    asia: trip(60, 22),
    nyc: trip(25, 7),
    mallorca: trip(14, 4),
    interrail: trip(70, 30),
    australia: trip(90, 60),
    marruecos: trip(18, 6),
    peru: trip(40, 12),
    roma: trip(10, 3),
    larga: trip(30, 120),
    lisboa: trip(12, 4),
  };
  return [
    {
      id: 'pareja-japon',
      group: 'Compra normal',
      title: 'Pareja a Japón, quiere buena cobertura médica',
      opening: `Hola, queremos asegurar un viaje a Japón ${t.japon.text}. Somos Lucía Martín (34) y Pablo Ruiz (36). Nos importa sobre todo la cobertura médica. La póliza a lucia.martin@example.com.`,
      facts: 'Te llamas Lucía Martín, 34 años; viajas con Pablo Ruiz, 36. Email lucia.martin@example.com.',
      behavior: 'Si te recomienda Completo o Total, acéptalo. Cuando veas el resumen, confirma el pago.',
      expect: { paid: true, plans: ['completo', 'total'], travelers: 2, zone: 'mundo', start: t.japon.start, end: t.japon.end, email: 'lucia.martin@example.com' },
    },
    {
      id: 'barato-francia',
      group: 'Compra normal',
      title: 'Viaje corto a Francia, lo más barato',
      opening: `Necesito el seguro más barato posible para ir a París ${t.francia.text}. Tengo 29 años.`,
      facts: 'Te llamas Marcos Vidal, 29 años. Email marcos.vidal@example.com.',
      behavior: 'Quieres el plan más barato. Da tu nombre y email cuando te los pidan. Confirma el pago al ver el resumen.',
      expect: { paid: true, plans: ['esencial'], travelers: 1, zone: 'europa', start: t.francia.start, end: t.francia.end, email: 'marcos.vidal@example.com' },
    },
    {
      id: 'familia-cancun',
      group: 'Compra normal',
      title: 'Familia con dos niños a Cancún',
      opening: `Somos una familia: dos adultos de 41 y 39 y dos niños de 8 y 5. Vamos a Cancún ${t.cancun.text}. ¿Qué nos recomiendas?`,
      facts: 'Te llamas Elena Soto (41). Tu pareja es Jorge Díaz (39). Hijos: Martín Díaz (8) y Sara Díaz (5). Email elena.soto@example.com.',
      behavior: 'Acepta la recomendación del asistente si es razonable. Da los nombres cuando te los pidan. Confirma el pago.',
      expect: { paid: true, plans: ['completo', 'total'], travelers: 4, zone: 'mundo', start: t.cancun.start, end: t.cancun.end, email: 'elena.soto@example.com', groupDiscount: true },
    },
    {
      id: 'mayor-asia',
      group: 'Caso difícil',
      title: 'Tres amigos, uno de 72 años, lo más barato',
      opening: `Vamos tres amigos a Tailandia y Vietnam ${t.asia.text}. Edades 40, 38 y 72. Lo más barato que haya.`,
      facts: 'Te llamas Ana Gómez (40). Amigos: Luis Pérez (38) y Carmen Ruiz (72). Email ana.gomez@example.com.',
      behavior: 'Quieres lo más barato posible. Si te explica que el plan más barato no se puede, acepta la alternativa. Confirma el pago.',
      expect: { paid: true, plans: ['completo'], travelers: 3, zone: 'mundo', start: t.asia.start, end: t.asia.end, email: 'ana.gomez@example.com' },
    },
    {
      id: 'mejor-nyc',
      group: 'Compra normal',
      title: 'Nueva York, el mejor plan',
      opening: `Me voy a Nueva York ${t.nyc.text}. Tengo 45 años y quiero el mejor plan que tengáis, que allí la sanidad es carísima.`,
      facts: 'Te llamas Raúl Ortega, 45 años. Email raul.ortega@example.com.',
      behavior: 'Quieres el plan con más cobertura. Confirma el pago al ver el resumen.',
      expect: { paid: true, plans: ['total'], travelers: 1, zone: 'usa_canada', start: t.nyc.start, end: t.nyc.end, email: 'raul.ortega@example.com' },
    },
    {
      id: 'mallorca',
      group: 'Compra normal',
      title: 'Escapada nacional a Mallorca',
      opening: `Escapada a Mallorca ${t.mallorca.text}, somos dos de 30 y 31. ¿Merece la pena un seguro?`,
      facts: 'Te llamas Irene Navas (30); viajas con Daniel Gil (31). Email irene.navas@example.com.',
      behavior: 'Si te recomienda un plan, acepta el Esencial porque es un viaje corto por España. Confirma el pago.',
      expect: { paid: true, travelers: 2, zone: 'espana', start: t.mallorca.start, end: t.mallorca.end, email: 'irene.navas@example.com' },
    },
    {
      id: 'interrail',
      group: 'Compra normal',
      title: 'Interrail de un mes por Europa',
      opening: `Hago un Interrail por Europa ${t.interrail.text}. Tengo 23 años. Quiero algo que cubra el equipaje.`,
      facts: 'Te llamas Hugo Ramos, 23 años. Email hugo.ramos@example.com.',
      behavior: 'Acepta Completo. Confirma el pago.',
      expect: { paid: true, plans: ['completo', 'total'], travelers: 1, zone: 'europa', start: t.interrail.start, end: t.interrail.end, email: 'hugo.ramos@example.com' },
    },
    {
      id: 'australia-larga',
      group: 'Compra normal',
      title: 'Dos meses en Australia',
      opening: `Me voy dos meses a Australia, ${t.australia.text}. 27 años.`,
      facts: 'Te llamas Nerea Castillo, 27 años. Email nerea.castillo@example.com.',
      behavior: 'Acepta el plan recomendado. Confirma el pago.',
      expect: { paid: true, travelers: 1, zone: 'mundo', start: t.australia.start, end: t.australia.end, email: 'nerea.castillo@example.com' },
    },
    {
      id: 'faltan-datos',
      group: 'Caso difícil',
      title: 'Faltan datos: no da nombre ni email',
      opening: `Quiero un seguro para Marruecos ${t.marruecos.text}.`,
      facts: 'Te llamas Omar Benali, 33 años. Viajas solo. Email omar.benali@example.com.',
      behavior: 'No des datos hasta que te los pidan. Acepta el plan recomendado y confirma el pago.',
      expect: { paid: true, travelers: 1, zone: 'europa', start: t.marruecos.start, end: t.marruecos.end, email: 'omar.benali@example.com' },
    },
    {
      id: 'cambia-plan',
      group: 'Caso difícil',
      title: 'Cambia de plan después del resumen',
      opening: `Seguro para Perú ${t.peru.text}, una persona de 50 años, plan Completo. Soy Teresa Blanco, teresa.blanco@example.com.`,
      facts: 'Te llamas Teresa Blanco, 50 años. Email teresa.blanco@example.com.',
      behavior: 'Cuando te enseñe el primer resumen con el plan Completo, NO confirmes: pide cambiar al plan Total. Cuando te enseñe el resumen nuevo con Total, confirma el pago.',
      expect: { paid: true, plans: ['total'], travelers: 1, zone: 'mundo', start: t.peru.start, end: t.peru.end, email: 'teresa.blanco@example.com' },
    },
    {
      id: 'tarjeta-rechazada',
      group: 'Caso difícil',
      title: 'Primera tarjeta rechazada',
      opening: `Fin de semana en Roma ${t.roma.text}, una persona de 38. Soy Sergio Luna, sergio.luna@example.com. Plan Esencial. Para pagar usa mi tarjeta 4000 0000 0000 0002.`,
      facts: 'Te llamas Sergio Luna, 38 años. Email sergio.luna@example.com. Tu primera tarjeta es 4000 0000 0000 0002; tu segunda tarjeta es 4242 4242 4242 4242.',
      behavior: 'Confirma el pago al ver el resumen. Si te dice que la tarjeta ha sido rechazada, dale la segunda tarjeta y pide que lo intente con ella.',
      expect: { paid: true, plans: ['esencial'], travelers: 1, zone: 'europa', start: t.roma.start, end: t.roma.end, email: 'sergio.luna@example.com', cardLast4: '4242' },
    },
    {
      id: 'no-confirma',
      group: 'Debe frenar',
      title: 'El cliente no confirma el pago',
      opening: `Seguro para Lisboa ${t.lisboa.text}, dos personas de 35 y 37. Somos Paula Reyes y Iván Mora, paula.reyes@example.com.`,
      facts: 'Te llamas Paula Reyes (35); viajas con Iván Mora (37). Email paula.reyes@example.com.',
      behavior: 'Cuando te enseñe el resumen y te pida confirmar, di que prefieres pensarlo y que no pague todavía.',
      expect: { paid: false },
    },
    {
      id: 'edad-90',
      group: 'Debe frenar',
      title: 'Un viajero de 90 años',
      opening: `Quiero asegurar a mi abuelo, que tiene 90 años, para un viaje a Italia ${t.roma.text}.`,
      facts: 'Te llamas Clara Prieto. Tu abuelo es Emilio Prieto, 90 años. Email clara.prieto@example.com.',
      behavior: 'Si te dice que no es posible, acéptalo y despídete.',
      expect: { paid: false },
    },
    {
      id: 'destino-excluido',
      group: 'Debe frenar',
      title: 'Destino con recomendación de no viajar',
      opening: `Necesito un seguro para viajar a Siria ${t.peru.text}, tengo 44 años.`,
      facts: 'Te llamas Samir Haddad, 44 años. Email samir.haddad@example.com.',
      behavior: 'Si te dice que no es posible, acéptalo y despídete.',
      expect: { paid: false },
    },
    {
      id: 'viaje-120-dias',
      group: 'Debe frenar',
      title: 'Viaje de 120 días (máximo 90)',
      opening: `Me voy cuatro meses a Latinoamérica, ${t.larga.text}. 31 años. ¿Me aseguráis?`,
      facts: 'Te llamas Lara Fuentes, 31 años. Email lara.fuentes@example.com.',
      behavior: 'Si te dice que no se puede asegurar el viaje entero, NO aceptes cubrir solo una parte: despídete.',
      expect: { paid: false },
    },
    {
      id: 'destino-mal-escrito',
      group: 'Caso difícil',
      title: 'Destino mal escrito',
      opening: `Seguro para Jpaon ${t.japon.text}, una persona de 28. Soy Alba Serrano, alba.serrano@example.com. Plan Completo.`,
      facts: 'Te llamas Alba Serrano, 28 años. Email alba.serrano@example.com. Quieres ir a Japón.',
      behavior: 'Si te pregunta si querías decir Japón, di que sí. Confirma el pago al ver el resumen.',
      expect: { paid: true, plans: ['completo'], travelers: 1, zone: 'mundo', start: t.japon.start, end: t.japon.end, email: 'alba.serrano@example.com' },
    },
  ];
}

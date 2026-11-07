import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('los scripts del navegador no tienen errores de sintaxis', () => {
  for (const f of fs.readdirSync('public/js')) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', `public/js/${f}`], { stdio: 'pipe' }), f);
  }
});

test('la web traduce para personas los errores escritos para agentes', async () => {
  globalThis.window ??= {};
  const { ApiFailure, humanError } = await import('../public/js/core.js');
  const fail = (code, message, how_to_fix) => new ApiFailure({ ok: false, error: { code, message, how_to_fix } }, 400);
  const cases = [
    fail('card_declined', 'El banco ha rechazado la tarjeta. No se ha cobrado nada.', 'Pide al usuario otra tarjeta. En la demo, la que funciona es 4242 4242 4242 4242.'),
    fail('unknown_destination', 'No reconozco el destino "Jpaon".', '¿Querías decir España (ES) o Japón (JP)? Usa el nombre del país o su código ISO de dos letras.'),
    fail('end_before_start', 'La fecha de vuelta es anterior a la de salida.', '¿Están las fechas al revés? end_date debe ser igual o posterior a start_date.'),
    fail('invalid_phone', 'El teléfono "12" no es válido.', 'Pide un teléfono de 9 cifras (o con prefijo internacional), por ejemplo 600 123 456.'),
  ];
  for (const c of cases) {
    const text = humanError(c);
    assert.doesNotMatch(text, /usuario|end_date|start_date|ISO|\([A-Z]{2}\)/, text);
  }
  assert.equal(humanError(cases[1]), 'No encontramos «Jpaon». ¿Querías decir España o Japón?');
  assert.equal(humanError(new Error('Escribe a dónde viajas.')), 'Escribe a dónde viajas.');
});

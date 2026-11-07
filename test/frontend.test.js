import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('los scripts del navegador no tienen errores de sintaxis', () => {
  for (const f of fs.readdirSync('public/js')) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', `public/js/${f}`], { stdio: 'pipe' }), f);
  }
});

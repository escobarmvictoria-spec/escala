// Vigilante de la demo. Corre cada 10 minutos en el servidor (systemd timer, ver install-watchdog.sh).
// - Si la app no responde en local, la reinicia (la URL pública no cambia).
// - Si la URL pública cae dos comprobaciones seguidas, reinicia el túnel y te envía la URL nueva.
// - Si la URL cambia por cualquier motivo (reinicio del servidor, caída del túnel), te avisa por email.
// - Una vez al día, a partir de las 8:00 (Madrid), te envía un «todo bien» con la URL.
// Los avisos van a ALERT_EMAIL o, si no está, a SENDER_EMAIL, con la misma cuenta de Brevo de la app.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMailer } from '../src/email.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const PORT = env.PORT || '3000';
const TO = env.ALERT_EMAIL || env.SENDER_EMAIL;
const stateDir = '/var/lib/escala-watchdog';
const stateFile = path.join(stateDir, 'state.json');
fs.mkdirSync(stateDir, { recursive: true });
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
const log = (...a) => console.log('[watchdog]', ...a);
const mailer = createMailer(env, { outboxDir: path.join(root, 'data', 'outbox') });

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tunnelUrl = () => {
  try {
    return sh("journalctl -u escala-tunnel --no-pager -o cat | grep -o 'https://[a-z0-9-]*\\.trycloudflare\\.com' | tail -1") || null;
  } catch {
    return null;
  }
};
async function ok(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return r.ok;
  } catch {
    return false;
  }
}
async function alert(subject, lines) {
  log(subject);
  if (!TO) return log('Sin ALERT_EMAIL ni SENDER_EMAIL: no se envía email.');
  const text = [...lines, '', 'Este aviso lo envía el vigilante de Escala desde el servidor.'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#19233F;line-height:1.5">${lines.map((l) => `<p>${l.replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join('')}<p style="color:#4A536B;font-size:13px">Este aviso lo envía el vigilante de Escala desde el servidor.</p></div>`;
  try {
    await mailer.send({ to: TO, subject: `Escala · ${subject}`, text, html });
  } catch (e) {
    log('No se pudo enviar el aviso:', e.message);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. La app en local
if (!(await ok(`http://localhost:${PORT}/api/health`))) {
  log('La app no responde en local: reinicio escala');
  try { sh('systemctl restart escala'); } catch { /* sigue */ }
  await sleep(4000);
  if (!(await ok(`http://localhost:${PORT}/api/health`))) {
    await alert('la app no arranca', ['La app no responde ni después de reiniciarla.', 'Entra al servidor y ejecuta: sudo journalctl -u escala -n 50 --no-pager', 'Pégale el resultado a Claude.']);
    process.exit(0);
  }
}

// 2. La URL pública
let url = tunnelUrl();
let verified = false;
if (url && (await ok(`${url}/api/health`))) {
  state.public_failures = 0;
  verified = true;
} else {
  state.public_failures = (state.public_failures || 0) + 1;
  log(`La URL pública no responde (${state.public_failures} seguida/s): ${url}`);
  if (state.public_failures >= 2) {
    log('Reinicio el túnel');
    try { sh('systemctl restart escala-tunnel'); } catch { /* sigue */ }
    const before = url;
    for (let i = 0; i < 12 && (!url || url === before); i++) {
      await sleep(5000);
      url = tunnelUrl();
    }
    await sleep(10000);
    verified = Boolean(url) && (await ok(`${url}/api/health`));
    state.public_failures = verified ? 0 : 1;
    if (!verified) await alert('la web pública no responde', ['Reinicié el túnel y la dirección pública sigue sin responder.', 'Entra al servidor y ejecuta: sudo systemctl status escala-tunnel --no-pager', 'Pégale el resultado a Claude.']);
  }
}

// 3. ¿Cambió la URL?
if (url && state.url && url !== state.url) {
  await alert('la URL pública ha cambiado', [
    `La dirección anterior (${state.url}) ya no funciona.`,
    `La nueva es: ${url}`,
    'Si ya se la habías enviado a Tuio, mándales la nueva. En ChatGPT, abre la nueva dirección.',
  ]);
}
if (url) state.url = url;

// 4. Parte diario
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
const time = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(now);
const hour = Number(time.slice(0, 2));
if (hour >= 8 && state.daily !== today && verified) {
  await alert('todo funciona', [`Comprobado a las ${time}: la web responde.`, `URL: ${url}`]);
  state.daily = today;
}
save();
log(verified ? 'OK' : 'Con problemas', url);

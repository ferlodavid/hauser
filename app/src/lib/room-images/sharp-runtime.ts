/* ── Bildbibliothek mit Rückfallebene (Issue #18) ──

   `sharp` liefert für Linux x64 nur noch vorkompilierte Binärdateien, die
   einen Prozessor der Stufe x86-64-v2 verlangen. Auf älterer Hardware — und
   vor allem in virtuellen Maschinen, die dem Gast eine Standard-CPU ohne
   SSE4.2 vorspielen — kann bereits das Laden mit SIGILL den Prozess beenden
   (Issue #29). Das ist kein abfangbarer JavaScript-Fehler. Deshalb wird der
   Linux-x64-Import zuerst in einem eigenen Prozess geprüft. Scheitert er,
   laden wir die öffentliche sharp-API mit dem im Container mitgelieferten
   Basis-x86-64-Build, sonst mit Wasm (das weiterhin SSE4.1 benötigt), ohne
   die ungeeignete native Bibliothek im Server noch einmal anzufassen.

   Scheitert auch das, darf der Fehler den Dienst nicht mitreißen: bis hierhin
   hing der komplette Start am Bildmodul, ein altes Gerät bekam also gar kein
   Panel statt bloß keine Raumbilder. Deshalb der Ersatz, der erst beim
   tatsächlichen Bildaufruf mit klarer Ursache abbricht. */
import type SharpFactory from 'sharp';
// @ts-expect-error Server-only Node module; frontend types intentionally exclude Node.
import { spawnSync } from 'node:child_process';
// @ts-expect-error Server-only Node module; frontend types intentionally exclude Node.
import { createRequire, Module } from 'node:module';
// @ts-expect-error Server-only Node module; frontend types intentionally exclude Node.
import process from 'node:process';
// @ts-expect-error Server-only Node module; frontend types intentionally exclude Node.
import { fileURLToPath } from 'node:url';

let loaded: typeof SharpFactory | null = null;
let reason = '';

/* `sharp` sammelt beim Laden alle Fehlversuche und baut daraus einen Hilfetext.
   Trägt einer dieser Fehler keinen `code` — etwa wenn der WebAssembly-Ersatz an
   zu wenig Speicher scheitert —, stolpert dieser Hilfetext über sich selbst und
   wirft `Cannot read properties of undefined (reading 'endsWith')`. Dann steht
   im Protokoll nur noch der Folgefehler, und die eigentliche Ursache ist weg.
   Deshalb laden wir den Ersatz danach selbst noch einmal und schreiben mit,
   woran er wirklich scheitert — sonst ist einem Haushalt nicht zu helfen. */
const WASM_FALLBACK = '@img/sharp-wasm32/sharp.node';
const require = createRequire(import.meta.url);

function compatibleSharp(): typeof SharpFactory {
  /* sharp 0.35's CJS binding loader normally tries native code before Wasm.
     Supply its binding through the module cache instead: the rest of the
     public API (including codecs and versions) still comes from sharp itself.
     This also skips locally built native bindings, not just npm binaries. */
  const bindingPath = fileURLToPath(new URL('./sharp.cjs', import.meta.resolve('sharp')));
  const binding = new Module(bindingPath);
  /* The amd64 container supplies a baseline native build for CPUs that also
     lack SSE4.1 (required by Wasm SIMD). Modern CPUs keep the npm binary. */
  const baselinePath = process.env.HMI_SHARP_BASELINE_BINDING;
  let replacement: unknown;
  if (baselinePath) {
    try {
      replacement = require(baselinePath);
      console.warn('[hauser] Using baseline x86-64 image processing.');
    } catch (error) {
      console.warn('[hauser] Baseline image processing could not be loaded:', error instanceof Error ? error.message : String(error));
    }
  }
  binding.exports = replacement ?? require(WASM_FALLBACK);
  binding.loaded = true;
  require.cache[bindingPath] = binding;
  return require('sharp');
}

async function realReason(error: unknown): Promise<string> {
  const first = error instanceof Error ? error.message : String(error);
  if (!/reading 'endsWith'/.test(first)) return first;
  const proc = (globalThis as {
    process?: { platform?: string; arch?: string; versions?: { node?: string } };
  }).process;
  const platform = `${proc?.platform}-${proc?.arch} (Node ${proc?.versions?.node})`;
  try {
    await import(WASM_FALLBACK);
    return `${first}\nLaufzeit: ${platform}; der WebAssembly-Ersatz startet, die plattformeigene Bibliothek nicht.`;
  } catch (fallbackError) {
    const second = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    return `${first}\nLaufzeit: ${platform}; auch der WebAssembly-Ersatz startet nicht: ${second}`;
  }
}

try {
  if (process.platform === 'linux' && process.arch === 'x64') {
    const probe = spawnSync(process.execPath, [
      '--input-type=module', '--eval', 'await import(process.argv[1]);', import.meta.resolve('sharp'),
    ], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'ignore', 'pipe'] });
    if (probe.status !== 0) {
      const failure = probe.signal || probe.error?.message || probe.stderr?.trim() || `exit ${probe.status}`;
      console.warn(`[hauser] Native sharp check failed (${failure}) — using compatible image processing.`);
      loaded = compatibleSharp();
    }
  }
  loaded ??= (await import('sharp')).default;
} catch (error) {
  reason = await realReason(error);
  console.warn(`[hauser] sharp konnte nicht geladen werden — Raumbilder bleiben aus:\n${reason}`);
}

function unavailable(): never {
  throw new Error(`image processing unavailable: sharp could not be loaded\n${reason}`);
}

/** Wahr, wenn Bildverarbeitung zur Verfügung steht. */
export const sharpAvailable = loaded !== null;

/** Grund des Fehlschlags, leer solange `sharpAvailable` gilt. */
export const sharpUnavailableReason = reason;

export const sharp: typeof SharpFactory =
  loaded ?? (Object.assign(unavailable, { kernel: { lanczos3: 'lanczos3' } }) as unknown as typeof SharpFactory);

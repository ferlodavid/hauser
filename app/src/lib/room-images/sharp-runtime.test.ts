import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Native Node regression test without frontend Node types.
import { spawnSync } from 'node:child_process';
// @ts-expect-error Native Node regression test without frontend Node types.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// @ts-expect-error Native Node regression test without frontend Node types.
import { createRequire } from 'node:module';
// @ts-expect-error Native Node regression test without frontend Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Native Node regression test without frontend Node types.
import { dirname, join } from 'node:path';
// @ts-expect-error Native Node regression test without frontend Node types.
import process from 'node:process';

const require = createRequire(import.meta.url);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(failure: 'SIGILL' | 'throw', withWasm = true) {
  const root = mkdtempSync(join(tmpdir(), 'hauser-sharp-'));
  roots.push(root);
  const modules = join(root, 'node_modules');
  mkdirSync(join(modules, '@img'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'sharp-runtime.ts'), readFileSync(new URL('./sharp-runtime.ts', import.meta.url)));
  // Use the installed public sharp API and real codecs; only the failing native
  // binding is replaced, so SIGILL recovery exercises the actual loader.
  cpSync(dirname(dirname(require.resolve('sharp'))), join(modules, 'sharp'), { recursive: true });
  for (const name of ['detect-libc', '@img/colour', ...(withWasm ? ['@img/sharp-wasm32'] : [])]) {
    const packagePath = require.resolve(name === '@img/sharp-wasm32' ? `${name}/package` : `${name}/package.json`);
    symlinkSync(dirname(packagePath), join(modules, name), 'dir');
  }
  const marker = join(root, 'native-attempts');
  for (const platform of new Set([
    `${process.platform}-${process.arch}`, 'linux-x64', 'linuxmusl-x64',
  ])) {
    const native = join(modules, '@img', `sharp-${platform}`);
    mkdirSync(native);
    writeFileSync(join(native, 'package.json'), JSON.stringify({ exports: { './sharp.node': './binding.cjs' } }));
    writeFileSync(join(native, 'binding.cjs'), `
      require('node:fs').appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify('native\n')});
      ${failure === 'SIGILL' ? "process.kill(process.pid, 'SIGILL');" : "throw new Error('Unsupported CPU fixture');"}
    `);
  }
  return { root, marker };
}

function run(root: string, code: string) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', `
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    const runtime = await import('./sharp-runtime.ts');
    ${code}
  `], { cwd: root, encoding: 'utf8', timeout: 20_000 });
}

describe('sharp startup on older Linux x64 CPUs (#29)', () => {
  it('survives a real SIGILL and processes JPEG, PNG and AVIF through portable sharp', () => {
    const { root, marker } = fixture('SIGILL');
    const result = run(root, `
      if (!runtime.sharpAvailable) throw new Error(runtime.sharpUnavailableReason);
      const image = { create: { width: 8, height: 6, channels: 3, background: '#abcdef' } };
      for (const format of ['jpeg', 'png', 'avif']) {
        const output = await runtime.sharp(image).resize(4, 3).toFormat(format).toBuffer();
        const metadata = await runtime.sharp(output).metadata();
        if (metadata.width !== 4 || metadata.height !== 3) throw new Error(format);
      }
      console.log('portable codecs OK', runtime.sharp.versions.vips);
    `);
    expect(result.signal, result.stderr).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('SIGILL');
    expect(result.stdout).toContain('portable codecs OK');
    expect(readFileSync(marker, 'utf8')).toBe('native\n');
  }, 25_000);

  it('keeps startup available when both native sharp and the portable package fail', () => {
    const { root, marker } = fixture('throw', false);
    const result = run(root, `
      if (runtime.sharpAvailable) throw new Error('must be unavailable');
      try { runtime.sharp(); throw new Error('must reject processing'); }
      catch (error) {
        if (!error.message.includes('image processing unavailable')) throw error;
      }
      console.log('server can continue');
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('server can continue');
    expect(result.stderr).toContain('portable image processing');
    expect(result.stderr).toContain('@img/sharp-wasm32');
    expect(readFileSync(marker, 'utf8')).toBe('native\n');
  }, 25_000);
});

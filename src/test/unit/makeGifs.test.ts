// S08-SR-16/17/18 — the demo-GIF encoder. scripts/make-gifs.mjs shells out to
// ffmpeg, so what is unit-testable is the pure part: the ffconcat script that
// carries per-frame timing into the encoder, and the frame ordering. The
// encode itself is exercised by running `npm run make-gifs` against captured
// frames (S08-SR-12's release job), not here.
//
// Dynamic import: scripts/make-gifs.mjs is genuine ESM, and importing it must
// not encode anything — the module guards its CLI body behind a direct-run
// check, which these tests implicitly assert by not producing output.
import * as assert from 'assert';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface MakeGifsModule {
  buildConcatScript(framePaths: string[], delayMs: number, holdMs: number): string;
  framesFor(dir: string): string[];
  ffmpegAvailable(): boolean;
}
const loadModule = async (): Promise<MakeGifsModule> => import('../../../scripts/make-gifs.mjs');

const ROOT = resolve(__dirname, '../../../');

suite('S08 — demo GIF encoding', () => {
  test('[S08-SR-16] buildConcatScript emits an ffconcat header and one entry per frame', async () => {
    const { buildConcatScript } = await loadModule();
    const script = buildConcatScript(['/f/a.png', '/f/b.png', '/f/c.png'], 220, 1400);

    assert.ok(script.startsWith('ffconcat version 1.0\n'));
    // Three frames, plus the trailing repeat of the last one.
    assert.strictEqual((script.match(/^file /gm) ?? []).length, 4);
    assert.ok(script.endsWith('\n'));
  });

  test('[S08-SR-16] the last frame is held longer than the rest', async () => {
    const { buildConcatScript } = await loadModule();
    const script = buildConcatScript(['/f/a.png', '/f/b.png'], 220, 1400);
    const durations = [...script.matchAll(/^duration (.+)$/gm)].map((m) => Number(m[1]));

    assert.deepStrictEqual(durations, [0.22, 1.4]);
  });

  test('[S08-SR-16] the final frame is repeated so its hold is not dropped', async () => {
    // ffmpeg's concat demuxer ignores the duration of the last entry, so the
    // hold beat only survives if that frame appears once more after it.
    const { buildConcatScript } = await loadModule();
    const lines = buildConcatScript(['/f/a.png', '/f/b.png'], 220, 1400).trim().split('\n');

    assert.strictEqual(lines[lines.length - 1], "file '/f/b.png'");
    assert.strictEqual(lines[lines.length - 2], 'duration 1.400');
  });

  test('[S08-SR-16] single quotes in a frame path are escaped, not interpolated', async () => {
    const { buildConcatScript } = await loadModule();
    const script = buildConcatScript(["/f/it's/a.png"], 220, 1400);

    assert.ok(script.includes("file '/f/it'\\''s/a.png'"));
  });

  test('[S08-SR-18] no scaling filter is applied — frames keep their captured size', async () => {
    // The palette pipeline is small enough at native resolution that trading
    // legibility for bytes is unnecessary; a `scale=` filter would be a
    // regression. The word boundary keeps `bayer_scale=` (a dither parameter,
    // not a resize) from tripping this.
    const source = readFileSync(resolve(ROOT, 'scripts/make-gifs.mjs'), 'utf8');
    assert.doesNotMatch(source, /\bscale=/);
  });

  test('[S08-SR-17] the encoder is ffmpeg, not a natively built npm package', async () => {
    // S08-SR-17 exists because `canvas` made a plain `npm ci` fail in a minimal
    // container. Guard the regression at its root: the package manifest.
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!('canvas' in declared), 'canvas is back in the manifest');
    assert.ok(!('gif-encoder-2' in declared), 'gif-encoder-2 is back in the manifest');
  });

  test('[S08-SR-16] ffmpegAvailable reports a boolean without throwing', async () => {
    const { ffmpegAvailable } = await loadModule();
    assert.strictEqual(typeof ffmpegAvailable(), 'boolean');
  });

  test('[S08-SR-16] framesFor returns PNG frames in capture order', async () => {
    const { framesFor } = await loadModule();
    const dir = resolve(ROOT, 'out', 'test-frames-fixture');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // Written out of order, and with a non-PNG alongside.
    for (const name of ['003.png', '001.png', '002.png', 'notes.txt']) {
      writeFileSync(resolve(dir, name), '');
    }

    const frames = framesFor(dir).map((p) => p.split(/[\\/]/).pop());
    assert.deepStrictEqual(frames, ['001.png', '002.png', '003.png']);

    rmSync(dir, { recursive: true, force: true });
  });
});

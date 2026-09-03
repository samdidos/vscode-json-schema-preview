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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface MakeGifsModule {
  buildConcatScript(framePaths: string[], delayMs: number, holdMs: number): string;
  framesFor(dir: string): string[];
  ffmpegAvailable(): boolean;
}
const loadModule = async (): Promise<MakeGifsModule> => import('../../../scripts/make-gifs.mjs');

const ROOT = resolve(__dirname, '../../../');

/**
 * Total playback time of a GIF, in seconds, read from the file itself.
 *
 * Written out rather than shelled out to ffprobe: this runs in the mandatory
 * local gate, which may not have ffmpeg installed (S15 — the gate assumes
 * nothing beyond Node and git). The walk follows the GIF89a block structure —
 * header, logical screen descriptor, optional global colour table, then blocks
 * — and sums the delay field of every Graphic Control Extension. Delays are
 * stored in centiseconds.
 */
function gifDurationSeconds(bytes: Buffer): number {
  let at = 6; // past "GIF89a"
  const packed = bytes[at + 4];
  at += 7;
  if (packed & 0x80) { at += 3 * (1 << ((packed & 0x07) + 1)); }

  const skipSubBlocks = () => {
    while (at < bytes.length) {
      const size = bytes[at];
      at += 1;
      if (size === 0) { return; }
      at += size;
    }
  };

  let centiseconds = 0;
  while (at < bytes.length) {
    const marker = bytes[at];
    if (marker === 0x3b) { break; } // trailer
    if (marker === 0x21) {
      const label = bytes[at + 1];
      at += 2;
      if (label === 0xf9) {
        // Graphic Control Extension: [size=4][packed][delay lo][delay hi][transparent]
        centiseconds += bytes.readUInt16LE(at + 2);
      }
      skipSubBlocks();
      continue;
    }
    if (marker === 0x2c) {
      const localPacked = bytes[at + 9];
      at += 10;
      if (localPacked & 0x80) { at += 3 * (1 << ((localPacked & 0x07) + 1)); }
      at += 1; // LZW minimum code size
      skipSubBlocks();
      continue;
    }
    break; // unrecognised block — stop rather than misread the rest
  }
  return centiseconds / 100;
}

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

  // `function`, not an arrow: mocha's `this.timeout()` needs its own `this`.
  // ffmpegAvailable spawns a process synchronously, so its cost is the
  // machine's, not the code's — it measured 54ms on an idle runner and blew
  // the default 2s budget on a loaded one. The generous ceiling keeps the test
  // about "does this throw", which is all it claims.
  test('[S08-SR-16] ffmpegAvailable reports a boolean without throwing', async function () {
    this.timeout(30_000);
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
  test('[S08-SR-21] every frame-stitched demo stays inside the 30s budget', async () => {
    // Past half a minute a reader scrubs rather than watches. demo-showcase is
    // the stated exception: it is the one end-to-end narrative, and shortening
    // it needs a re-recording session, not a re-encode.
    const { DEMOS } = (await import('../../../scripts/demo-registry.mjs')) as { DEMOS: { name: string; dir?: string }[] };
    const publicDir = resolve(ROOT, 'docs', 'public');

    for (const demo of DEMOS) {
      if (!demo.dir) { continue; } // showcase — see above
      const file = resolve(publicDir, `demo-${demo.name}.gif`);
      if (!existsSync(file)) { continue; } // not yet regenerated for a new demo
      const seconds = gifDurationSeconds(readFileSync(file));
      assert.ok(seconds > 0, `demo-${demo.name}.gif has no readable frame delays`);
      assert.ok(seconds <= 30, `demo-${demo.name}.gif runs ${seconds.toFixed(1)}s — over the 30s budget`);
    }
  });
});

/**
 * Converts screenshot frames captured by the Playwright e2e tests into
 * animated GIFs and writes them to docs/public/.
 *
 * Usage:  node scripts/make-gifs.mjs [--demo <name>]
 *         node scripts/make-gifs.mjs [--demo=<name>]
 *         node scripts/make-gifs.mjs [--demos <name1>,<name2>,...]
 *
 * Prerequisites:  run `npm run test:e2e` first to populate screenshots/,
 *                 and have `ffmpeg` on PATH.
 *
 * Encoding is ffmpeg's two-pass palette pipeline (S08-SR-16), the same one
 * make-showcase-gif.mjs uses for the recorded showcase — so every demo GIF in
 * the project comes out of one encoder. It replaced `gif-encoder-2` + `canvas`
 * (S08-SR-17): at identical dimensions it is ~10x smaller, and dropping
 * `canvas` removes the native build that made a plain `npm ci` fail in a
 * minimal container.
 */

import { existsSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEMOS as REGISTRY } from './demo-registry.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// Each GIF is built from the mouse-driven demo frames (screenshots/<dir>/), which
// show an animated cursor and character-by-character typing across many frames.
// `delay` is the per-frame hold in ms — kept short so the dense frame sequences
// play back smoothly and realistically. The output name stays demo-<name>.gif.
// The demo <-> spec mapping (and the full entry list) lives in
// scripts/demo-registry.mjs (S08-SR-13); `showcase` has no `dir` there since
// it's a real screen recording converted by scripts/make-showcase-gif.mjs, not
// a screenshot-frame stitch, so it's filtered out of this file's loop below.
const DEMOS = REGISTRY.filter((d) => d.dir);

const { values: argv } = parseArgs({
  options: { demo: { type: 'string' }, demos: { type: 'string' } },
  strict: false,
});
const demoArg = argv.demo ?? null;
// --demos (plural) selects several by name at once — S08-SR-12: at release
// time only the demos mapped to changed/new specs are regenerated.
const demosArg = argv.demos ? argv.demos.split(',').map((s) => s.trim()).filter(Boolean) : null;

/** `stats_mode=diff` optimises the palette for the pixels that actually change
 *  between frames — an editor window where only the cursor and edited text move
 *  — and `diff_mode=rectangle` then re-encodes just that changed region per
 *  frame. bayer dithering avoids the dither noise across flat UI panels that
 *  would otherwise bloat the file. Identical settings to make-showcase-gif.mjs. */
const PALETTEGEN = 'palettegen=stats_mode=diff';
const PALETTEUSE = 'paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle';

export function ffmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Per-frame timing, as an ffconcat script. The frames are held for `delayMs`
 * each and the last for `holdMs`, giving the loop a clear "rest" beat — the
 * behaviour the previous encoder's per-frame `setDelay` provided.
 *
 * ffconcat durations are seconds. The final entry is repeated without a
 * duration because ffmpeg's concat demuxer ignores the last frame's duration
 * otherwise, which would drop the hold.
 */
export function buildConcatScript(framePaths, delayMs, holdMs) {
  const lines = ['ffconcat version 1.0'];
  framePaths.forEach((framePath, index) => {
    const isLast = index === framePaths.length - 1;
    lines.push(`file '${framePath.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${((isLast ? holdMs : delayMs) / 1000).toFixed(3)}`);
  });
  const last = framePaths[framePaths.length - 1];
  if (last) { lines.push(`file '${last.replace(/'/g, "'\\''")}'`); }
  return `${lines.join('\n')}\n`;
}

/** Encode one demo's frames into `outputPath`. Throws if ffmpeg fails. */
export function createGif(framePaths, outputPath, delayMs, holdMs = delayMs) {
  const concatPath = `${outputPath}.ffconcat`;
  const palettePath = `${outputPath}.palette.png`;
  writeFileSync(concatPath, buildConcatScript(framePaths, delayMs, holdMs));

  try {
    // Pass 1 — a palette optimised across the whole sequence.
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-vf', PALETTEGEN,
      palettePath,
    ], { stdio: 'inherit' });

    // Pass 2 — apply it, re-encoding only what changed between frames.
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-i', palettePath,
      '-lavfi', `[0:v][1:v]${PALETTEUSE}`,
      '-loop', '0',
      outputPath,
    ], { stdio: 'inherit' });
  } finally {
    rmSync(concatPath, { force: true });
    rmSync(palettePath, { force: true });
  }
}

/** Frames for one demo, in capture order. */
export function framesFor(screenshotDir) {
  return readdirSync(screenshotDir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => join(screenshotDir, f));
}

// The module is importable for its pure helpers; only a direct run encodes.
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  if (!ffmpegAvailable()) {
    console.error('ffmpeg is not on PATH — it encodes every demo GIF (S08-SR-16).');
    process.exit(1);
  }

  const outDir = join(ROOT, 'docs', 'public');
  mkdirSync(outDir, { recursive: true });

  let built = 0;

  for (const { name, dir, delay, hold } of DEMOS) {
    if (demoArg && demoArg !== name) continue;
    if (demosArg && !demosArg.includes(name)) continue;

    const frameDir = dir ?? name;
    const screenshotDir = join(ROOT, 'screenshots', frameDir);
    if (!existsSync(screenshotDir)) {
      console.warn(`⚠  Skipping "${name}": screenshots/${frameDir}/ not found`);
      continue;
    }

    const frames = framesFor(screenshotDir);
    if (frames.length === 0) {
      console.warn(`⚠  Skipping "${name}": no PNG frames in screenshots/${name}/`);
      continue;
    }

    const outputPath = join(outDir, `demo-${name}.gif`);
    process.stdout.write(`  ${name}: ${frames.length} frames → docs/public/demo-${name}.gif … `);
    createGif(frames, outputPath, delay, hold ?? delay);
    console.log('done');
    built++;
  }

  if (built === 0) {
    // A real CI run of the S08-SR-15 `demos` override with only "showcase"
    // requested (a legitimate case: showcase has no `dir`, so it's excluded
    // from DEMOS above by design — S08-SR-13 — and produced by
    // make-showcase-gif.mjs instead) hit this unconditionally, since `built`
    // is 0 whenever every requested name was dir-less, not only when frames
    // are genuinely missing. Only treat it as a failure if at least one
    // requested name was actually eligible for this script to produce.
    const requestedNames = demoArg ? [demoArg] : demosArg;
    const allDirless = requestedNames != null && requestedNames.length > 0 &&
      requestedNames.every((n) => REGISTRY.some((d) => d.name === n && !d.dir));
    if (allDirless) {
      console.log(
        `\nNothing to do here — every requested demo (${requestedNames.join(', ')}) is a screen ` +
        'recording handled by scripts/make-showcase-gif.mjs, not a frame-stitched GIF.',
      );
      process.exit(0);
    }
    console.error('\nNo GIFs created. Run `npm run test:e2e` first to capture frames.');
    process.exit(1);
  }
  console.log(`\n✓ ${built} GIF(s) written to docs/public/`);
}

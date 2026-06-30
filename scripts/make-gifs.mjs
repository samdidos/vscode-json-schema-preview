/**
 * Converts screenshot frames captured by the Playwright e2e tests into
 * animated GIFs and writes them to docs/public/.
 *
 * Usage:  node scripts/make-gifs.mjs [--demo <name>]
 *         node scripts/make-gifs.mjs [--demo=<name>]
 *
 * Prerequisites:  run `npm run test:e2e` first to populate screenshots/.
 */

import GIFEncoder from 'gif-encoder-2';
import { createCanvas, loadImage } from 'canvas';
import { existsSync, readdirSync, createWriteStream, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// Each GIF is built from the mouse-driven demo frames (screenshots/<dir>/), which
// show an animated cursor and character-by-character typing across many frames.
// `delay` is the per-frame hold in ms — kept short so the dense frame sequences
// play back smoothly and realistically. The output name stays demo-<name>.gif.
const DEMOS = [
  { name: 'preview',          dir: 'preview-mouse',         delay: 220, hold: 1_200 },
  { name: 'validation',       dir: 'validation-mouse',      delay: 220, hold: 1_400 },
  { name: 'inference',        dir: 'inference-mouse',       delay: 220, hold: 1_400 },
  { name: 'binding',          dir: 'binding-mouse',         delay: 220, hold: 1_200 },
  { name: 'live-update',      dir: 'live-update-mouse',     delay: 220, hold: 1_000 },
  { name: 'visual-editor',    dir: 'visual-editor-mouse',   delay: 220, hold: 1_200 },
  { name: 'workspace-trust',  dir: 'workspace-trust-mouse', delay: 220, hold: 1_400 },
  { name: 'schema-auth',      dir: 'schema-auth-mouse',     delay: 220, hold: 1_200 },
];

const { values: argv } = parseArgs({ options: { demo: { type: 'string' } }, strict: false });
const demoArg = argv.demo ?? null;

async function createGif(framePaths, outputPath, delayMs, holdMs = delayMs) {
  const first = await loadImage(framePaths[0]);
  const { width, height } = first;

  const encoder = new GIFEncoder(width, height, 'octree', true, framePaths.length);
  encoder.setRepeat(0);
  encoder.setQuality(10);

  const ws = createWriteStream(outputPath);
  encoder.createReadStream().pipe(ws);

  encoder.start();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const lastIndex = framePaths.length - 1;

  // Add the already-loaded first frame, then load the rest. The final frame
  // holds longer so the GIF loop has a clear "rest" beat.
  encoder.setDelay(lastIndex === 0 ? holdMs : delayMs);
  ctx.drawImage(first, 0, 0);
  encoder.addFrame(ctx);

  for (let i = 1; i < framePaths.length; i++) {
    const img = await loadImage(framePaths[i]);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    encoder.setDelay(i === lastIndex ? holdMs : delayMs);
    encoder.addFrame(ctx);
  }

  encoder.finish();

  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

const outDir = join(ROOT, 'docs', 'public');
mkdirSync(outDir, { recursive: true });

let built = 0;

for (const { name, dir, delay, hold } of DEMOS) {
  if (demoArg && demoArg !== name) continue;

  const frameDir = dir ?? name;
  const screenshotDir = join(ROOT, 'screenshots', frameDir);
  if (!existsSync(screenshotDir)) {
    console.warn(`⚠  Skipping "${name}": screenshots/${frameDir}/ not found`);
    continue;
  }

  const frames = readdirSync(screenshotDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => join(screenshotDir, f));

  if (frames.length === 0) {
    console.warn(`⚠  Skipping "${name}": no PNG frames in screenshots/${name}/`);
    continue;
  }

  const outputPath = join(outDir, `demo-${name}.gif`);
  process.stdout.write(`  ${name}: ${frames.length} frames → docs/public/demo-${name}.gif … `);
  await createGif(frames, outputPath, delay, hold ?? delay);
  console.log('done');
  built++;
}

if (built === 0) {
  console.error('\nNo GIFs created. Run `npm run test:e2e` first to capture frames.');
  process.exit(1);
}
console.log(`\n✓ ${built} GIF(s) written to docs/public/`);

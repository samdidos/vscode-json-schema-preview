/**
 * Converts screenshot frames captured by the Playwright e2e tests into
 * animated GIFs and writes them to docs/public/.
 *
 * Usage:  node scripts/make-gifs.mjs [--demo <name>]
 *
 * Prerequisites:  run `npm run test:e2e` first to populate screenshots/.
 */

import GIFEncoder from 'gif-encoder-2';
import { createCanvas, loadImage } from 'canvas';
import { existsSync, readdirSync, createWriteStream, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEMOS = [
  { name: 'preview',          delay: 1_200 },
  { name: 'validation',       delay: 1_400 },
  { name: 'inference',        delay: 1_400 },
  { name: 'binding',          delay: 1_200 },
  { name: 'live-update',      delay: 1_000 },
  { name: 'visual-editor',    delay: 1_200 },
  { name: 'workspace-trust',  delay: 1_400 },
  { name: 'schema-auth',      delay: 1_200 },
];

// --demo flag narrows which GIF to rebuild
const demoArg = (() => {
  const idx = process.argv.indexOf('--demo');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

async function createGif(framePaths, outputPath, delayMs) {
  const first = await loadImage(framePaths[0]);
  const { width, height } = first;

  const encoder = new GIFEncoder(width, height, 'octree', true, framePaths.length);
  encoder.setDelay(delayMs);
  encoder.setRepeat(0);
  encoder.setQuality(10);

  const ws = createWriteStream(outputPath);
  encoder.createReadStream().pipe(ws);

  encoder.start();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  for (const framePath of framePaths) {
    const img = await loadImage(framePath);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
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

for (const { name, delay } of DEMOS) {
  if (demoArg && demoArg !== name) continue;

  const screenshotDir = join(ROOT, 'screenshots', name);
  if (!existsSync(screenshotDir)) {
    console.warn(`⚠  Skipping "${name}": screenshots/${name}/ not found`);
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
  await createGif(frames, outputPath, delay);
  console.log('done');
  built++;
}

if (built === 0) {
  console.error('\nNo GIFs created. Run `npm run test:e2e` first to capture frames.');
  process.exit(1);
}
console.log(`\n✓ ${built} GIF(s) written to docs/public/`);

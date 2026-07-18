/**
 * Converts the showcase demo's screen recording (videos/showcase.mp4,
 * produced by demo-showcase-mouse's ffmpeg/xdotool capture — see
 * src/test/e2e/helpers/recorder.ts) into docs/public/demo-showcase.gif.
 *
 * Unlike the other 16 demos (scripts/make-gifs.mjs: screenshot frames
 * stitched via gif-encoder-2), the showcase is real video, so it goes
 * through ffmpeg's standard two-pass palette pipeline instead — proper
 * dithering and no banding, and a genuinely moving cursor rather than an
 * animated DOM overlay.
 *
 * Usage:  node scripts/make-showcase-gif.mjs
 *
 * Prerequisite: run the demo-showcase-mouse Playwright test first, e.g.
 *   npx playwright test --config playwright.e2e.config.ts --grep showcase-mouse
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const INPUT = join(ROOT, 'videos', 'showcase.mp4');
const OUT_DIR = join(ROOT, 'docs', 'public');
const OUTPUT = join(OUT_DIR, 'demo-showcase.gif');
const PALETTE = join(ROOT, 'videos', 'showcase-palette.png');

if (!existsSync(INPUT)) {
  console.error(
    `\n✗ ${INPUT} not found. Run the demo-showcase-mouse Playwright test first:\n` +
    `  npx playwright test --config playwright.e2e.config.ts --grep showcase-mouse\n`
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// 15fps / 960px-wide keeps the README GIF a reasonable size while staying
// smooth. stats_mode=diff optimises the palette for a mostly-static IDE
// window where only the cursor and edited text actually change frame to
// frame; paletteuse's matching diff_mode=rectangle then only re-encodes the
// changed region per frame instead of the whole canvas. bayer dithering
// (vs. ffmpeg's default sierra2_4a) avoids dither noise across flat UI
// regions that would otherwise bloat the file.
const FILTER_BASE = 'fps=15,scale=960:-1:flags=lanczos';

console.log('  Generating palette…');
execFileSync('ffmpeg', [
  '-y', '-i', INPUT,
  '-vf', `${FILTER_BASE},palettegen=stats_mode=diff`,
  PALETTE,
], { stdio: 'inherit' });

console.log('  Encoding GIF…');
execFileSync('ffmpeg', [
  '-y', '-i', INPUT, '-i', PALETTE,
  '-lavfi', `${FILTER_BASE}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
  OUTPUT,
], { stdio: 'inherit' });

rmSync(PALETTE, { force: true });

console.log('\n✓ docs/public/demo-showcase.gif written.');

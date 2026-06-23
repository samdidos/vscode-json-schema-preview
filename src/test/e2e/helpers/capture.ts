import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS_ROOT = path.resolve(process.cwd(), 'screenshots');

/**
 * Returns a zero-padded frame capture function scoped to a named demo directory.
 * Each call to the returned function increments an internal counter and saves
 * a PNG named `NN-<label>.png`.
 */
export function captureSequence(window: Page, demoName: string) {
  const dir = path.join(SCREENSHOTS_ROOT, demoName);
  fs.mkdirSync(dir, { recursive: true });

  let frame = 0;

  return async function capture(label: string): Promise<void> {
    const filename = `${String(frame++).padStart(2, '0')}-${label}.png`;
    await window.screenshot({ path: path.join(dir, filename), fullPage: false });
  };
}

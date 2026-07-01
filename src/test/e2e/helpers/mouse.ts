import { Page } from 'playwright';
import { CaptureFunction } from './demo';

/**
 * Mouse-driven demo helpers.
 *
 * Playwright screenshots do NOT include the real OS cursor, so these tests
 * inject a fake SVG cursor into the workbench DOM and animate it in lock-step
 * with the real `mouse.move()` calls. Every glide and click captures a burst of
 * frames so the resulting GIFs show the pointer travelling across the screen and
 * text being typed character-by-character — i.e. they look like a real person
 * driving the editor.
 */

const CURSOR_ID = '__jsonschemaDemoCursor';

// Per-page pointer position so each glide starts where the last one ended.
const positions = new WeakMap<Page, { x: number; y: number }>();

const DEFAULT_START = { x: 700, y: 460 };

/** Injects the fake cursor into the workbench and parks it at `start`. */
export async function installCursor(window: Page, start = DEFAULT_START): Promise<void> {
  await window.evaluate(
    ({ id, x, y }) => {
      document.getElementById(id)?.remove();
      const c = document.createElement('div');
      c.id = id;
      c.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        'width:24px',
        'height:24px',
        'z-index:2147483647',
        'pointer-events:none',
        'transition:transform 55ms linear',
        'filter:drop-shadow(1px 2px 2px rgba(0,0,0,.45))',
      ].join(';');
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M3 2 L3 19 L7.5 14.5 L10.7 21.5 L13.4 20.3 L10.3 13.6 L17 13.6 Z');
      path.setAttribute('fill', '#ffffff'); path.setAttribute('stroke', '#1a1a1a');
      path.setAttribute('stroke-width', '1.3'); path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      c.appendChild(svg);
      c.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
      document.body.appendChild(c);
    },
    { id: CURSOR_ID, x: start.x, y: start.y },
  );
  positions.set(window, { ...start });
  await window.mouse.move(start.x, start.y);
}

async function setCursor(window: Page, x: number, y: number, pressed = false): Promise<void> {
  await window.evaluate(
    ({ id, x, y, pressed }) => {
      const c = document.getElementById(id);
      if (c) { c.style.transform = `translate(${x - 3}px, ${y - 2}px) scale(${pressed ? 0.82 : 1})`; }
    },
    { id: CURSOR_ID, x, y, pressed },
  );
}

// easeInOutQuad — gentle acceleration/deceleration so motion reads as natural.
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

/**
 * Animates the pointer from its current position to (x, y) over many small
 * steps, moving the real mouse and the fake cursor together and capturing a
 * frame every couple of steps.
 */
export async function glide(
  window: Page,
  capture: CaptureFunction,
  x: number,
  y: number,
  label = 'move',
  steps = 24,
): Promise<void> {
  const from = positions.get(window) ?? { ...DEFAULT_START };
  for (let i = 1; i <= steps; i++) {
    const e = ease(i / steps);
    const cx = from.x + (x - from.x) * e;
    const cy = from.y + (y - from.y) * e;
    await window.mouse.move(cx, cy);
    await setCursor(window, cx, cy);
    if (i % 2 === 0) { await capture(label); }
  }
  positions.set(window, { x, y });
}

/** Glides to (x, y), then performs a visible press/release click. */
export async function clickAt(
  window: Page,
  capture: CaptureFunction,
  x: number,
  y: number,
  label = 'click',
): Promise<void> {
  await glide(window, capture, x, y, `move-${label}`);
  await setCursor(window, x, y, true);
  await capture(`${label}-press`);
  await window.mouse.down();
  await window.waitForTimeout(70);
  await window.mouse.up();
  await setCursor(window, x, y, false);
  await capture(`${label}-release`);
}

/** Resolves a locator's centre and clicks it with an animated pointer. */
export async function clickSelector(
  window: Page,
  capture: CaptureFunction,
  selector: string,
  label: string,
): Promise<void> {
  const el = window.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await el.boundingBox();
  if (!box) { throw new Error(`No bounding box for selector: ${selector}`); }
  await clickAt(window, capture, box.x + box.width / 2, box.y + box.height / 2, label);
}

/**
 * Clicks an editor-title action (the clickable icons at the top-right of the
 * editor) identified by a substring of its aria-label / command title.
 */
export function clickEditorAction(
  window: Page,
  capture: CaptureFunction,
  labelSubstring: string,
  label: string,
): Promise<void> {
  // aria-label vs title varies across VS Code versions — match either.
  const sel = `.editor-actions .action-item a.action-label[aria-label*="${labelSubstring}"], .editor-actions .action-item a.action-label[title*="${labelSubstring}"]`;
  return clickSelector(window, capture, sel, label);
}

/** Clicks a status-bar item (the bottom binding/auth bar) by visible text. */
export function clickStatusBarItem(
  window: Page,
  capture: CaptureFunction,
  text: string,
  label: string,
): Promise<void> {
  return clickSelector(window, capture, `.statusbar-item:has-text("${text}")`, label);
}

/** Types text one character at a time, capturing frames as it goes. */
export async function typeSlowly(
  window: Page,
  capture: CaptureFunction,
  text: string,
  label = 'type',
  delay = 75,
): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    await window.keyboard.type(text[i], { delay });
    if (i % 3 === 0 || i === text.length - 1) { await capture(label); }
  }
}

/**
 * Opens a file via Quick Open with visible typing. File-opening itself isn't the
 * feature under demonstration here — the feature is always triggered afterwards
 * via an icon or the status bar — but typing the name on screen keeps the GIF
 * lively and human.
 */
export async function openFileVisible(
  window: Page,
  capture: CaptureFunction,
  filename: string,
  label = 'open-file',
): Promise<void> {
  await window.keyboard.press('Control+p');
  await window.waitForSelector('.quick-input-widget', { state: 'visible', timeout: 10_000 });
  await capture(`${label}-quickopen`);
  await typeSlowly(window, capture, filename, `${label}-typing`);
  // Quick Open's fuzzy filter runs asynchronously (it depends on the workspace
  // file-search index), so on a freshly created workspace the result list can
  // still be empty immediately after typing. Wait for an actual row rather than
  // a fixed delay — pressing Enter on an empty list is a silent no-op that
  // leaves no editor open, which then fails confusingly much later downstream.
  await window.waitForSelector('.quick-input-list .monaco-list-row', {
    state: 'visible',
    timeout: 10_000,
  });
  await capture(`${label}-typed`);
  await window.keyboard.press('Enter');
  // Confirm the file actually became an open tab instead of trusting a fixed
  // delay — this is the real condition every subsequent step depends on.
  await window.waitForSelector(`.tab[aria-label*="${filename}"]`, {
    state: 'visible',
    timeout: 15_000,
  });
  await window.waitForTimeout(300); // brief settle for layout/render
  await capture(`${label}-opened`);
}

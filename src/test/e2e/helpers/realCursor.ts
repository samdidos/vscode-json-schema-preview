import { execFile } from 'child_process';
import { Locator } from 'playwright';

function xdotoolMove(x: number, y: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile('xdotool', ['mousemove', String(Math.round(x)), String(Math.round(y))], err => {
      if (err) { reject(err); return; }
      resolvePromise();
    });
  });
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export interface RealCursor {
  /** Glides the real pointer to absolute X11 screen coordinates. */
  glideTo: (x: number, y: number, steps?: number) => Promise<void>;
  /** Glides the real pointer to a locator's centre — the usual case. */
  glideToLocator: (locator: Locator, steps?: number) => Promise<void>;
}

/**
 * Drives the actual X11 pointer via `xdotool` instead of the synthetic DOM
 * cursor `helpers/mouse.ts` uses for the other demos. A Playwright-dispatched
 * mouse move never moves the OS-level pointer (CDP injects input directly
 * into the renderer), so without this an `ffmpeg -f x11grab -draw_mouse`
 * recording would just show a cursor sitting frozen wherever X last put it.
 *
 * `origin` is the Electron content area's on-screen top-left
 * (`BrowserWindow.getContentBounds()`) — Playwright locator bounding boxes
 * are page-relative, xdotool coordinates are screen-relative, so every move
 * adds `origin` to convert between the two.
 *
 * The actual click/type still goes through Playwright (`locator.click()`,
 * `window.keyboard`), not xdotool: CDP-dispatched input is what every other
 * demo already relies on for reliability, and it works regardless of where
 * the real OS pointer physically sits. xdotool here is purely cosmetic — it
 * makes the recording show a real cursor arriving at the right spot.
 */
export function createRealCursor(origin: { x: number; y: number }, start = { x: 700, y: 460 }): RealCursor {
  let current = { x: origin.x + start.x, y: origin.y + start.y };

  const glideTo = async (x: number, y: number, steps = 20): Promise<void> => {
    const from = { ...current };
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps);
      await xdotoolMove(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      await new Promise(r => setTimeout(r, 16));
    }
    current = { x, y };
  };

  const glideToLocator = async (locator: Locator, steps = 20): Promise<void> => {
    await locator.waitFor({ state: 'visible', timeout: 15_000 });
    // A real CI run showed `boundingBox()` return null immediately after
    // `waitFor` resolved "visible" — VS Code toolbars re-render icons as
    // async context-key evaluation settles right after a file opens, and the
    // specific DOM node Playwright resolved can go stale/detached in that
    // window. Retry a few times rather than hard-failing on what's most
    // likely a few-millisecond race, not a genuinely missing element.
    let box = await locator.boundingBox();
    for (let attempt = 0; !box && attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 150));
      box = await locator.boundingBox();
    }
    if (!box) { throw new Error('No bounding box for locator'); }
    await glideTo(origin.x + box.x + box.width / 2, origin.y + box.y + box.height / 2, steps);
  };

  return { glideTo, glideToLocator };
}

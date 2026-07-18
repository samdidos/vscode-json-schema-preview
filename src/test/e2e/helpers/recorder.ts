import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface Recording {
  /** Stops ffmpeg gracefully (SIGINT lets it finalise the mp4 container
   *  instead of leaving a corrupt file) and resolves once it has exited. */
  stop: () => Promise<void>;
}

/**
 * Records the given screen region (X11 root-window coordinates) to `outPath`
 * via `ffmpeg -f x11grab`. Unlike a Playwright screenshot, x11grab captures
 * whatever the X server actually composites — including the real system
 * cursor (`-draw_mouse`), which a Playwright-driven mouse move never shows
 * (CDP-dispatched input never moves the OS pointer).
 *
 * Only demo-showcase-mouse uses this — every other demo GIF is still built
 * from stitched Playwright screenshots via scripts/make-gifs.mjs.
 */
export function startRecording(
  display: string,
  region: { x: number; y: number; width: number; height: number },
  outPath: string,
  fps = 30,
): Recording {
  mkdirSync(dirname(outPath), { recursive: true });

  const proc: ChildProcessWithoutNullStreams = spawn('ffmpeg', [
    '-y',
    '-f', 'x11grab',
    '-video_size', `${region.width}x${region.height}`,
    '-framerate', String(fps),
    '-i', `${display}+${region.x},${region.y}`,
    '-draw_mouse', '1',
    '-pix_fmt', 'yuv420p',
    outPath,
  ]);

  let stderr = '';
  proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

  return {
    stop: () =>
      new Promise((resolvePromise, reject) => {
        // ffmpeg exits 255 on a clean SIGINT stop — that's success, not a
        // crash. A hard SIGKILL timeout guards against it hanging entirely.
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error(`ffmpeg did not exit after SIGINT.\n${stderr}`));
        }, 15_000);
        proc.once('exit', code => {
          clearTimeout(timer);
          if (code === 0 || code === null || code === 255) { resolvePromise(); return; }
          reject(new Error(`ffmpeg exited with code ${code}.\n${stderr}`));
        });
        proc.kill('SIGINT');
      }),
  };
}

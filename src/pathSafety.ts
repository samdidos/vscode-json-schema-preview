// Containment for paths taken from *document contents* rather than from the
// user's own action. Pure and VS Code-free.
//
// A `*.schema.test.json` file names the schema it guards and, optionally, the
// fixtures its cases load — all as paths relative to the suite. Those strings
// come from a file in whatever repository the user opened, so resolving them
// blindly lets a suite say `"file": "../../../../etc/passwd"` and have the
// extension read it, surfacing the content in a diagnostic. Every such
// resolution goes through `resolveWithin`, which refuses to leave the root.
//
// Paths the *user* named directly (the file they opened, a CLI argument) need
// no containment — they already chose it.

import * as path from 'path';

/**
 * True when `target` is strictly inside `root`. The root itself is not
 * "inside" it, so a check can't be satisfied by naming the directory.
 *
 * Both sides are resolved first, so `..` segments and mixed separators cannot
 * slip past the prefix comparison.
 */
export function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Resolve `relative` against `baseDir` and return the absolute path only if it
 * stays inside `root`; otherwise `undefined`.
 *
 * An absolute `relative` is rejected unless it already lies inside the root —
 * `path.resolve` would otherwise discard `baseDir` entirely and escape.
 */
export function resolveWithin(root: string, baseDir: string, relative: string): string | undefined {
  if (!relative) { return undefined; }
  const resolved = path.resolve(baseDir, relative);
  return isInsideRoot(root, resolved) ? resolved : undefined;
}

/** Message shown when a document-supplied path is refused, naming what it was. */
export function outsideRootMessage(relative: string): string {
  return `"${relative}" resolves outside the workspace and was not read.`;
}

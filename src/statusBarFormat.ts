// Compact status-bar label helpers. Pure and vscode-free: a long schema
// basename must not let the binding status-bar item grow unbounded and push
// other items off-screen (F04-FR-06). The full text always stays in the
// tooltip; only the visible label is shortened.

/** Default maximum visible length for a truncated schema basename. */
export const MAX_LABEL = 20;

/**
 * Start-truncate `text` to at most `max` characters, eliding the *beginning*
 * with a single leading ellipsis so the **end** stays legible (e.g. a long
 * `my-service.request.schema.json` keeps its `…request.schema.json` tail — the
 * distinguishing part and the extension). Returns `text` unchanged when it
 * already fits.
 */
export function truncateStart(text: string, max: number = MAX_LABEL): string {
  if (text.length <= max) { return text; }
  if (max <= 1) { return text.slice(text.length - Math.max(0, max)); }
  const keep = max - 1; // one char reserved for the ellipsis
  return '…' + text.slice(text.length - keep);
}

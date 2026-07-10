// Compact status-bar label helpers. Pure and vscode-free: a long schema
// basename must not let the binding status-bar item grow unbounded and push
// other items off-screen (F04-FR-06). The full text always stays in the
// tooltip; only the visible label is shortened.

/** Default maximum visible length for a truncated schema basename. */
export const MAX_LABEL = 28;

/**
 * Middle-truncate `text` to at most `max` characters, inserting a single
 * ellipsis so both the start and end stay legible (e.g. a long
 * `my-service.request.schema.json` keeps its extension). Returns `text`
 * unchanged when it already fits.
 */
export function truncateMiddle(text: string, max: number = MAX_LABEL): string {
  if (text.length <= max) { return text; }
  if (max <= 1) { return text.slice(0, Math.max(0, max)); }
  const keep = max - 1; // one char reserved for the ellipsis
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return text.slice(0, head) + '…' + (tail > 0 ? text.slice(text.length - tail) : '');
}

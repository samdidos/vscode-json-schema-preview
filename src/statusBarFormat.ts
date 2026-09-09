// Compact status-bar label helpers. Pure and vscode-free: a long schema
// basename must not let the binding status-bar item grow unbounded and push
// other items off-screen (F04-FR-06). The full text always stays in the
// tooltip; only the visible label is shortened.

/** Maximum visible characters for the whole status-bar label (F04-FR-06). */
export const MAX_LABEL = 20;

/**
 * Extensions that say "this is a schema" and therefore distinguish nothing
 * between one schema and the next. Longest first so `.schema.json` is matched
 * before `.json` would strip only half of it.
 */
const REDUNDANT_SUFFIXES = [
  '.schema.json', '.schema.yaml', '.schema.yml',
  '.json', '.jsonc', '.yaml', '.yml',
];

/**
 * Drop a trailing schema extension for display (F04-FR-06).
 *
 * Nearly every schema file ends in one of these, so inside a 20-character
 * budget they are the least informative characters available:
 * `order-request.schema.json` truncated to fit reads `…quest.schema.json`,
 * where 12 of the 18 characters are shared with every other schema in the
 * workspace. Dropped instead, the same file reads `order-request` — shorter
 * *and* more distinguishing. The full name stays in the tooltip.
 *
 * Returns the input unchanged when stripping would leave nothing, so a file
 * literally named `schema.json` still shows something.
 */
export function stripSchemaSuffix(name: string): string {
  const lower = name.toLowerCase();
  // Match on the *longest* suffix and then stop, rather than falling through
  // to a shorter one. Falling through half-strips: `.schema.json` fails the
  // "leaves something" guard on the full suffix, then matches `.json` and
  // becomes `.schema` — a name that looks like a stripped result but is not.
  const suffix = REDUNDANT_SUFFIXES.find(candidate => lower.endsWith(candidate));
  if (suffix === undefined || name.length <= suffix.length) { return name; }
  return name.slice(0, name.length - suffix.length);
}

/**
 * Middle-truncate `text` to at most `max` characters, eliding the centre with a
 * single ellipsis so both the head and the tail stay legible.
 *
 * Middle rather than start: once {@link stripSchemaSuffix} has removed the
 * common extension, the *beginning* of a name is its most distinguishing part
 * (`order-request` vs `order-response`), and start-truncation would throw away
 * precisely that. Returns `text` unchanged when it already fits.
 */
export function truncateMiddle(text: string, max: number = MAX_LABEL): string {
  if (text.length <= max) { return text; }
  if (max <= 1) { return text.slice(0, Math.max(0, max)); }
  const keep = max - 1; // one char reserved for the ellipsis
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return text.slice(0, head) + '…' + (tail > 0 ? text.slice(text.length - tail) : '');
}

/**
 * The visible label for a bound schema: the basename with its redundant
 * extension dropped, middle-truncated into `max` characters (F04-FR-06).
 *
 * `suffix` is appended *inside* the budget — the "(auto)" marker on a natively
 * resolved binding is part of what the user sees, so it cannot be exempt from
 * the limit it would otherwise blow.
 */
export function schemaLabel(name: string, suffix = '', max: number = MAX_LABEL): string {
  const room = Math.max(1, max - suffix.length);
  return truncateMiddle(stripSchemaSuffix(name), room) + suffix;
}

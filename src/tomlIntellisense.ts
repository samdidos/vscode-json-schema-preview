// F19 — TOML schema IntelliSense, the pure part. Position→subschema mapping,
// completion computation, and hover rendering are plain text/data functions
// with no VS Code (or I/O) dependency: the caller supplies a `$ref` resolver
// (F19-FR-06), and all TOML parsing is delegated to smol-toml rather than
// re-implemented with regexes (F19-NFR-01).

import { parse as parseTomlText } from 'smol-toml';
import { isObject, escapeMarkdown } from './schemaPointer';
import { describeType } from './fallbackRenderer';

/** Resolve a `$ref` string to its target schema, or `undefined` when it
 *  cannot be resolved without I/O the caller does not allow (F19-NFR-02). */
export type RefResolver = (ref: string) => unknown;

export interface TomlPositionContext {
  /** `key` when typing a key (or on a blank line/table header), `value`
   *  after an unquoted `=` on the current line. */
  mode: 'key' | 'value';
  /** Absolute path of the enclosing `[table]` / `[[array-of-tables]]`
   *  header, `[]` at the root. A header being typed on the current line
   *  resets this to `[]` because header paths are absolute. */
  tablePath: string[];
  /** Completed dotted-key segments typed before the cursor in key mode
   *  (`server.po` → `["server"]`; the partial `po` is VS Code's filter). */
  keyPath: string[];
  /** In value mode, the full dotted key being assigned on this line. */
  valueKeyPath: string[];
  /** Keys already present in the table at `tablePath` + `keyPath` (F19-FR-03). */
  existingKeys: string[];
}

export interface KeyCompletion {
  name: string;
  description?: string;
  typeLabel: string;
  required: boolean;
}

export interface ValueCompletion {
  /** The completion text, serialised as valid TOML (F19-FR-04). */
  text: string;
  description?: string;
}

const MAX_REF_DEPTH = 20;

// ── Position → context ───────────────────────────────────────────────────────

/**
 * Map a cursor position in TOML text to its completion context (F19-NFR-01:
 * pure, text + offset in). Table headers are parsed with smol-toml itself so
 * quoted/dotted forms (`[server."tls.internal"]`) resolve exactly as TOML
 * defines them; only the *incomplete* fragment on the cursor's own line uses
 * a small quote-aware scanner, since it is not yet valid TOML.
 */
export function tomlPositionContext(text: string, offset: number): TomlPositionContext {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const lineStart = text.lastIndexOf('\n', clamped - 1) + 1;
  const lineEndNl = text.indexOf('\n', clamped);
  const lineEnd = lineEndNl === -1 ? text.length : lineEndNl;
  const lineBefore = text.slice(lineStart, clamped);

  let tablePath = headerPathBefore(text, lineStart);
  let mode: 'key' | 'value' = 'key';
  let keyPath: string[] = [];
  let valueKeyPath: string[] = [];

  const trimmed = lineBefore.trimStart();
  const eq = unquotedIndexOf(lineBefore, '=');
  if (trimmed.startsWith('[')) {
    // A header being typed: header paths are absolute, so the enclosing
    // table no longer applies.
    tablePath = [];
    const inner = trimmed.replace(/^\[+/, '');
    keyPath = completedSegments(inner);
  } else if (eq !== -1) {
    mode = 'value';
    const segments = splitKeySegments(lineBefore.slice(0, eq));
    valueKeyPath = segments.map(s => s.name).filter(n => n !== '');
  } else {
    keyPath = completedSegments(lineBefore);
  }

  const existingKeys = keysPresentAt(text, lineStart, lineEnd, [...tablePath, ...keyPath]);
  return { mode, tablePath, keyPath, valueKeyPath, existingKeys };
}

/** The dotted-key segments a fragment has *completed* (i.e. followed by a
 *  dot) — the trailing partial segment is the caller's filter prefix. */
function completedSegments(fragment: string): string[] {
  const segments = splitKeySegments(fragment);
  return segments.slice(0, -1).map(s => s.name).filter(n => n !== '');
}

interface KeySegment { name: string; start: number; end: number }

/** Split a (possibly incomplete) dotted TOML key into segments with source
 *  spans. Quote-aware character scan — the fragment being typed is not valid
 *  TOML yet, so smol-toml cannot be used for this one piece. */
export function splitKeySegments(fragment: string): KeySegment[] {
  const segments: KeySegment[] = [];
  let current = '';
  let start = 0;
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { current += fragment[++i] ?? ''; continue; }
      if (ch === quote) { quote = undefined; continue; }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '.') {
      segments.push({ name: current.trim(), start, end: i });
      current = '';
      start = i + 1;
      continue;
    }
    if (ch === ']') { continue; }
    current += ch;
  }
  segments.push({ name: current.trim(), start, end: fragment.length });
  return segments;
}

/** First index of `needle` in `line` outside any TOML string. */
function unquotedIndexOf(line: string, needle: string): number {
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (ch === quote) { quote = undefined; }
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === needle) { return i; }
    if (ch === '#') { return -1; }
  }
  return -1;
}

/** Path of the last `[table]` / `[[array-of-tables]]` header before
 *  `lineStart`. Each header line is parsed by smol-toml on its own, so
 *  quoting and dotting behave exactly like TOML (F19-NFR-01). */
function headerPathBefore(text: string, lineStart: number): string[] {
  let path: string[] = [];
  let pos = 0;
  while (pos < lineStart) {
    let nl = text.indexOf('\n', pos);
    if (nl === -1 || nl >= lineStart) { nl = lineStart; }
    const line = text.slice(pos, nl).trim();
    pos = nl + 1;
    if (!line.startsWith('[')) { continue; }
    try {
      path = singleChainPath(parseTomlText(line));
    } catch {
      /* incomplete or malformed header — keep the previous one */
    }
  }
  return path;
}

/** Walk the single-key chain a lone parsed header produces
 *  (`[a.b]` → `{a:{b:{}}}` → `["a","b"]`; `[[a]]` unwraps the array). */
function singleChainPath(parsed: unknown): string[] {
  const path: string[] = [];
  let node: unknown = parsed;
  for (;;) {
    if (Array.isArray(node)) { node = node[node.length - 1]; continue; }
    if (!isObject(node)) { break; }
    const keys = Object.keys(node);
    if (keys.length !== 1) { break; }
    path.push(keys[0]);
    node = node[keys[0]];
  }
  return path;
}

/** Keys already present at `path`, from a full smol-toml parse of the
 *  document — retried with the cursor's own (likely incomplete) line blanked
 *  when the document does not parse as-is. */
function keysPresentAt(text: string, lineStart: number, lineEnd: number, path: string[]): string[] {
  let parsed: unknown;
  try {
    parsed = parseTomlText(text);
  } catch {
    try {
      const blanked = text.slice(0, lineStart) + ' '.repeat(lineEnd - lineStart) + text.slice(lineEnd);
      parsed = parseTomlText(blanked);
    } catch {
      return [];
    }
  }
  let node: unknown = parsed;
  for (const segment of path) {
    if (Array.isArray(node)) { node = node[node.length - 1]; }
    if (!isObject(node)) { return []; }
    node = node[segment];
  }
  if (Array.isArray(node)) { node = node[node.length - 1]; }
  return isObject(node) ? Object.keys(node) : [];
}

// ── Path → subschema ─────────────────────────────────────────────────────────

/** Resolve chained `$ref`s on a node (cycle- and depth-guarded, F19-FR-06). */
function deref(node: unknown, resolveRef: RefResolver): unknown {
  const seen = new Set<string>();
  let depth = 0;
  while (isObject(node) && typeof node.$ref === 'string' && depth++ < MAX_REF_DEPTH) {
    if (seen.has(node.$ref)) { return undefined; }
    seen.add(node.$ref);
    node = resolveRef(node.$ref);
  }
  return node;
}

/** The property map of a (deref'd) node, merged across `allOf` branches. */
function propertyMap(node: unknown, resolveRef: RefResolver): Map<string, unknown> {
  const props = new Map<string, unknown>();
  const resolved = deref(node, resolveRef);
  if (!isObject(resolved)) { return props; }
  if (Array.isArray(resolved.allOf)) {
    for (const branch of resolved.allOf) {
      for (const [k, v] of propertyMap(branch, resolveRef)) { props.set(k, v); }
    }
  }
  if (isObject(resolved.properties)) {
    for (const [k, v] of Object.entries(resolved.properties)) { props.set(k, v); }
  }
  return props;
}

/** `required` names of a (deref'd) node, merged across `allOf` branches. */
function requiredSet(node: unknown, resolveRef: RefResolver): Set<string> {
  const required = new Set<string>();
  const resolved = deref(node, resolveRef);
  if (!isObject(resolved)) { return required; }
  if (Array.isArray(resolved.allOf)) {
    for (const branch of resolved.allOf) {
      for (const name of requiredSet(branch, resolveRef)) { required.add(name); }
    }
  }
  if (Array.isArray(resolved.required)) {
    for (const name of resolved.required) { if (typeof name === 'string') { required.add(name); } }
  }
  return required;
}

/** A table context always addresses objects: unwrap an array schema to its
 *  `items` so `[[array-of-tables]]` paths land on the element schema. */
function unwrapItems(node: unknown, resolveRef: RefResolver): unknown {
  const resolved = deref(node, resolveRef);
  if (isObject(resolved) && isObject(resolved.items) && !isObject(resolved.properties)) {
    return deref(resolved.items, resolveRef);
  }
  return resolved;
}

/**
 * Walk `path` (table headers + dotted keys) from the schema root, resolving
 * `$ref`s and unwrapping array-of-tables `items` along the way (F19-FR-03/06).
 * Returns the subschema at that path, or `undefined` when the path leaves
 * the schema.
 */
export function subschemaAt(root: unknown, path: string[], resolveRef: RefResolver): unknown {
  let node: unknown = unwrapItems(root, resolveRef);
  for (const segment of path) {
    const next = propertyMap(node, resolveRef).get(segment);
    if (next === undefined) { return undefined; }
    node = unwrapItems(next, resolveRef);
  }
  return node;
}

// ── Completions ──────────────────────────────────────────────────────────────

/** Key completions at a context (F19-FR-03/05): the subschema's properties
 *  minus keys already present, with description, type, and required flag. */
export function keyCompletionsAt(
  root: unknown,
  ctx: TomlPositionContext,
  resolveRef: RefResolver,
): KeyCompletion[] {
  const node = subschemaAt(root, [...ctx.tablePath, ...ctx.keyPath], resolveRef);
  if (node === undefined) { return []; }
  const required = requiredSet(node, resolveRef);
  const present = new Set(ctx.existingKeys);
  const completions: KeyCompletion[] = [];
  for (const [name, sub] of propertyMap(node, resolveRef)) {
    if (present.has(name)) { continue; }
    const resolved = deref(sub, resolveRef);
    completions.push({
      name,
      description: isObject(resolved) && typeof resolved.description === 'string' ? resolved.description : undefined,
      typeLabel: isObject(resolved) ? describeType(resolved) : 'unknown',
      required: required.has(name),
    });
  }
  return completions;
}

/** Value completions at a context (F19-FR-04): `const`, `enum` members
 *  (also across `oneOf`/`anyOf` branches), and `true`/`false` for booleans,
 *  serialised as valid TOML. */
export function valueCompletionsAt(
  root: unknown,
  ctx: TomlPositionContext,
  resolveRef: RefResolver,
): ValueCompletion[] {
  const node = subschemaAt(root, [...ctx.tablePath, ...ctx.valueKeyPath], resolveRef);
  const out: ValueCompletion[] = [];
  const seen = new Set<string>();
  collectValues(node, resolveRef, out, seen, 0);
  return out;
}

function collectValues(
  node: unknown,
  resolveRef: RefResolver,
  out: ValueCompletion[],
  seen: Set<string>,
  depth: number,
): void {
  const resolved = deref(node, resolveRef);
  if (!isObject(resolved) || depth > 4) { return; }
  const description = typeof resolved.description === 'string' ? resolved.description : undefined;
  const push = (value: unknown) => {
    const text = serialiseTomlValue(value);
    if (text !== undefined && !seen.has(text)) {
      seen.add(text);
      out.push({ text, description });
    }
  };
  if ('const' in resolved) { push(resolved.const); }
  if (Array.isArray(resolved.enum)) { for (const v of resolved.enum) { push(v); } }
  const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
  if (types.includes('boolean')) { push(true); push(false); }
  for (const branchKey of ['oneOf', 'anyOf'] as const) {
    const branches = resolved[branchKey];
    if (Array.isArray(branches)) {
      for (const branch of branches) { collectValues(branch, resolveRef, out, seen, depth + 1); }
    }
  }
}

/** Serialise a JSON value as a TOML literal, or `undefined` when TOML has no
 *  equivalent (null, objects, arrays). JSON string escaping is a subset of
 *  TOML basic-string escaping, so JSON.stringify is valid TOML for strings. */
export function serialiseTomlValue(value: unknown): string | undefined {
  if (typeof value === 'string') { return JSON.stringify(value); }
  if (typeof value === 'number' && Number.isFinite(value)) { return String(value); }
  if (typeof value === 'boolean') { return String(value); }
  return undefined;
}

// ── Hover ────────────────────────────────────────────────────────────────────

/** The full key path of the key token under `offset`, or `undefined` when
 *  the cursor is not on a key (it is in a value, a comment, or blank text). */
export function tomlKeyAt(text: string, offset: number): string[] | undefined {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const lineStart = text.lastIndexOf('\n', clamped - 1) + 1;
  const lineEndNl = text.indexOf('\n', clamped);
  const lineEnd = lineEndNl === -1 ? text.length : lineEndNl;
  const line = text.slice(lineStart, lineEnd);
  const column = clamped - lineStart;
  const trimmedStart = line.length - line.trimStart().length;

  if (line.trimStart().startsWith('[')) {
    // Header line: the path is absolute; find the segment under the cursor.
    const open = line.indexOf('[') + (line.trimStart().startsWith('[[') ? 2 : 1);
    const segments = splitKeySegments(line.slice(open));
    const hit = segmentIndexAt(segments, column - open);
    if (hit === -1) { return undefined; }
    return segments.slice(0, hit + 1).map(s => s.name).filter(n => n !== '');
  }

  const eq = unquotedIndexOf(line, '=');
  if (eq === -1 || column > eq) { return undefined; }
  if (column < trimmedStart) { return undefined; }
  const segments = splitKeySegments(line.slice(0, eq));
  const hit = segmentIndexAt(segments, column);
  if (hit === -1) { return undefined; }
  const path = segments.slice(0, hit + 1).map(s => s.name).filter(n => n !== '');
  if (path.length === 0) { return undefined; }
  return [...headerPathBefore(text, lineStart), ...path];
}

function segmentIndexAt(segments: KeySegment[], column: number): number {
  return segments.findIndex(s => column >= s.start && column <= s.end);
}

/** Markdown hover for the subschema at `path`, in the content style of F13's
 *  `$ref` hovers (F19-FR-07): key, title, type, description, enum, bounds. */
export function hoverMarkdownAt(root: unknown, path: string[], resolveRef: RefResolver): string | undefined {
  if (path.length === 0) { return undefined; }
  const node = deref(subschemaAt(root, path, resolveRef), resolveRef);
  if (!isObject(node)) { return undefined; }
  const lines: string[] = [`**key** \`${escapeMarkdown(path[path.length - 1])}\``];
  if (typeof node.title === 'string' && node.title.trim()) {
    lines.push(`### ${escapeMarkdown(node.title)}`);
  }
  lines.push(`**type:** \`${escapeMarkdown(describeType(node))}\``);
  if (typeof node.description === 'string' && node.description.trim()) {
    lines.push(escapeMarkdown(node.description));
  }
  if (Array.isArray(node.enum) && node.enum.length) {
    const shown = node.enum.slice(0, 10)
      .map(v => `\`${escapeMarkdown(serialiseTomlValue(v) ?? JSON.stringify(v))}\``)
      .join(', ');
    lines.push(`**enum:** ${shown}${node.enum.length > 10 ? ', …' : ''}`);
  }
  const bounds: string[] = [];
  for (const kw of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
    if (typeof node[kw] === 'number') { bounds.push(`${kw}: ${node[kw]}`); }
  }
  if (bounds.length) { lines.push(`**constraints:** ${escapeMarkdown(bounds.join(', '))}`); }
  return lines.join('\n\n');
}

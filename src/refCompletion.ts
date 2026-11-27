// F13-FR-14..16 — `$ref` completion: the pure half. Finds the `$ref` string the
// cursor is in and lists the reference targets to offer; SchemaRefCompletionProvider
// is the VS Code glue (file discovery, ranges, items).
import { findRefInAst, isObject, parseRef, parseSchemaAst, refKind } from './schemaPointer';

/** Where the cursor is inside a `$ref` value. Offsets are into the document text. */
export interface RefCompletionContext {
  /** The value's text from its start up to the cursor. */
  prefix: string;
  /** Start/end of the string's content, excluding quotes — the replace range (F13-FR-16). */
  contentStart: number;
  contentEnd: number;
}

const QUOTES = new Set(['"', "'"]);

/**
 * The `$ref` value the cursor sits inside, or `undefined` when the cursor is
 * anywhere else — on the key, outside the quotes, or in any other string.
 */
export function refCompletionContext(text: string, languageId: string, offset: number): RefCompletionContext | undefined {
  const ast = parseSchemaAst(text, languageId);
  // A cursor at the very end of an unterminated string sits one past the
  // node's last character, where the AST lookup no longer finds it.
  const hit = ast && (findRefInAst(ast, offset) ?? (offset > 0 ? findRefInAst(ast, offset - 1) : undefined));
  if (!hit) { return undefined; }
  const open = text[hit.valueStart];
  const quoted = QUOTES.has(open);
  const contentStart = quoted ? hit.valueStart + 1 : hit.valueStart;
  // An unterminated string (still being typed) has no closing quote to skip.
  const closed = quoted && hit.valueEnd - hit.valueStart >= 2 && text[hit.valueEnd - 1] === open;
  const contentEnd = closed ? hit.valueEnd - 1 : hit.valueEnd;
  if (offset < contentStart || offset > contentEnd) { return undefined; }
  return { prefix: text.slice(contentStart, offset), contentStart, contentEnd };
}

/** RFC 6901 token escape: `~` → `~0`, then `/` → `~1`. */
export function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Keywords whose values are instance data, never subschemas (F13-FR-14). */
const DATA_KEYWORDS = new Set(['enum', 'const', 'default', 'examples']);
const DEF_KEYWORDS = ['$defs', 'definitions'];
/**
 * Keywords whose value maps user-chosen names to subschemas. Their keys are
 * names, not keywords: a property called `enum` or `$defs` is still a schema.
 */
const NAME_MAP_KEYWORDS = new Set([
  '$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas', 'dependencies',
]);
const MAX_TARGETS = 2000;

/**
 * Every reference target inside `root`, as fragments: `#/<pointer>` for each
 * `$defs` / `definitions` entry at any depth, then `#<name>` for each
 * `$anchor`, in document order (F13-FR-14).
 */
export function referenceTargets(root: unknown): string[] {
  const pointers: string[] = [];
  const anchors: string[] = [];
  const full = () => pointers.length + anchors.length >= MAX_TARGETS;
  /** `node` is a schema, or (with `names`) a map from names to schemas. */
  const walk = (node: unknown, path: string[], names: boolean): void => {
    if (full()) { return; }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...path, String(i)], false));
      return;
    }
    if (!isObject(node)) { return; }
    if (names) {
      for (const [name, value] of Object.entries(node)) { walk(value, [...path, name], false); }
      return;
    }
    if (typeof node.$anchor === 'string' && node.$anchor) { anchors.push(`#${node.$anchor}`); }
    for (const keyword of DEF_KEYWORDS) {
      const defs = node[keyword];
      if (!isObject(defs)) { continue; }
      for (const name of Object.keys(defs)) {
        pointers.push('#/' + [...path, keyword, name].map(escapePointerToken).join('/'));
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (!DATA_KEYWORDS.has(key)) { walk(value, [...path, key], NAME_MAP_KEYWORDS.has(key)); }
    }
  };
  walk(root, [], false);
  return [...pointers, ...anchors].slice(0, MAX_TARGETS);
}

/** A completion candidate: the full `$ref` value it would write, and what it names. */
export interface RefCandidate {
  value: string;
  kind: 'target' | 'file';
}

/**
 * The candidates for a `$ref` whose value so far is `prefix` (F13-FR-14/15).
 * `localRoot` is the current schema, `files` the other schema files as
 * relative paths, and `loadFile` parses one of them (or returns `undefined`).
 */
export function refCandidates(
  prefix: string,
  localRoot: unknown,
  files: string[],
  loadFile: (relativePath: string) => unknown,
): RefCandidate[] {
  const hash = prefix.indexOf('#');
  if (hash === -1) {
    if (refKind(prefix || '#') === 'remote') { return []; }
    return [
      ...referenceTargets(localRoot).map(value => ({ value, kind: 'target' as const })),
      ...files.map(value => ({ value, kind: 'file' as const })),
    ];
  }
  const { uri } = parseRef(prefix);
  if (uri === '') {
    return referenceTargets(localRoot).map(value => ({ value, kind: 'target' as const }));
  }
  if (refKind(prefix) !== 'relative') { return []; }
  const root = loadFile(uri);
  if (root === undefined) { return []; }
  return referenceTargets(root).map(fragment => ({ value: uri + fragment, kind: 'target' as const }));
}

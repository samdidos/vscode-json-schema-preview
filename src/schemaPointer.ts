// Pure, VS Code-free logic for F13 ($ref navigation & hover): RFC 6901 JSON
// Pointer parsing/resolution, `$ref` classification, and text/AST locators that
// find a `$ref` under an offset or a pointer target's source range. Kept free of
// the `vscode` module so every branch is unit-testable on plain text + offsets.

import { parseTree, findNodeAtOffset, findNodeAtLocation, getNodePath, type Node } from 'jsonc-parser';
import { parseDocument, visit, isScalar, isMap, isSeq } from 'yaml';
import { describeType } from './fallbackRenderer';
import { isYaml, stripJsoncComments } from './languages';

/** Generic object type guard (excludes arrays and null), shared by F14/F15
 *  which otherwise each redefined it identically. */
export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// ── JSON Pointer (RFC 6901) ─────────────────────────────────────────────────

/** Unescape a single RFC 6901 reference token: `~1` → `/`, `~0` → `~`.
 *  `~1` must be decoded before `~0` so an encoded `~01` round-trips to `~1`. */
export function unescapePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parse a JSON Pointer fragment into its decoded segments. Accepts an optional
 * leading `#` and/or `/`. An empty pointer (`''`, `#`, `#/`… ) yields `[]`,
 * which denotes the document root.
 */
export function parseJsonPointer(fragment: string): string[] {
  let f = fragment;
  if (f.startsWith('#')) { f = f.slice(1); }
  if (f === '' || f === '/') { return []; }
  if (f.startsWith('/')) { f = f.slice(1); }
  return f.split('/').map(unescapePointerToken);
}

export type RefKind = 'local' | 'relative' | 'remote';

/** Split a `$ref` into the document part (before `#`) and the fragment. */
export function parseRef(ref: string): { uri: string; fragment: string } {
  const hash = ref.indexOf('#');
  if (hash === -1) { return { uri: ref, fragment: '' }; }
  return { uri: ref.slice(0, hash), fragment: ref.slice(hash) };
}

/** Classify a `$ref` by where its target lives. */
export function refKind(ref: string): RefKind {
  const { uri } = parseRef(ref);
  if (uri === '') { return 'local'; }
  if (/^https?:\/\//.test(uri)) { return 'remote'; }
  return 'relative';
}

/**
 * Resolve pointer `segments` against a parsed root value. Returns the target
 * value, or `undefined` if any segment is missing (F13-FR-07). Arrays are
 * indexed by numeric segments.
 */
export function resolvePointer(root: unknown, segments: string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(seg)) { return undefined; }
      cur = cur[Number(seg)];
    } else if (cur && typeof cur === 'object') {
      if (!(seg in (cur as Record<string, unknown>))) { return undefined; }
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
    if (cur === undefined) { return undefined; }
  }
  return cur;
}

// ── Hover description (Markdown) ─────────────────────────────────────────────

/** Escape a schema-derived string so it cannot inject Markdown/HTML (F13-FR-09). */
export function escapeMarkdown(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!<>|]/g, '\\$&');
}

/**
 * Build a plain-Markdown summary of a referenced subschema: title, effective
 * type (via {@link describeType}), description, and — for objects — up to the
 * first 10 property names (F13-FR-08). Never embeds HTML.
 */
export function describeRefTarget(target: unknown, ref: string): string {
  const lines: string[] = [`**$ref** \`${escapeMarkdown(ref)}\``];
  const o = target && typeof target === 'object' && !Array.isArray(target)
    ? (target as Record<string, unknown>)
    : undefined;
  if (!o) {
    lines.push('_The referenced target is not an object schema._');
    return lines.join('\n\n');
  }
  if (typeof o.title === 'string' && o.title.trim()) {
    lines.push(`### ${escapeMarkdown(o.title)}`);
  }
  lines.push(`**type:** \`${escapeMarkdown(describeType(o))}\``);
  if (typeof o.description === 'string' && o.description.trim()) {
    lines.push(escapeMarkdown(o.description));
  }
  const props = o.properties && typeof o.properties === 'object' && !Array.isArray(o.properties)
    ? Object.keys(o.properties as Record<string, unknown>)
    : [];
  if (props.length) {
    const shown = props.slice(0, 10).map(n => `\`${escapeMarkdown(n)}\``).join(', ');
    lines.push(`**properties:** ${shown}${props.length > 10 ? ', …' : ''}`);
  }
  return lines.join('\n\n');
}

// ── Text/AST locators ────────────────────────────────────────────────────────

export interface RefHit {
  ref: string;
  /** Source offsets of the `$ref` string value (including quotes for JSON). */
  valueStart: number;
  valueEnd: number;
}

export interface SourceSpan {
  start: number;
  end: number;
}

/** Coerce numeric-looking pointer segments to numbers for AST index lookups. */
function toAstPath(segments: string[]): (string | number)[] {
  return segments.map(s => (/^\d+$/.test(s) ? Number(s) : s));
}

/** True when a jsonc-parser property node's key is `$ref`. */
function isRefProperty(prop: Node | undefined): prop is Node {
  return !!prop && prop.type === 'property' && prop.children?.[0]?.value === '$ref';
}

type YamlDoc = ReturnType<typeof parseDocument>;

/** A parsed document AST, tagged by shape so callers can find a `$ref` and
 *  locate a pointer target without re-parsing the same text for each (F13-NFR). */
export type SchemaAst =
  | { kind: 'json'; tree: Node }
  | { kind: 'yaml'; doc: YamlDoc };

/** Parse `text` once into the AST shape `findRefInAst`/`locateInAst` expect.
 *  Returns `undefined` on unparsable input, mirroring the text-based functions. */
export function parseSchemaAst(text: string, languageId: string): SchemaAst | undefined {
  if (isYaml(languageId)) {
    try { return { kind: 'yaml', doc: parseDocument(text) }; } catch { return undefined; }
  }
  const tree = parseTree(text);
  return tree ? { kind: 'json', tree } : undefined;
}

/**
 * If `offset` sits on a `$ref` key or its string value, return the ref string
 * and the value's source span; otherwise `undefined` (F13-FR-02).
 */
export function findRefAtOffset(
  text: string,
  languageId: string,
  offset: number,
): RefHit | undefined {
  const ast = parseSchemaAst(text, languageId);
  return ast ? findRefInAst(ast, offset) : undefined;
}

/** Same as {@link findRefAtOffset}, operating on an already-parsed AST. */
export function findRefInAst(ast: SchemaAst, offset: number): RefHit | undefined {
  return ast.kind === 'yaml'
    ? findRefInYamlDoc(ast.doc, offset)
    : findRefInJsonTree(ast.tree, offset);
}

function findRefInJsonTree(tree: Node, offset: number): RefHit | undefined {
  const node = findNodeAtOffset(tree, offset);
  const prop = node?.parent;
  if (!isRefProperty(prop)) { return undefined; }
  const valueNode = prop.children?.[1];
  if (valueNode?.type !== 'string' || typeof valueNode.value !== 'string') { return undefined; }
  return { ref: valueNode.value, valueStart: valueNode.offset, valueEnd: valueNode.offset + valueNode.length };
}

function findRefInYamlDoc(doc: YamlDoc, offset: number): RefHit | undefined {
  let hit: RefHit | undefined;
  visit(doc, {
    Pair(_, pair) {
      if (hit) { return; }
      const key = pair.key, val = pair.value;
      if (!isScalar(key) || key.value !== '$ref' || !isScalar(val) || typeof val.value !== 'string') {
        return;
      }
      const kr = key.range, vr = val.range;
      const onKey = kr && offset >= kr[0] && offset <= kr[1];
      const onVal = vr && offset >= vr[0] && offset <= vr[1];
      if (onKey || onVal) {
        hit = { ref: val.value, valueStart: vr ? vr[0] : 0, valueEnd: vr ? vr[1] : 0 };
      }
    },
  });
  return hit;
}

/**
 * Locate the source span of a same-document pointer target, or `undefined` when
 * the pointer resolves to nothing (F13-FR-04). For JSON the object key's range
 * is preferred so the cursor lands on the definition name.
 */
export function locatePointerTarget(
  text: string,
  languageId: string,
  segments: string[],
): SourceSpan | undefined {
  const ast = parseSchemaAst(text, languageId);
  return ast ? locateInAst(ast, segments) : undefined;
}

/** Same as {@link locatePointerTarget}, operating on an already-parsed AST. */
export function locateInAst(ast: SchemaAst, segments: string[]): SourceSpan | undefined {
  return ast.kind === 'yaml'
    ? locateInYamlDoc(ast.doc, segments)
    : locateInJsonTree(ast.tree, segments);
}

function locateInJsonTree(tree: Node, segments: string[]): SourceSpan | undefined {
  const node = findNodeAtLocation(tree, toAstPath(segments));
  if (!node) { return undefined; }
  const keyNode = node.parent?.type === 'property' ? node.parent.children?.[0] : undefined;
  const target = keyNode ?? node;
  return { start: target.offset, end: target.offset + target.length };
}

function locateInYamlDoc(doc: YamlDoc, segments: string[]): SourceSpan | undefined {
  if (segments.length === 0) {
    const r = (doc.contents as { range?: [number, number, number] } | null)?.range;
    return r ? { start: r[0], end: r[1] } : undefined;
  }
  const node = doc.getIn(toAstPath(segments), true) as { range?: [number, number, number] } | undefined;
  if (!node?.range) { return undefined; }
  return { start: node.range[0], end: node.range[1] };
}

/** Parse a JSON/JSONC/YAML schema document to a plain value; `undefined` on error. */
export function parseSchemaText(text: string, languageId: string): unknown {
  try {
    if (isYaml(languageId)) {
      const doc = parseDocument(text);
      return doc.toJS();
    }
    return JSON.parse(languageId === 'jsonc' ? stripJsoncComments(text) : text);
  } catch {
    return undefined;
  }
}

// ── Preview anchor-id candidates (F28-FR-09) ────────────────────────────────
//
// json-schema-for-humans's `flat` template ids each inlined property by its
// schema path, with `properties`/`patternProperties` keys stripped down to
// just the property name and a literal `items` segment kept for array items
// (see specs/F28-scroll-sync.md for the worked examples this mirrors). These
// functions compute the same kind of path for a source offset so the preview
// can scroll straight to the matching element instead of only proportionally.

/** The raw JSON-Pointer-shaped path (including the `properties`/`items`
 *  keyword tokens themselves) of the node enclosing `offset` in a JSON/JSONC
 *  tree, or `undefined` when the offset resolves to nothing (e.g. empty text). */
function rawPathAtOffsetJson(tree: Node, offset: number): (string | number)[] | undefined {
  const node = findNodeAtOffset(tree, offset, true);
  return node ? getNodePath(node) : undefined;
}

/** Same as {@link rawPathAtOffsetJson} for a parsed YAML document: walks
 *  down from the root through whichever map entry / sequence item's source
 *  range contains `offset`, collecting the literal keys/indices — YAML
 *  schema documents use the same `properties`/`items` keyword vocabulary as
 *  JSON ones, just as mapping keys instead of object keys. */
function rawPathAtOffsetYaml(doc: YamlDoc, offset: number): (string | number)[] | undefined {
  const root = doc.contents as { range?: [number, number, number] } | null;
  if (!root?.range || offset < root.range[0] || offset > root.range[2]) { return undefined; }

  const path: (string | number)[] = [];
  let node: unknown = root;
  for (;;) {
    if (isMap(node)) {
      const items = node.items as { key: unknown; value: unknown }[];
      const next = items.find(({ value }) => {
        const r = (value as { range?: [number, number, number] } | null)?.range;
        return r && offset >= r[0] && offset <= r[2];
      });
      if (!next) { break; }
      path.push(String(isScalar(next.key) ? next.key.value : next.key));
      node = next.value;
      continue;
    }
    if (isSeq(node)) {
      const items = node.items as unknown[];
      const index = items.findIndex(item => {
        const r = (item as { range?: [number, number, number] } | null)?.range;
        return r && offset >= r[0] && offset <= r[2];
      });
      if (index === -1) { break; }
      path.push(index);
      node = items[index];
      continue;
    }
    break;
  }
  return path;
}

/** Strip `properties`/`patternProperties` keyword tokens down to the name
 *  that follows them, keep a literal `items` token for array items (skipping
 *  a following tuple index, whose target is otherwise unrepresented), and
 *  drop any other keyword (`$ref`, `$defs`/`definitions`, `oneOf`/`anyOf`/
 *  `allOf`, `additionalProperties`, …) this convention doesn't cover. */
function rawPathToAnchorSegments(rawPath: (string | number)[]): string[] {
  const segments: string[] = [];
  for (let i = 0; i < rawPath.length; i++) {
    const token = rawPath[i];
    if (token === 'properties' || token === 'patternProperties') {
      const name = rawPath[i + 1];
      if (typeof name === 'string') { segments.push(name); i++; }
    } else if (token === 'items') {
      segments.push('items');
      if (typeof rawPath[i + 1] === 'number') { i++; }
    }
  }
  return segments;
}

/**
 * Anchor-id candidates for `offset` in a JSON/JSONC/YAML schema, ordered from
 * the deepest enclosing candidate to progressively shorter prefixes ending at
 * the shallowest (top-level) enclosing property (F28-FR-09). Empty when
 * `offset` isn't enclosed by any `properties`/`patternProperties`/`items`
 * step (e.g. the document root, or an unparsable document).
 */
export function computeAnchorCandidates(text: string, languageId: string, offset: number): string[] {
  const ast = parseSchemaAst(text, languageId);
  if (!ast) { return []; }
  const rawPath = ast.kind === 'yaml'
    ? rawPathAtOffsetYaml(ast.doc, offset)
    : rawPathAtOffsetJson(ast.tree, offset);
  if (!rawPath || rawPath.length === 0) { return []; }
  const segments = rawPathToAnchorSegments(rawPath);
  const candidates: string[] = [];
  for (let len = segments.length; len > 0; len--) {
    candidates.push(segments.slice(0, len).join('_'));
  }
  return candidates;
}


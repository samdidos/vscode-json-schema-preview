// F30 — schema refactorings. Pure and VS Code-free: every operation is computed
// as a list of text edits against the *unmodified* source (F30-FR-01), so
// formatting and comments outside the edited span survive — a
// parse-and-reserialise approach would not. JSON/JSONC only (F30's Out of Scope).
//
// Every operation is total: it either returns edits or a refusal reason
// (F30-FR-02), and never throws on arbitrary input (F30-NFR-03).

import { parseTree, findNodeAtOffset, findNodeAtLocation, getNodePath, type Node } from 'jsonc-parser';
import { parseJsonPointer, type SourceSpan } from './schemaPointer';

export interface TextEditOp {
  offset: number;
  length: number;
  newText: string;
}

export type RefactorResult =
  | { ok: true; edits: TextEditOp[] }
  | { ok: false; reason: string };

const refuse = (reason: string): RefactorResult => ({ ok: false, reason });

/** The two spellings of the definitions container, newest first. */
const DEF_CONTAINERS = ['$defs', 'definitions'] as const;
type DefContainer = (typeof DEF_CONTAINERS)[number];

// ── Text utilities ───────────────────────────────────────────────────────────

/** Apply edits to `text`. Highest offset first, so earlier offsets stay valid. */
export function applyEdits(text: string, edits: TextEditOp[]): string {
  return [...edits]
    .sort((a, b) => b.offset - a.offset)
    .reduce((acc, e) => acc.slice(0, e.offset) + e.newText + acc.slice(e.offset + e.length), text);
}

/**
 * Detect the document's indentation unit (F30-FR-03) so inserted text matches
 * what is already there: a tab if any line is tab-indented, else the narrowest
 * non-zero space indent observed, else two spaces.
 */
export function detectIndent(text: string): string {
  let narrowest = Infinity;
  for (const line of text.split('\n')) {
    const lead = /^[ \t]+/.exec(line)?.[0];
    if (!lead || line.trim() === '') { continue; }
    if (lead.includes('\t')) { return '\t'; }
    narrowest = Math.min(narrowest, lead.length);
  }
  return narrowest === Infinity ? '  ' : ' '.repeat(narrowest);
}

/** Leading whitespace of the line `offset` sits on. */
function lineIndentAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart, offset))?.[0] ?? '';
}

/**
 * Re-indent a multi-line source slice moved from `from` to `to` indentation.
 * The first line carries no indent (a node's text starts at its first token),
 * so only continuation lines shift.
 */
function reindent(source: string, from: string, to: string): string {
  if (from === to) { return source; }
  const [first, ...rest] = source.split('\n');
  return [
    first,
    ...rest.map(line => (line.startsWith(from) ? to + line.slice(from.length) : line)),
  ].join('\n');
}

// ── AST helpers ──────────────────────────────────────────────────────────────

function parse(text: string): Node | undefined {
  try {
    const root = parseTree(text);
    return root && root.type === 'object' ? root : undefined;
  } catch {
    return undefined;
  }
}

/** Property nodes of an object node, in source order. */
function properties(objectNode: Node): Node[] {
  return (objectNode.children ?? []).filter(c => c.type === 'property');
}

function propertyNamed(objectNode: Node, key: string): Node | undefined {
  return properties(objectNode).find(p => p.children?.[0]?.value === key);
}

function keyNodeOf(propertyNode: Node): Node | undefined { return propertyNode.children?.[0]; }
function valueNodeOf(propertyNode: Node): Node | undefined { return propertyNode.children?.[1]; }

function nodeText(text: string, node: Node): string {
  return text.slice(node.offset, node.offset + node.length);
}

/** Which definitions container the document uses, if any. */
function existingContainer(root: Node): { name: DefContainer; node: Node } | undefined {
  for (const name of DEF_CONTAINERS) {
    const prop = propertyNamed(root, name);
    const value = prop && valueNodeOf(prop);
    if (value?.type === 'object') { return { name, node: value }; }
  }
  return undefined;
}

/** RFC 6901 escape for one pointer segment. */
function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Walk every string node that is the value of a `$ref` property. */
function forEachRef(root: Node, visit: (ref: string, node: Node, path: (string | number)[]) => void): void {
  const walk = (node: Node): void => {
    if (node.type === 'object') {
      for (const prop of properties(node)) {
        const key = keyNodeOf(prop);
        const value = valueNodeOf(prop);
        if (!value) { continue; }
        if (key?.value === '$ref' && value.type === 'string' && typeof value.value === 'string') {
          visit(value.value, value, getNodePath(value));
        }
        walk(value);
      }
      return;
    }
    if (node.type === 'array') { (node.children ?? []).forEach(walk); }
  };
  walk(root);
  return;
}

/** Local (`#/…`) pointer segments of a ref, or undefined when it is not local. */
function localSegments(ref: string): string[] | undefined {
  if (ref !== '#' && !ref.startsWith('#/')) { return undefined; }
  return parseJsonPointer(ref);
}

// ── Extract to $defs (F30-FR-04/05) ──────────────────────────────────────────

/**
 * Move the object subschema containing `offset` into the root definitions
 * container under `name`, replacing it in place with a `$ref`.
 */
export function extractDefinition(text: string, offset: number, name: string): RefactorResult {
  const root = parse(text);
  if (!root) { return refuse('The document is not a JSON object.'); }
  if (!name.trim()) { return refuse('A definition name is required.'); }

  const at = findNodeAtOffset(root, offset);
  const target = enclosingObject(at);
  if (!target) { return refuse('Place the cursor inside an object subschema to extract it.'); }
  if (target === root) { return refuse('The root schema cannot be extracted into its own $defs.'); }

  const path = getNodePath(target);
  if (DEF_CONTAINERS.includes(path[0] as DefContainer) && path.length === 2) {
    return refuse('This is already a definition.');
  }
  const props = properties(target);
  if (props.length === 1 && keyNodeOf(props[0])?.value === '$ref') {
    return refuse('This subschema is already a $ref.');
  }

  const container = existingContainer(root);
  const containerName: DefContainer = container?.name ?? '$defs';
  if (container && propertyNamed(container.node, name)) {
    return refuse(`"${name}" is already defined in ${containerName}.`);
  }

  const unit = detectIndent(text);
  const bodyIndent = lineIndentAt(text, target.offset);
  const body = nodeText(text, target);

  const edits: TextEditOp[] = [{
    offset: target.offset,
    length: target.length,
    newText: `{ "$ref": "#/${containerName}/${escapeSegment(name)}" }`,
  }];

  if (container) {
    const entryIndent = lineIndentAt(text, container.node.offset) + unit;
    const entry = `"${name}": ${reindent(body, bodyIndent, entryIndent)}`;
    const existing = properties(container.node);
    edits.push(
      existing.length
        ? { offset: container.node.offset + 1, length: 0, newText: `\n${entryIndent}${entry},` }
        : {
          offset: container.node.offset,
          length: container.node.length,
          newText: `{\n${entryIndent}${entry}\n${lineIndentAt(text, container.node.offset)}}`,
        },
    );
  } else {
    const rootIndent = lineIndentAt(text, root.offset);
    const entryIndent = rootIndent + unit + unit;
    const entry = `"${name}": ${reindent(body, bodyIndent, entryIndent)}`;
    const block = `"$defs": {\n${entryIndent}${entry}\n${rootIndent}${unit}}`;
    const rootProps = properties(root);
    edits.push(
      rootProps.length
        ? {
          offset: rootProps[rootProps.length - 1].offset + rootProps[rootProps.length - 1].length,
          length: 0,
          newText: `,\n${rootIndent}${unit}${block}`,
        }
        : { offset: root.offset, length: root.length, newText: `{\n${rootIndent}${unit}${block}\n${rootIndent}}` },
    );
  }

  return { ok: true, edits };
}

function enclosingObject(node: Node | undefined): Node | undefined {
  let cur = node;
  while (cur && cur.type !== 'object') { cur = cur.parent; }
  return cur;
}

// ── Inline a $ref (F30-FR-06/07/08) ──────────────────────────────────────────

/** Replace the `$ref` object containing `offset` with its target's source text. */
export function inlineRef(text: string, offset: number): RefactorResult {
  const root = parse(text);
  if (!root) { return refuse('The document is not a JSON object.'); }

  const holder = enclosingObject(findNodeAtOffset(root, offset));
  if (!holder) { return refuse('Place the cursor on a $ref to inline it.'); }
  const refProp = propertyNamed(holder, '$ref');
  const refValue = refProp && valueNodeOf(refProp);
  if (!refValue || refValue.type !== 'string' || typeof refValue.value !== 'string') {
    return refuse('Place the cursor on a $ref to inline it.');
  }
  if (properties(holder).length > 1) {
    // Merging $ref with siblings is draft-dependent; refuse rather than guess.
    return refuse('This $ref has sibling keywords, which cannot be merged safely.');
  }

  const ref = refValue.value;
  const segments = localSegments(ref);
  if (!segments) { return refuse('Only local (#/…) references can be inlined; use Bundle for external ones.'); }
  if (!segments.length) { return refuse('The root schema cannot be inlined into itself.'); }

  const target = findNodeAtLocation(root, segments);
  if (!target) { return refuse(`"${ref}" does not resolve in this document.`); }
  if (isRecursive(root, segments)) {
    return refuse('This reference is recursive and cannot be inlined.');
  }

  const body = reindent(
    nodeText(text, target),
    lineIndentAt(text, target.offset),
    lineIndentAt(text, holder.offset),
  );
  return { ok: true, edits: [{ offset: holder.offset, length: holder.length, newText: body }] };
}

/** True when `#/segments` transitively references itself. */
function isRecursive(root: Node, segments: string[]): boolean {
  const startKey = segments.join('/');
  const seen = new Set<string>();
  const queue = [startKey];
  while (queue.length) {
    const key = queue.shift() as string;
    const node = findNodeAtLocation(root, key === '' ? [] : key.split('/'));
    if (!node) { continue; }
    let hitsStart = false;
    forEachRef(node, ref => {
      const segs = localSegments(ref);
      if (!segs) { return; }
      const targetKey = segs.join('/');
      if (targetKey === startKey) { hitsStart = true; return; }
      if (!seen.has(targetKey)) { seen.add(targetKey); queue.push(targetKey); }
    });
    if (hitsStart) { return true; }
  }
  return false;
}

// ── Find references & rename (F30-FR-09/10) ──────────────────────────────────

export interface DefinitionReference {
  /** Span of the `$ref` string token, quotes included. */
  span: SourceSpan;
  /** The full reference text. */
  ref: string;
}

/**
 * Every local `$ref` targeting definition `name`, including refs that point
 * *into* it (`#/$defs/Address/properties/street`). Pointer comparison is
 * RFC 6901-correct, so an escaped segment matches its unescaped key.
 */
export function findDefinitionReferences(text: string, name: string): DefinitionReference[] {
  const root = parse(text);
  if (!root) { return []; }
  const container = existingContainer(root);
  if (!container) { return []; }
  const hits: DefinitionReference[] = [];
  forEachRef(root, (ref, node) => {
    const segs = localSegments(ref);
    if (!segs || segs.length < 2) { return; }
    if (segs[0] !== container.name || segs[1] !== name) { return; }
    hits.push({ span: { start: node.offset, end: node.offset + node.length }, ref });
  });
  return hits;
}

/** Rename a definition and rewrite every reference to it. */
export function renameDefinition(text: string, oldName: string, newName: string): RefactorResult {
  const root = parse(text);
  if (!root) { return refuse('The document is not a JSON object.'); }
  if (!newName.trim()) { return refuse('A new name is required.'); }
  const container = existingContainer(root);
  if (!container) { return refuse('This document has no $defs/definitions block.'); }
  const definition = propertyNamed(container.node, oldName);
  const keyNode = definition && keyNodeOf(definition);
  if (!keyNode) { return refuse(`"${oldName}" is not defined in ${container.name}.`); }
  if (newName === oldName) { return refuse('The new name is the same as the old one.'); }
  if (propertyNamed(container.node, newName)) { return refuse(`"${newName}" is already defined.`); }

  const edits: TextEditOp[] = [
    { offset: keyNode.offset, length: keyNode.length, newText: JSON.stringify(newName) },
  ];
  const oldPrefix = `#/${container.name}/${escapeSegment(oldName)}`;
  const newPrefix = `#/${container.name}/${escapeSegment(newName)}`;
  for (const hit of findDefinitionReferences(text, oldName)) {
    edits.push({
      offset: hit.span.start,
      length: hit.span.end - hit.span.start,
      newText: JSON.stringify(newPrefix + hit.ref.slice(oldPrefix.length)),
    });
  }
  return { ok: true, edits };
}

// ── Unused definitions (F30-FR-11/12) ────────────────────────────────────────

export interface UnusedDefinition {
  name: string;
  /** Span of the definition's key token, for a diagnostic. */
  span: SourceSpan;
}

/**
 * Definitions no local `$ref` reaches from the root (F30-FR-11). Reachability is
 * transitive: a definition referenced only from another unreachable definition
 * is itself unused, which a plain reference count would miss.
 */
export function unusedDefinitions(text: string): UnusedDefinition[] {
  const root = parse(text);
  if (!root) { return []; }
  const container = existingContainer(root);
  if (!container) { return []; }

  const defs = new Map<string, Node>();
  for (const prop of properties(container.node)) {
    const key = keyNodeOf(prop);
    if (key && typeof key.value === 'string') { defs.set(key.value, prop); }
  }
  if (!defs.size) { return []; }

  // Names referenced from a given subtree.
  const referencedIn = (node: Node): string[] => {
    const names: string[] = [];
    forEachRef(node, ref => {
      const segs = localSegments(ref);
      if (segs && segs.length >= 2 && segs[0] === container.name) { names.push(segs[1]); }
    });
    return names;
  };

  // Roots: refs anywhere outside the definitions container.
  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const prop of properties(root)) {
    if (keyNodeOf(prop)?.value === container.name) { continue; }
    const value = valueNodeOf(prop);
    if (value) { queue.push(...referencedIn(value)); }
  }
  while (queue.length) {
    const name = queue.shift() as string;
    if (reachable.has(name)) { continue; }
    reachable.add(name);
    const def = defs.get(name);
    const value = def && valueNodeOf(def);
    if (value) { queue.push(...referencedIn(value)); }
  }

  const unused: UnusedDefinition[] = [];
  for (const [name, prop] of defs) {
    if (reachable.has(name)) { continue; }
    const key = keyNodeOf(prop) as Node;
    unused.push({ name, span: { start: key.offset, end: key.offset + key.length } });
  }
  return unused;
}

/** Delete every unused definition, leaving a document that still parses. */
export function removeUnusedDefinitions(text: string): RefactorResult {
  const root = parse(text);
  if (!root) { return refuse('The document is not a JSON object.'); }
  const container = existingContainer(root);
  if (!container) { return refuse('This document has no $defs/definitions block.'); }
  const unusedNames = new Set(unusedDefinitions(text).map(u => u.name));
  if (!unusedNames.size) { return refuse('Every definition is referenced.'); }

  const props = properties(container.node);
  const removeIdx = props
    .map((p, i) => ({ i, name: keyNodeOf(p)?.value as string }))
    .filter(({ name }) => unusedNames.has(name))
    .map(({ i }) => i);

  // All gone: empty the container rather than leave dangling separators.
  if (removeIdx.length === props.length) {
    return {
      ok: true,
      edits: [{ offset: container.node.offset, length: container.node.length, newText: '{}' }],
    };
  }

  const edits: TextEditOp[] = [];
  for (const [start, end] of consecutiveRuns(removeIdx)) {
    const first = props[start];
    const last = props[end];
    if (end < props.length - 1) {
      // Eat the separator that follows the run.
      edits.push({ offset: first.offset, length: props[end + 1].offset - first.offset, newText: '' });
    } else {
      // Trailing run: eat the separator that precedes it (start > 0 here,
      // since not every property is being removed).
      const prevEnd = props[start - 1].offset + props[start - 1].length;
      edits.push({ offset: prevEnd, length: last.offset + last.length - prevEnd, newText: '' });
    }
  }
  return { ok: true, edits };
}

/** Group a sorted index list into maximal consecutive [start, end] runs. */
function consecutiveRuns(indices: number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const i of indices) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) { last[1] = i; } else { runs.push([i, i]); }
  }
  return runs;
}

// ── Definition site lookup (F30-FR-13) ───────────────────────────────────────

export interface DefinitionSite {
  name: string;
  /** Span of the token under the cursor — a definition key or a `$ref` string. */
  span: SourceSpan;
  /** Which container spelling the document uses. */
  container: DefContainer;
}

/**
 * The definition addressed at `offset`, whether the cursor sits on the
 * definition's own key or on a local `$ref` that targets it. This is what lets
 * the editor's rename and find-references gestures work from either end.
 */
export function definitionAt(text: string, offset: number): DefinitionSite | undefined {
  const root = parse(text);
  if (!root) { return undefined; }
  const container = existingContainer(root);
  if (!container) { return undefined; }

  // On a definition's own key?
  for (const prop of properties(container.node)) {
    const key = keyNodeOf(prop);
    if (!key || typeof key.value !== 'string') { continue; }
    if (offset >= key.offset && offset <= key.offset + key.length) {
      return {
        name: key.value,
        span: { start: key.offset, end: key.offset + key.length },
        container: container.name,
      };
    }
  }

  // On a local `$ref` pointing into the container?
  let hit: DefinitionSite | undefined;
  forEachRef(root, (ref, node) => {
    if (hit) { return; }
    if (offset < node.offset || offset > node.offset + node.length) { return; }
    const segs = localSegments(ref);
    if (!segs || segs.length < 2 || segs[0] !== container.name) { return; }
    hit = {
      name: segs[1],
      span: { start: node.offset, end: node.offset + node.length },
      container: container.name,
    };
  });
  return hit;
}

/** Span of a definition's key token, for a rename or a reference listing. */
export function definitionKeySpan(text: string, name: string): SourceSpan | undefined {
  const root = parse(text);
  if (!root) { return undefined; }
  const container = existingContainer(root);
  const key = container && keyNodeOf(propertyNamed(container.node, name) ?? ({} as Node));
  if (!key) { return undefined; }
  return { start: key.offset, end: key.offset + key.length };
}

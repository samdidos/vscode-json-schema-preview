// F31 — schema-aware document outline. Pure and VS Code-free: builds a symbol
// tree from schema source so the Outline view, breadcrumbs, Go-to-Symbol and
// sticky scroll all read the *schema's* shape (a property, its type, whether it
// is required) rather than the document's (`properties` → key → `type`).
//
// Reuses the linter's offset-carrying tree (F17), which already normalises JSON
// and YAML into one shape, so this module works for both without a second parser.

import { buildSchemaTree, type TreeNode } from './schemaLinter';
import { describeType } from './fallbackRenderer';
import type { SourceSpan } from './schemaPointer';

/** Symbol kinds the provider maps onto `vscode.SymbolKind` (F31-FR-08). */
export type OutlineKind =
  | 'schema' | 'section' | 'object' | 'array' | 'string'
  | 'number' | 'boolean' | 'null' | 'ref' | 'unknown';

export interface OutlineNode {
  name: string;
  /** Effective type, plus a required marker (F31-FR-03). */
  detail: string;
  kind: OutlineKind;
  /** Full source range of the entry. */
  span: SourceSpan;
  /** Range to reveal when the symbol is selected — the property key. */
  selectionSpan: SourceSpan;
  children: OutlineNode[];
}

/** Depth cap so a self-referential or pathological schema cannot hang the host
 *  (F31-NFR-02). Deeper than any hand-written schema nests in practice. */
const MAX_DEPTH = 20;

const DEF_CONTAINERS = ['$defs', 'definitions'] as const;

type ObjectNode = Extract<TreeNode, { kind: 'object' }>;

function isObjectNode(node: TreeNode | undefined): node is ObjectNode {
  return node?.kind === 'object';
}

function propOf(node: ObjectNode, key: string): TreeNode | undefined {
  return node.props.find(p => p.key === key)?.value;
}

function stringProp(node: ObjectNode, key: string): string | undefined {
  const value = propOf(node, key);
  return value?.kind === 'scalar' && typeof value.value === 'string' ? value.value : undefined;
}

function spanOf(node: TreeNode): SourceSpan {
  return { start: node.offset, end: node.offset + node.length };
}

/**
 * Project only the keys {@link describeType} reads, to a bounded depth. Keeps
 * detail rendering O(1) per symbol instead of converting whole subtrees.
 */
function shallowProjection(node: TreeNode, depth = 2): unknown {
  if (node.kind === 'scalar') { return node.value; }
  if (depth <= 0) { return node.kind === 'array' ? [] : {}; }
  if (node.kind === 'array') { return node.items.map(item => shallowProjection(item, depth - 1)); }
  const out: Record<string, unknown> = {};
  for (const key of ['$ref', 'type', 'enum', 'properties', 'items'] as const) {
    const value = propOf(node, key);
    if (value !== undefined) { out[key] = shallowProjection(value, depth - 1); }
  }
  return out;
}

function kindFor(node: TreeNode | undefined): OutlineKind {
  if (!isObjectNode(node)) { return 'unknown'; }
  if (stringProp(node, '$ref')) { return 'ref'; }
  const type = propOf(node, 'type');
  const name = type?.kind === 'scalar' && typeof type.value === 'string'
    ? type.value
    : type?.kind === 'array' && type.items[0]?.kind === 'scalar' ? String(type.items[0].value) : undefined;
  switch (name) {
    case 'object': case 'array': case 'string': case 'boolean': case 'null': return name;
    case 'number': case 'integer': return 'number';
    default: return isObjectNode(propOf(node, 'properties')) ? 'object' : 'unknown';
  }
}

function detailFor(node: TreeNode | undefined, required: boolean): string {
  const type = isObjectNode(node) ? describeType(shallowProjection(node)) : 'any';
  return required ? `${type} · required` : type;
}

function requiredNames(node: ObjectNode): Set<string> {
  const required = propOf(node, 'required');
  if (required?.kind !== 'array') { return new Set(); }
  return new Set(
    required.items
      .filter(i => i.kind === 'scalar' && typeof i.value === 'string')
      .map(i => String((i as Extract<TreeNode, { kind: 'scalar' }>).value)),
  );
}

/**
 * Children contributed by one schema-position object: its own `properties`,
 * the element schema of an array (F31-FR-02), and the properties declared in
 * any `allOf`/`anyOf`/`oneOf` branch, which belong to the composing schema
 * (F31-FR-06).
 */
function childrenOf(schema: TreeNode | undefined, depth: number): OutlineNode[] {
  if (!isObjectNode(schema) || depth >= MAX_DEPTH) { return []; }
  // A `$ref` is followed by F13, never expanded here (F31-FR-04) — expanding
  // would make a recursive schema's outline infinite.
  if (stringProp(schema, '$ref')) { return []; }

  const out: OutlineNode[] = [];
  const props = propOf(schema, 'properties');
  if (isObjectNode(props)) {
    const required = requiredNames(schema);
    for (const entry of props.props) {
      out.push(symbolFor(entry.key, entry.value, {
        selectionSpan: { start: entry.keyOffset, end: entry.keyOffset + entry.keyLength },
        required: required.has(entry.key),
        depth: depth + 1,
      }));
    }
  }

  // Array elements contribute their properties under the array's own symbol.
  const items = propOf(schema, 'items');
  if (isObjectNode(items)) { out.push(...childrenOf(items, depth + 1)); }
  else if (items?.kind === 'array') {
    for (const item of items.items) { out.push(...childrenOf(item, depth + 1)); }
  }

  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = propOf(schema, keyword);
    if (branches?.kind !== 'array') { continue; }
    for (const branch of branches.items) { out.push(...childrenOf(branch, depth + 1)); }
  }

  return out;
}

function symbolFor(
  name: string,
  schema: TreeNode | undefined,
  opts: { selectionSpan: SourceSpan; required: boolean; depth: number },
): OutlineNode {
  const span = schema ? spanOf(schema) : opts.selectionSpan;
  return {
    name,
    detail: detailFor(schema, opts.required),
    kind: kindFor(schema),
    span: { start: Math.min(opts.selectionSpan.start, span.start), end: span.end },
    selectionSpan: opts.selectionSpan,
    children: childrenOf(schema, opts.depth),
  };
}

/**
 * Build the outline for a schema document (F31-FR-01..08). Total: unparsable or
 * non-object text yields an empty outline rather than throwing.
 *
 * @param fallbackName Used as the root symbol's name when the schema has no
 *                     `title` — normally the file's base name.
 */
export function buildOutline(text: string, languageId: string, fallbackName = 'schema'): OutlineNode[] {
  let root: TreeNode | undefined;
  try {
    root = buildSchemaTree(text, languageId);
  } catch {
    return [];
  }
  if (!isObjectNode(root)) { return []; }

  const children = childrenOf(root, 0);

  // $defs/definitions as one sibling section, so a definition-heavy schema is
  // navigable without hunting for them (F31-FR-05).
  for (const containerName of DEF_CONTAINERS) {
    const entry = root.props.find(p => p.key === containerName);
    if (!entry || !isObjectNode(entry.value)) { continue; }
    const keySpan = { start: entry.keyOffset, end: entry.keyOffset + entry.keyLength };
    children.push({
      name: containerName,
      detail: `${entry.value.props.length} definition${entry.value.props.length === 1 ? '' : 's'}`,
      kind: 'section',
      span: { start: keySpan.start, end: entry.value.offset + entry.value.length },
      selectionSpan: keySpan,
      children: entry.value.props.map(def => symbolFor(def.key, def.value, {
        selectionSpan: { start: def.keyOffset, end: def.keyOffset + def.keyLength },
        required: false,
        depth: 1,
      })),
    });
    break; // one container per document; `$defs` wins when both are present
  }

  return [{
    name: stringProp(root, 'title') ?? fallbackName,
    detail: stringProp(root, '$id') ?? '',
    kind: 'schema',
    span: spanOf(root),
    selectionSpan: spanOf(root),
    children,
  }];
}

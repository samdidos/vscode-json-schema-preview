// F15 — schema diff & breaking-change classification. Pure and VS Code-free:
// walks two parsed schemas structurally (order-insensitive) and classifies each
// change for instance-document compatibility. Rule-based and conservative —
// anything the rules cannot reason about is reported as `unclassified`, never
// dropped (F15-FR-08). The command layer supplies the two versions and renders.

export type DiffKind = 'breaking' | 'non-breaking' | 'informational' | 'unclassified';

export interface DiffEntry {
  path: string; // JSON Pointer to the change site
  kind: DiffKind;
  change: string;
  oldValue?: unknown;
  newValue?: unknown;
}

const META_KEYWORDS = new Set([
  'title', 'description', 'examples', 'default', '$comment',
  'deprecated', 'readOnly', 'writeOnly', '$id', '$schema', '$anchor',
]);

// Keywords whose value is itself a schema → recurse. (`additionalProperties` /
// `additionalItems` are handled specially since they are often booleans.)
const SCHEMA_KEYWORDS = new Set([
  'items', 'contains', 'not', 'if', 'then', 'else',
  'propertyNames', 'unevaluatedItems', 'unevaluatedProperties',
]);
// Keywords whose value is a map of schemas → recurse per key.
const SCHEMA_MAP_KEYWORDS = new Set(['properties', 'patternProperties', '$defs', 'definitions']);

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Order-insensitive deep equality (F15-FR-04). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) { return true; }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/** Compare two schemas and return classified change entries. Never throws. */
export function diffSchemas(oldSchema: unknown, newSchema: unknown): DiffEntry[] {
  const out: DiffEntry[] = [];
  try {
    walk('', oldSchema, newSchema, out);
  } catch {
    out.push({ path: '', kind: 'unclassified', change: 'comparison failed' });
  }
  return out;
}

function walk(path: string, o: unknown, n: unknown, out: DiffEntry[]): void {
  if (deepEqual(o, n)) { return; }
  if (!isObject(o) || !isObject(n)) {
    out.push({ path: path || '(root)', kind: 'unclassified', change: 'schema replaced', oldValue: o, newValue: n });
    return;
  }
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  const closedNew = n.additionalProperties === false;
  for (const k of keys) {
    const ov = o[k];
    const nv = n[k];
    if (deepEqual(ov, nv)) { continue; }
    classifyKeyword(path, k, ov, nv, closedNew, out);
  }
}

function classifyKeyword(
  path: string, key: string, ov: unknown, nv: unknown, closedNew: boolean, out: DiffEntry[],
): void {
  const at = `${path}/${key}`;
  const push = (kind: DiffKind, change: string) => out.push({ path: at, kind, change, oldValue: ov, newValue: nv });

  if (META_KEYWORDS.has(key)) { push('informational', `${key} changed`); return; }

  if (SCHEMA_KEYWORDS.has(key)) {
    walk(at, ov, nv, out);
    return;
  }
  if (SCHEMA_MAP_KEYWORDS.has(key)) {
    diffSchemaMap(at, key === 'properties' ? closedNew : false, ov, nv, out);
    return;
  }

  switch (key) {
    case 'type': return diffType(at, ov, nv, out);
    case 'required': return diffRequired(at, ov, nv, out);
    case 'enum': return diffEnum(at, ov, nv, out);
    case 'const': return void push('breaking', 'const value changed');
    case 'additionalProperties':
    case 'additionalItems':
      return diffAdditional(at, ov, nv, out);
    case 'minimum': case 'exclusiveMinimum': case 'minLength':
    case 'minItems': case 'minProperties': case 'minContains':
      return diffBound(at, 'min', ov, nv, out);
    case 'maximum': case 'exclusiveMaximum': case 'maxLength':
    case 'maxItems': case 'maxProperties': case 'maxContains':
      return diffBound(at, 'max', ov, nv, out);
    case 'multipleOf':
      return void (nv === undefined
        ? push('non-breaking', 'multipleOf removed')
        : push('breaking', ov === undefined ? 'multipleOf added' : 'multipleOf changed'));
    case 'pattern':
      return void (nv === undefined
        ? push('non-breaking', 'pattern removed')
        : push('breaking', ov === undefined ? 'pattern added' : 'pattern changed'));
    case 'uniqueItems':
      return void (nv === true && ov !== true
        ? push('breaking', 'uniqueItems enabled')
        : push('non-breaking', 'uniqueItems relaxed'));
    case 'allOf':
      return diffAllOf(at, ov, nv, out);
    case 'oneOf': case 'anyOf':
      return diffOneAnyOf(at, key, ov, nv, out);
    default:
      // Unknown/extension keyword → informational (F15-FR-07).
      return void push('informational', `${key} changed`);
  }
}

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined ? [] : [v];
}

function diffType(at: string, ov: unknown, nv: unknown, out: DiffEntry[]): void {
  const oldTypes = new Set(toArray(ov).map(String));
  const newTypes = new Set(toArray(nv).map(String));
  const removed = [...oldTypes].filter(t => !newTypes.has(t));
  const added = [...newTypes].filter(t => !oldTypes.has(t));
  if (removed.length) {
    out.push({ path: at, kind: 'breaking', change: `type(s) removed: ${removed.join(', ')}`, oldValue: ov, newValue: nv });
  }
  if (added.length && !removed.length) {
    out.push({ path: at, kind: 'non-breaking', change: `type(s) added: ${added.join(', ')}`, oldValue: ov, newValue: nv });
  }
}

function diffRequired(at: string, ov: unknown, nv: unknown, out: DiffEntry[]): void {
  const oldR = new Set(toArray(ov).map(String));
  const newR = new Set(toArray(nv).map(String));
  const added = [...newR].filter(x => !oldR.has(x));
  const removed = [...oldR].filter(x => !newR.has(x));
  if (added.length) {
    out.push({ path: at, kind: 'breaking', change: `required added: ${added.join(', ')}`, oldValue: ov, newValue: nv });
  }
  if (removed.length) {
    out.push({ path: at, kind: 'non-breaking', change: `required removed: ${removed.join(', ')}`, oldValue: ov, newValue: nv });
  }
}

function diffEnum(at: string, ov: unknown, nv: unknown, out: DiffEntry[]): void {
  const oldV = toArray(ov);
  const newV = toArray(nv);
  const removed = oldV.filter(x => !newV.some(y => deepEqual(x, y)));
  const added = newV.filter(x => !oldV.some(y => deepEqual(x, y)));
  if (removed.length) {
    out.push({ path: at, kind: 'breaking', change: `enum value(s) removed`, oldValue: ov, newValue: nv });
  }
  if (added.length && !removed.length) {
    out.push({ path: at, kind: 'non-breaking', change: `enum value(s) added`, oldValue: ov, newValue: nv });
  }
}

function diffAdditional(at: string, ov: unknown, nv: unknown, out: DiffEntry[]): void {
  // Object-valued additionalProperties → recurse as a schema.
  if (isObject(ov) && isObject(nv)) { walk(at, ov, nv, out); return; }
  const wasOpen = ov !== false; // absent or true
  const nowClosed = nv === false;
  if (wasOpen && nowClosed) {
    out.push({ path: at, kind: 'breaking', change: 'additional items/properties disallowed', oldValue: ov, newValue: nv });
  } else if (ov === false && nv !== false) {
    out.push({ path: at, kind: 'non-breaking', change: 'additional items/properties allowed', oldValue: ov, newValue: nv });
  } else {
    out.push({ path: at, kind: 'unclassified', change: 'additionalProperties/Items changed', oldValue: ov, newValue: nv });
  }
}

function diffBound(at: string, kind: 'min' | 'max', ov: unknown, nv: unknown, out: DiffEntry[]): void {
  const on = typeof ov === 'number' ? ov : undefined;
  const nn = typeof nv === 'number' ? nv : undefined;
  const push = (k: DiffKind, change: string) => out.push({ path: at, kind: k, change, oldValue: ov, newValue: nv });
  if (nn === undefined) { push('non-breaking', 'bound removed'); return; }
  if (on === undefined) { push('breaking', 'bound added'); return; }
  if (kind === 'min') {
    push(nn > on ? 'breaking' : 'non-breaking', nn > on ? 'lower bound raised' : 'lower bound lowered');
  } else {
    push(nn < on ? 'breaking' : 'non-breaking', nn < on ? 'upper bound lowered' : 'upper bound raised');
  }
}

function diffAllOf(at: string, ov: unknown, nv: unknown, out: DiffEntry[]): void {
  const oldLen = Array.isArray(ov) ? ov.length : 0;
  const newLen = Array.isArray(nv) ? nv.length : 0;
  if (newLen > oldLen) {
    out.push({ path: at, kind: 'breaking', change: 'allOf branch added (restricts valid instances)', oldValue: ov, newValue: nv });
  } else if (newLen < oldLen) {
    out.push({ path: at, kind: 'non-breaking', change: 'allOf branch removed', oldValue: ov, newValue: nv });
  } else {
    out.push({ path: at, kind: 'unclassified', change: 'allOf branches changed', oldValue: ov, newValue: nv });
  }
}

function diffOneAnyOf(at: string, key: string, ov: unknown, nv: unknown, out: DiffEntry[]): void {
  const oldLen = Array.isArray(ov) ? ov.length : 0;
  const newLen = Array.isArray(nv) ? nv.length : 0;
  if (newLen < oldLen) {
    out.push({ path: at, kind: 'breaking', change: `${key} branch removed`, oldValue: ov, newValue: nv });
  } else if (newLen > oldLen) {
    out.push({ path: at, kind: 'non-breaking', change: `${key} branch added`, oldValue: ov, newValue: nv });
  } else {
    out.push({ path: at, kind: 'unclassified', change: `${key} branches changed`, oldValue: ov, newValue: nv });
  }
}

function diffSchemaMap(at: string, closedNew: boolean, ov: unknown, nv: unknown, out: DiffEntry[]): void {
  const oldMap = isObject(ov) ? ov : {};
  const newMap = isObject(nv) ? nv : {};
  const names = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  for (const name of names) {
    const inOld = name in oldMap;
    const inNew = name in newMap;
    if (inOld && !inNew) {
      out.push({
        path: `${at}/${name}`,
        kind: closedNew ? 'breaking' : 'non-breaking',
        change: closedNew ? 'property removed (additionalProperties is false)' : 'property definition removed',
        oldValue: oldMap[name],
      });
    } else if (!inOld && inNew) {
      out.push({ path: `${at}/${name}`, kind: 'non-breaking', change: 'property added', newValue: newMap[name] });
    } else {
      walk(`${at}/${name}`, oldMap[name], newMap[name], out);
    }
  }
}

// ── Report rendering (Markdown) ──────────────────────────────────────────────

const ORDER: DiffKind[] = ['breaking', 'non-breaking', 'informational', 'unclassified'];
const LABEL: Record<DiffKind, string> = {
  breaking: 'Breaking', 'non-breaking': 'Non-breaking',
  informational: 'Informational', unclassified: 'Unclassified',
};

/** Count entries by kind. */
export function summarise(entries: DiffEntry[]): Record<DiffKind, number> {
  const counts: Record<DiffKind, number> = { breaking: 0, 'non-breaking': 0, informational: 0, unclassified: 0 };
  for (const e of entries) { counts[e.kind]++; }
  return counts;
}

/** One-line summary (F15-FR-10). */
export function summaryLine(entries: DiffEntry[]): string {
  const c = summarise(entries);
  return ORDER.map(k => `${c[k]} ${LABEL[k].toLowerCase()}`).join(', ');
}

/** Grouped, text-first Markdown report (F15-FR-09); severity by label, not colour. */
export function renderReport(entries: DiffEntry[], header: string): string {
  const lines: string[] = [`# Schema diff — ${header}`, '', `**Summary:** ${summaryLine(entries)}`, ''];
  for (const kind of ORDER) {
    const group = entries.filter(e => e.kind === kind);
    if (!group.length) { continue; }
    lines.push(`## ${LABEL[kind]} (${group.length})`, '');
    for (const e of group) {
      const oldStr = e.oldValue === undefined ? '—' : JSON.stringify(e.oldValue);
      const newStr = e.newValue === undefined ? '—' : JSON.stringify(e.newValue);
      lines.push(`- \`${e.path || '(root)'}\` — ${e.change}: ${oldStr} → ${newStr}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// F23 — schema coverage ("unused-in-data" lens). Pure and VS Code-free: given a
// parsed schema and one or more parsed data instances, it computes which
// schema-declared properties are never exercised by the data. This is a
// heuristic *presence* analysis (F23-NFR-02), not validation — it does not
// resolve remote $ref, evaluate conditional applicability, or reason about
// patternProperties. The command layer resolves the binding and renders.

import { isObject, parseJsonPointer, resolvePointer } from './schemaPointer';

export interface SchemaProperty {
  /** Human data-space path: dotted, with `[]` for array descent (e.g. `a.b`, `items[].tag`). */
  dataPath: string;
  /** JSON Pointer (schema space) to the property's subschema definition. */
  schemaPointer: string;
  /** The property's own name (last path segment). */
  name: string;
}

export interface CoverageResult {
  total: number;
  exercised: SchemaProperty[];
  unexercised: SchemaProperty[];
  /** 0–100, rounded; 100 when the schema declares no properties. */
  percent: number;
}

const ADD = (path: string, seg: string) => (path ? `${path}.${seg}` : seg);

/**
 * Collect every property the schema *declares*, keyed by its data-space path
 * (F23-FR-04). Recurses through nested object `properties`, array `items`, the
 * `allOf`/`anyOf`/`oneOf` branches, and same-document `$ref` targets, guarding
 * against reference cycles. Deduped by dataPath (first definition wins).
 */
export function collectSchemaProperties(schema: unknown): SchemaProperty[] {
  const out: SchemaProperty[] = [];
  const seen = new Set<string>(); // dataPaths already recorded
  const visiting = new Set<string>(); // schemaPointers on the current ref stack (cycle guard)
  const root = schema;

  function recurse(node: unknown, dataPath: string, schemaPointer: string): void {
    if (!isObject(node)) { return; }

    // Follow a same-document $ref before anything else (F23-FR-04).
    const ref = node.$ref;
    if (typeof ref === 'string' && ref.startsWith('#')) {
      const target = resolvePointer(root, parseJsonPointer(ref));
      const targetPtr = ref.slice(1); // drop the leading '#'
      if (isObject(target) && !visiting.has(targetPtr)) {
        visiting.add(targetPtr);
        recurse(target, dataPath, targetPtr);
        visiting.delete(targetPtr);
      }
    }

    const props = node.properties;
    if (isObject(props)) {
      for (const [name, sub] of Object.entries(props)) {
        const childPath = ADD(dataPath, name);
        const childPtr = `${schemaPointer}/properties/${escapePtr(name)}`;
        if (!seen.has(childPath)) {
          seen.add(childPath);
          out.push({ dataPath: childPath, schemaPointer: childPtr, name });
        }
        recurse(sub, childPath, childPtr);
      }
    }

    // Array items: descend into the element schema(s) under a `[]` data path.
    const items = node.items;
    if (Array.isArray(items)) {
      items.forEach((el, i) => recurse(el, `${dataPath}[]`, `${schemaPointer}/items/${i}`));
    } else if (isObject(items)) {
      recurse(items, `${dataPath}[]`, `${schemaPointer}/items`);
    }

    // Composition branches contribute properties at the same data level.
    for (const kw of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = node[kw];
      if (Array.isArray(branches)) {
        branches.forEach((b, i) => recurse(b, dataPath, `${schemaPointer}/${kw}/${i}`));
      }
    }
  }

  recurse(root, '', '');
  return out;
}

/** RFC 6901 escape for a pointer segment (`~` → `~0`, `/` → `~1`). */
function escapePtr(seg: string): string {
  return seg.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Collect the set of property paths *present* in a data instance (F23-FR-05),
 * array indices collapsed to `[]`, matching {@link collectSchemaProperties}'s
 * data-space key format.
 */
export function collectDataPaths(data: unknown): Set<string> {
  const present = new Set<string>();
  function walk(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      for (const el of node) { walk(el, `${path}[]`); }
    } else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        const childPath = ADD(path, key);
        present.add(childPath);
        walk(value, childPath);
      }
    }
  }
  walk(data, '');
  return present;
}

/**
 * Compute coverage of `schema` by `instances` (F23-FR-05/06). A declared
 * property is exercised when its data path is present in any instance. Never
 * throws; malformed inputs simply contribute nothing.
 */
export function computeCoverage(schema: unknown, instances: unknown[]): CoverageResult {
  let properties: SchemaProperty[] = [];
  try {
    properties = collectSchemaProperties(schema);
  } catch {
    properties = [];
  }

  const present = new Set<string>();
  for (const inst of instances) {
    try {
      for (const p of collectDataPaths(inst)) { present.add(p); }
    } catch {
      // isolate a bad instance; others still count
    }
  }

  const exercised: SchemaProperty[] = [];
  const unexercised: SchemaProperty[] = [];
  for (const p of properties) {
    (present.has(p.dataPath) ? exercised : unexercised).push(p);
  }

  const total = properties.length;
  const percent = total === 0 ? 100 : Math.round((exercised.length / total) * 100);
  return { total, exercised, unexercised, percent };
}

/** Grouped, text-first Markdown report of the unexercised surface (F23-FR-08). */
export function renderCoverageReport(result: CoverageResult, header: string): string {
  const lines: string[] = [
    `# Schema coverage — ${header}`,
    '',
    `**Coverage:** ${result.exercised.length} / ${result.total} declared properties exercised (${result.percent}%).`,
    '',
  ];
  if (result.unexercised.length === 0) {
    lines.push('Every declared property is exercised by the data. 🎉', '');
  } else {
    lines.push(`## Unexercised properties (${result.unexercised.length})`, '');
    for (const p of result.unexercised) {
      lines.push(`- \`${p.dataPath}\``);
    }
    lines.push('');
  }
  lines.push(
    '---',
    '',
    '_Heuristic presence analysis: an unexercised property means the data never',
    'set it, not that it is provably dead. Remote `$ref`, conditional',
    '(`if`/`then`), and `patternProperties` applicability are not evaluated._',
  );
  return lines.join('\n');
}

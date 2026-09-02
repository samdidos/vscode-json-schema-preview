// F06-FR-13/14/15 — deterministic enrichment of a structurally inferred schema.
// Pure and VS Code-free: given the schema genson produced and the data it was
// produced from, add what structure alone cannot see — a `format` when every
// observed string at a path matches one, an `enum` when a path repeats a small
// closed set often enough to call it a contract. Additive and idempotent: it
// never removes, renames or retypes anything the structural pass produced.
//
// The model-assisted pass (F32-FR-10) builds on this; it never replaces it.

import { collectDataEntries } from './schemaCoverage';

type Schema = Record<string, unknown>;

/** Enum inference thresholds (F06-FR-14). */
export const ENUM_MIN_OBSERVATIONS = 4;
export const ENUM_MAX_DISTINCT = 5;
export const ENUM_MAX_DISTINCT_RATIO = 0.5;

/**
 * Formats detected, in the order tested. Each predicate is deliberately strict:
 * a false `format` turns valid data invalid, so ambiguity means no format.
 */
/**
 * `local@domain.tld`, decided by scanning rather than by a pattern.
 *
 * The obvious regex — `^[^\s@]+@[^\s@]+\.[^\s@]+$` — is ambiguous: `.` is also
 * matched by `[^\s@]`, so a long address with no dot makes the engine try every
 * split. These values come from whatever data a user infers from, so the check
 * has to be linear in the input's length, not quadratic.
 */
function isEmail(value: string): boolean {
  if (value.length > 254 || /\s/.test(value)) { return false; }
  const at = value.indexOf('@');
  // Exactly one `@`, with something on each side.
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) { return false; }
  const dot = value.lastIndexOf('.');
  // A dot inside the domain, neither leading nor trailing.
  return dot > at + 1 && dot < value.length - 1;
}

/** Four dot-separated octets, compared numerically — no backtracking. */
function isIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) { return false; }
  return parts.every(part =>
    part.length >= 1 && part.length <= 3 &&
    /^\d+$/.test(part) &&
    // Reject a leading zero (`01`) so the format stays unambiguous.
    (part.length === 1 || part[0] !== '0') &&
    Number(part) <= 255);
}

const FORMATS: ReadonlyArray<[format: string, matches: (value: string) => boolean]> = [
  ['date-time', v => /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v))],
  ['date', v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))],
  ['uuid', v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)],
  ['email', isEmail],
  ['ipv4', isIpv4],
  ['uri', v => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(v)],
];

/** The single format every value matches, or undefined (F06-FR-13). */
export function detectFormat(values: readonly string[]): string | undefined {
  if (!values.length) { return undefined; }
  for (const [format, matches] of FORMATS) {
    if (values.every(matches)) { return format; }
  }
  return undefined;
}

/** A closed set of values worth declaring as an enum, or undefined (F06-FR-14). */
export function detectEnum(values: readonly string[]): string[] | undefined {
  if (values.length < ENUM_MIN_OBSERVATIONS) { return undefined; }
  const distinct = [...new Set(values)];
  if (distinct.length > ENUM_MAX_DISTINCT) { return undefined; }
  if (distinct.length / values.length > ENUM_MAX_DISTINCT_RATIO) { return undefined; }
  if (distinct.some(v => v.trim() === '')) { return undefined; }
  return distinct.sort();
}

function isObject(v: unknown): v is Schema {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Only string values, and only when *every* value at the path is a string. */
function stringsAt(values: unknown[]): string[] | undefined {
  return values.every(v => typeof v === 'string') ? (values as string[]) : undefined;
}

/**
 * Resolve the subschema genson produced for a data path such as `a.b[].c`,
 * walking `properties` / `items` in the inferred (single-document) shape. genson
 * may emit `anyOf` for a mixed path; those are left untouched.
 */
function subschemaFor(schema: Schema, dataPath: string): Schema | undefined {
  let node: Schema | undefined = schema;
  for (const rawSegment of dataPath.split('.')) {
    if (!node) { return undefined; }
    const arrays = (rawSegment.match(/\[\]/g) ?? []).length;
    const key = rawSegment.replace(/\[\]/g, '');
    const props = node.properties;
    if (!isObject(props) || !isObject(props[key])) { return undefined; }
    node = props[key] as Schema;
    for (let i = 0; i < arrays; i++) {
      node = isObject(node?.items) ? (node!.items as Schema) : undefined;
    }
  }
  return node;
}

/**
 * Enrich `schema` (as produced by structural inference over `data`) in place
 * on a copy, returning the copy (F06-FR-15). For JSONL, pass the array of
 * records; every record's values then count toward the same paths.
 */
export function enrichInferredSchema(schema: unknown, data: unknown): unknown {
  if (!isObject(schema)) { return schema; }
  const copy = JSON.parse(JSON.stringify(schema)) as Schema;

  // An array root (JSONL, or a top-level list) infers as { items: {...} }; its
  // element paths are what we collect, and they resolve under `items`.
  const isRootArray = Array.isArray(data);
  const root = isRootArray && isObject(copy.items) ? (copy.items as Schema) : copy;
  const observations = collectDataEntries(isRootArray ? data : [data]);

  for (const [path, values] of observations) {
    const target = subschemaFor(root, path.replace(/^\[\]\.?/, ''));
    if (!target || target.type !== 'string') { continue; }
    const strings = stringsAt(values);
    if (!strings) { continue; }

    if (!('format' in target)) {
      const format = detectFormat(strings);
      if (format) { target.format = format; }
    }
    if (!('enum' in target) && !('format' in target)) {
      const values_ = detectEnum(strings);
      if (values_) { target.enum = values_; }
    }
  }
  return copy;
}

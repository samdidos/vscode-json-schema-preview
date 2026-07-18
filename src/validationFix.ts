// F21 — validation quick fixes (pure, VS Code-free). Maps an Ajv validation
// error to zero or more concrete, mechanical repairs of the *data* document, and
// computes the edits for a repair against the document's current text via
// jsonc-parser's `modify` (so offsets are never captured stale — F21-FR-06).
// Only unambiguously-safe fixes are produced (F21-FR-01..05); anything whose
// correct value cannot be known has no fix.

import { modify, applyEdits, parseTree, findNodeAtLocation, type Edit, type FormattingOptions } from 'jsonc-parser';
import { parseJsonPointer, isObject } from './schemaPointer';

/** The subset of an Ajv `ErrorObject` this module needs (kept structural so it
 *  neither imports ajv nor couples to a specific ajv version). */
export interface AjvErrorLike {
  keyword: string;
  /** RFC 6901 JSON Pointer into the *data* instance. */
  instancePath: string;
  params: Record<string, unknown>;
  message?: string;
}

type FixKind =
  | 'add-required'
  | 'remove-additional'
  | 'set-enum'
  | 'set-const'
  | 'coerce-type';

/**
 * A self-contained, schema-free repair: the data-instance path to edit plus the
 * value to write there (or a removal). Edit offsets are intentionally NOT stored
 * — they are derived from current text in {@link computeFixEdits}.
 */
export interface ValidationFix {
  title: string;
  kind: FixKind;
  /** jsonc-parser path (numbers for array indices) to the node to modify. */
  path: (string | number)[];
  /** Value to write; ignored when `remove` is true. */
  value?: unknown;
  remove?: boolean;
  /** F25: the editor's default/preferred quick fix (a clear enum near-miss). */
  preferred?: boolean;
}

/** Coerce numeric-looking pointer tokens to numbers for jsonc-parser paths. */
function toModifyPath(segments: string[]): (string | number)[] {
  return segments.map(s => (/^\d+$/.test(s) ? Number(s) : s));
}

/**
 * Walk `schema` following a data `instancePath` best-effort through `properties`
 * and `items`, returning the subschema that governs that node — or `undefined`
 * when the path cannot be followed structurally (e.g. it runs through `$ref`,
 * `allOf`, or `patternProperties`, which this conservative walk does not
 * resolve). Used only to pick a sensible placeholder (F21-FR-02).
 */
function resolveDataSubschema(schema: unknown, segments: string[]): Record<string, unknown> | undefined {
  let cur: unknown = schema;
  for (const seg of segments) {
    if (!isObject(cur)) { return undefined; }
    if (/^\d+$/.test(seg)) {
      const items = cur.items;
      if (Array.isArray(items)) { cur = items[Number(seg)]; }
      else if (isObject(items)) { cur = items; }
      else { return undefined; }
    } else {
      const props = cur.properties;
      if (isObject(props) && seg in props) { cur = props[seg]; }
      else { return undefined; }
    }
  }
  return isObject(cur) ? cur : undefined;
}

/** A type-appropriate empty placeholder for a property with no better hint. */
function emptyForType(type: unknown): unknown {
  const t = Array.isArray(type) ? type[0] : type;
  switch (t) {
    case 'string': return '';
    case 'number': case 'integer': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    case 'null': return null;
    default: return null;
  }
}

/**
 * The value to insert for a newly-added required property (F21-FR-02): the
 * property subschema's `const`, else `default`, else `enum[0]`, else a
 * type-appropriate empty value; `null` when the subschema cannot be resolved.
 */
function placeholderFor(schema: unknown, objectSegments: string[], propName: string): unknown {
  const objSchema = resolveDataSubschema(schema, objectSegments);
  const propSchema = objSchema && isObject(objSchema.properties) && isObject(objSchema.properties[propName])
    ? (objSchema.properties[propName] as Record<string, unknown>)
    : undefined;
  if (!propSchema) { return null; }
  if ('const' in propSchema) { return propSchema.const; }
  if ('default' in propSchema) { return propSchema.default; }
  if (Array.isArray(propSchema.enum) && propSchema.enum.length) { return propSchema.enum[0]; }
  return emptyForType(propSchema.type);
}

/** Attempt a lossless coercion of `value` to one of the `expected` types. */
function coerce(value: unknown, expected: unknown): { ok: true; value: unknown } | { ok: false } {
  const types = new Set((Array.isArray(expected) ? expected : [expected]).map(String));
  if (types.has('string') && (typeof value === 'number' || typeof value === 'boolean')) {
    return { ok: true, value: String(value) };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((types.has('number') || types.has('integer')) && trimmed !== '' && Number.isFinite(Number(trimmed))) {
      const n = Number(trimmed);
      if (types.has('integer') && !Number.isInteger(n)) { /* fall through */ }
      else { return { ok: true, value: n }; }
    }
    if (types.has('boolean') && (trimmed === 'true' || trimmed === 'false')) {
      return { ok: true, value: trimmed === 'true' };
    }
  }
  return { ok: false };
}

const MAX_ENUM_FIXES = 6;

/** Levenshtein edit distance between two strings (F25-FR-02). */
export function levenshtein(a: string, b: string): number {
  if (a === b) { return 0; }
  if (a.length === 0) { return b.length; }
  if (b.length === 0) { return a.length; }
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export interface RankedCandidate {
  value: unknown;
  /** True for the single closest candidate. */
  closest: boolean;
  /** True when the closest candidate is a genuine near-miss (case-only or small typo). */
  preferred: boolean;
}

/**
 * Rank `enum` candidates by similarity to the offending `current` value
 * (F25-FR-02/03). String candidates are ordered by case-insensitive edit
 * distance (case-sensitive distance as a tie-break), with a stable fall-back to
 * schema order; non-string candidates (or a non-string `current`) keep schema
 * order. The single closest candidate is flagged, and marked preferred only when
 * it is a case-only difference or an edit distance within a small fraction of
 * its length. Never throws.
 */
export function rankEnumCandidates(current: unknown, candidates: unknown[]): RankedCandidate[] {
  const currentStr = typeof current === 'string' ? current : undefined;
  const scored = candidates.map((value, index) => {
    if (currentStr === undefined || typeof value !== 'string') {
      return { value, index, ci: Infinity, cs: Infinity };
    }
    return {
      value,
      index,
      ci: levenshtein(currentStr.toLowerCase(), value.toLowerCase()),
      cs: levenshtein(currentStr, value),
    };
  });
  scored.sort((a, b) => a.ci - b.ci || a.cs - b.cs || a.index - b.index);

  return scored.map((s, rank) => {
    const isClosest = rank === 0 && Number.isFinite(s.ci) && candidates.length > 0;
    let preferred = false;
    if (isClosest && typeof s.value === 'string' && currentStr !== undefined) {
      const cand = s.value.toLowerCase();
      const cur = currentStr.toLowerCase();
      const threshold = Math.max(1, Math.floor(s.value.length * 0.34));
      // A near-miss is a case-only difference, a small typo, or an abbreviation
      // (the typed value is a ≥2-char prefix of the candidate, e.g. prod→production).
      const isPrefix = cur.length >= 2 && (cand.startsWith(cur) || cur.startsWith(cand));
      preferred = s.ci <= threshold || isPrefix;
    }
    return { value: s.value, closest: isClosest, preferred };
  });
}

/**
 * Map Ajv errors to concrete fixes (F21-FR-01). `data` is the parsed instance
 * (needed only to read the offending value for `type` coercion); `schema` is the
 * compiled schema (needed only to pick placeholders for `required`).
 */
export function buildFixes(errors: AjvErrorLike[], schema: unknown, data: unknown): ValidationFix[] {
  const fixes: ValidationFix[] = [];
  for (const err of errors) {
    const segments = parseJsonPointer(err.instancePath);
    const path = toModifyPath(segments);
    switch (err.keyword) {
      case 'required': {
        const name = String(err.params.missingProperty ?? '');
        if (!name) { break; }
        fixes.push({
          title: `Add missing required property "${name}"`,
          kind: 'add-required',
          path: [...path, name],
          value: placeholderFor(schema, segments, name),
        });
        break;
      }
      case 'additionalProperties':
      case 'unevaluatedProperties': {
        const name = String(err.params.additionalProperty ?? err.params.unevaluatedProperty ?? '');
        if (!name) { break; }
        fixes.push({
          title: `Remove unexpected property "${name}"`,
          kind: 'remove-additional',
          path: [...path, name],
          remove: true,
        });
        break;
      }
      case 'enum': {
        const allowed = Array.isArray(err.params.allowedValues) ? err.params.allowedValues : [];
        // F25: rank by nearest match to the offending value before the cap, so
        // the closest candidate survives and is offered first.
        const ranked = rankEnumCandidates(readAt(data, segments), allowed);
        for (const cand of ranked.slice(0, MAX_ENUM_FIXES)) {
          const suffix = cand.closest && allowed.length > 1 ? ' (closest match)' : '';
          fixes.push({
            title: `Change to ${JSON.stringify(cand.value)}${suffix}`,
            kind: 'set-enum',
            path,
            value: cand.value,
            preferred: cand.preferred || undefined,
          });
        }
        break;
      }
      case 'const': {
        if ('allowedValue' in err.params) {
          fixes.push({
            title: `Change to ${JSON.stringify(err.params.allowedValue)}`,
            kind: 'set-const',
            path,
            value: err.params.allowedValue,
          });
        }
        break;
      }
      case 'type': {
        const current = readAt(data, segments);
        const result = coerce(current, err.params.type);
        if (result.ok) {
          fixes.push({ title: `Change to ${JSON.stringify(result.value)}`, kind: 'coerce-type', path, value: result.value });
        }
        break;
      }
      default:
        break; // no safe mechanical fix (F21-FR-05 / F17-FR-12 discipline)
    }
  }
  return fixes;
}

/** Read the value at a data pointer, or `undefined` if the path is missing. */
function readAt(data: unknown, segments: string[]): unknown {
  let cur: unknown = data;
  for (const seg of segments) {
    if (Array.isArray(cur) && /^\d+$/.test(seg)) { cur = cur[Number(seg)]; }
    else if (isObject(cur) && seg in cur) { cur = cur[seg]; }
    else { return undefined; }
  }
  return cur;
}

const DEFAULT_FORMATTING: FormattingOptions = { insertSpaces: true, tabSize: 2 };

/**
 * Compute the jsonc-parser edits that apply `fix` to `text` (F21-FR-06). Returns
 * an empty array when the target no longer exists or the edit is a no-op, so a
 * stale fix produces no action.
 */
export function computeFixEdits(text: string, fix: ValidationFix, formatting: FormattingOptions = DEFAULT_FORMATTING): Edit[] {
  const tree = parseTree(text);
  if (!tree) { return []; }
  // Honour F21-FR-06: never resurrect a deleted node. `modify` would happily
  // create missing parents, so require them to still exist. For an insertion the
  // parent object must exist; for a replace/remove the target node itself must.
  if (fix.kind === 'add-required') {
    const parent = fix.path.slice(0, -1);
    const parentNode = parent.length ? findNodeAtLocation(tree, parent) : tree;
    if (!parentNode || parentNode.type !== 'object') { return []; }
  } else {
    const node = fix.path.length ? findNodeAtLocation(tree, fix.path) : tree;
    if (!node) { return []; }
  }
  const value = fix.remove ? undefined : fix.value;
  return modify(text, fix.path, value, { formattingOptions: formatting });
}

/** Convenience for tests: the text after applying `fix`. */
export function applyFix(text: string, fix: ValidationFix, formatting: FormattingOptions = DEFAULT_FORMATTING): string {
  return applyEdits(text, computeFixEdits(text, fix, formatting));
}

/** Escape a JSON Pointer reference token (RFC 6901), so the pointer this module
 *  builds matches the `instancePath` Ajv reports for the same node. */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Build the Ajv-style `instancePath` string for pointer `segments`
 *  (`[]` → `/`, the root). */
export function pointerOf(segments: (string | number)[]): string {
  return segments.length ? '/' + segments.map(s => escapePointerToken(String(s))).join('/') : '/';
}

/**
 * The `instancePath` of the *error* a fix addresses — i.e. the diagnostic it
 * belongs to. `add-required`/`remove-additional` edit a child keyed by the last
 * path segment, so their error sits on the *parent* object; the value edits
 * (`set-enum`/`set-const`/`coerce-type`) sit on the node itself. Used to match a
 * fix to the validation diagnostics present at the cursor (F21-FR-08), which is
 * robust to the diagnostic range sitting on a key while the edit rewrites the
 * value.
 */
export function fixTargetPointer(fix: ValidationFix): string {
  const segments = fix.kind === 'add-required' || fix.kind === 'remove-additional'
    ? fix.path.slice(0, -1)
    : fix.path;
  return pointerOf(segments);
}

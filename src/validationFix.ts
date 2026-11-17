// F21 — validation quick fixes (pure, VS Code-free). Maps an Ajv validation
// error to zero or more concrete, mechanical repairs of the *data* document, and
// computes the edits for a repair against the document's current text via
// jsonc-parser's `modify` (so offsets are never captured stale — F21-FR-06).
// Only unambiguously-safe fixes are produced (F21-FR-01..05); anything whose
// correct value cannot be known has no fix.

import { modify, applyEdits, parseTree, findNodeAtLocation, type Edit, type FormattingOptions } from 'jsonc-parser';
import { parse as parseYaml } from 'yaml';
import { parseJsonPointer, isObject } from './schemaPointer';
import { isYaml, isToml, parseToml, parseJsonl, jsonlRecordSpans } from './languages';
import { yamlFixEdits } from './dataFixYaml';
import { tomlFixEdits } from './dataFixToml';

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
  | 'rename-property'
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
  /** `rename-property` only: the key `path`'s last segment is renamed to. */
  newName?: string;
  /** F25: the editor's default/preferred quick fix (a clear near-miss). */
  preferred?: boolean;
  /** JSONL only: index of the record (line) this fix repairs (F21-FR-12). */
  record?: number;
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

/**
 * Edit distance between two strings (F25-FR-02): Levenshtein's insertions,
 * deletions and substitutions, plus a swap of two adjacent characters counted
 * as one edit rather than two — `prot` is one slip from `port`, not two.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) { return 0; }
  if (a.length === 0) { return b.length; }
  if (b.length === 0) { return a.length; }
  let prev2 = new Array<number>(b.length + 1);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }
    }
    [prev2, prev, curr] = [prev, curr, prev2];
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
      ci: editDistance(currentStr.toLowerCase(), value.toLowerCase()),
      cs: editDistance(currentStr, value),
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
 * The declared property an unexpected key most plausibly meant (F25-FR-05/06):
 * the closest name among the object's `properties` that the object does not
 * already have, and only when it is a genuine near-miss by the same test that
 * marks an enum candidate preferred. `undefined` when there is no such name —
 * including when the governing subschema cannot be resolved.
 */
function nearestDeclaredProperty(name: string, schema: unknown, objectSegments: string[], object: unknown): string | undefined {
  const declared = resolveDataSubschema(schema, objectSegments)?.properties;
  if (!isObject(declared)) { return undefined; }
  const present = isObject(object) ? object : {};
  const free = Object.keys(declared).filter(key => !(key in present));
  const [closest] = rankEnumCandidates(name, free);
  return closest?.preferred ? (closest.value as string) : undefined;
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
        // F25-FR-05: an unexpected key that is a near-miss of a declared one is
        // far more likely a typo than data to delete, so offer the rename first.
        const intended = nearestDeclaredProperty(name, schema, segments, readAt(data, segments));
        if (intended !== undefined) {
          fixes.push({
            title: `Rename to ${JSON.stringify(intended)} (closest match)`,
            kind: 'rename-property',
            path: [...path, name],
            newName: intended,
            preferred: true,
          });
        }
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
 * Compute the edits that apply `fix` to `text` (F21-FR-06), in the document's
 * own format. Returns an empty array when the target no longer exists or the
 * edit is a no-op, so a stale fix produces no action.
 *
 * JSON/JSONC go through jsonc-parser's `modify`. YAML, TOML and JSONL each have
 * their own edit builder, and every edit those produce is checked before it is
 * returned (F21-FR-14): the edited text must parse to exactly the original data
 * with this one fix applied, or no edit is offered at all.
 */
export function computeFixEdits(
  text: string,
  fix: ValidationFix,
  formatting: FormattingOptions = DEFAULT_FORMATTING,
  languageId = 'json',
): Edit[] {
  if (isYaml(languageId)) { return verified(text, yamlFixEdits(text, fix), fix, parseYaml); }
  if (isToml(languageId)) { return verified(text, tomlFixEdits(text, fix), fix, parseToml); }
  if (languageId === 'jsonl') { return verified(text, jsonlFixEdits(text, fix), fix, parseJsonl); }
  return jsonFixEdits(text, fix, formatting);
}

/** A JSONL fix is a JSON fix on its record's line, written without reformatting
 *  so the record stays on that one line. */
function jsonlFixEdits(text: string, fix: ValidationFix): Edit[] {
  const line = fix.record === undefined ? undefined : jsonlRecordSpans(text)[fix.record];
  if (!line) { return []; }
  return jsonFixEdits(text.slice(line.start, line.end), fix, undefined)
    .map(edit => ({ ...edit, offset: edit.offset + line.start }));
}

/** `edits` when applying them yields the intended data, else none (F21-FR-14). */
function verified(text: string, edits: Edit[], fix: ValidationFix, parse: (text: string) => unknown): Edit[] {
  if (!edits.length) { return edits; }
  try {
    const expected = applyFixToData(parse(text), fix);
    return sameData(parse(applyEdits(text, edits)), expected) ? edits : [];
  } catch {
    return [];
  }
}

/** The data `fix` is meant to produce from `data` — for a JSONL fix, `data` is
 *  the list of records and only the fix's own record changes. */
function applyFixToData(data: unknown, fix: ValidationFix): unknown {
  const root = structuredClone(data);
  const path = fix.record === undefined ? fix.path : [fix.record, ...fix.path];
  if (!path.length) { return fix.value; }
  let parent = root as Record<string | number, unknown>;
  for (const segment of path.slice(0, -1)) { parent = parent[segment] as Record<string | number, unknown>; }
  const name = path[path.length - 1];
  if (fix.kind === 'remove-additional') { delete parent[name]; }
  else if (fix.kind === 'rename-property') {
    parent[fix.newName as string] = parent[name];
    delete parent[name];
  } else { parent[name] = fix.value; }
  return root;
}

/** Structural equality of parsed data: key order is irrelevant, dates compare
 *  by instant (TOML parses date-times to `Date`s). */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) { return true; }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameData(item, b[i]));
  }
  if (!isObject(a) || !isObject(b)) { return false; }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => key in b && sameData(a[key], b[key]));
}

function jsonFixEdits(text: string, fix: ValidationFix, formatting: FormattingOptions | undefined): Edit[] {
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
  if (fix.kind === 'rename-property') {
    // The target exists (checked above), so its parent is a property node whose
    // first child is the key. Renaming onto a key the object already has would
    // create a duplicate, so that — like any other stale fix — yields no edit.
    const property = findNodeAtLocation(tree, fix.path)!.parent!;
    const key = property.children![0];
    const taken = property.parent!.children!.some(sibling => sibling.children?.[0]?.value === fix.newName);
    if (fix.newName === undefined || taken) { return []; }
    return [{ offset: key.offset, length: key.length, content: JSON.stringify(fix.newName) }];
  }
  const value = fix.remove ? undefined : fix.value;
  return modify(text, fix.path, value, formatting ? { formattingOptions: formatting } : {});
}

/** Convenience for tests: the text after applying `fix`. */
export function applyFix(
  text: string,
  fix: ValidationFix,
  formatting: FormattingOptions = DEFAULT_FORMATTING,
  languageId = 'json',
): string {
  return applyEdits(text, computeFixEdits(text, fix, formatting, languageId));
}

// ── Fix all (F21-FR-13) ──────────────────────────────────────────────────────

/** Kinds with exactly one right answer, safe to apply without being chosen. */
const UNAMBIGUOUS: ReadonlySet<FixKind> = new Set(['add-required', 'set-const', 'coerce-type']);

/**
 * The fixes "fix all" applies (F21-FR-13): those with a single possible outcome,
 * plus an enum change or a rename only when it is the preferred near-miss.
 * Removing an unexpected property is never among them — it deletes data, which
 * has to be an individual decision — and neither is any second fix for a node
 * an earlier one already handles.
 */
export function selectAutoFixes(fixes: ValidationFix[]): ValidationFix[] {
  const handled = new Set<string>();
  return fixes.filter(fix => {
    const auto = UNAMBIGUOUS.has(fix.kind)
      || ((fix.kind === 'set-enum' || fix.kind === 'rename-property') && fix.preferred === true);
    const node = JSON.stringify([fix.record ?? null, fix.path]);
    if (!auto || handled.has(node)) { return false; }
    handled.add(node);
    return true;
  });
}

/**
 * One edit applying every auto-fix to `text`, and how many took effect. Fixes
 * are applied in turn, each computed against the text the previous ones left,
 * so they cannot invalidate one another's positions; a fix that no longer
 * applies is skipped rather than failing the rest.
 */
export function computeFixAllEdits(
  text: string,
  fixes: ValidationFix[],
  formatting: FormattingOptions = DEFAULT_FORMATTING,
  languageId = 'json',
): { edits: Edit[]; applied: number } {
  let current = text;
  let applied = 0;
  for (const fix of selectAutoFixes(fixes)) {
    const edits = computeFixEdits(current, fix, formatting, languageId);
    if (!edits.length) { continue; }
    current = applyEdits(current, edits);
    applied++;
  }
  return { edits: minimalEdit(text, current), applied };
}

/** The single edit turning `before` into `after`, or none when they are equal. */
function minimalEdit(before: string, after: string): Edit[] {
  if (before === after) { return []; }
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) { start++; }
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return [{ offset: start, length: endBefore - start, content: after.slice(start, endAfter) }];
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
 * belongs to. `add-required`/`remove-additional`/`rename-property` edit a child
 * keyed by the last path segment, so their error sits on the *parent* object; the value edits
 * (`set-enum`/`set-const`/`coerce-type`) sit on the node itself. Used to match a
 * fix to the validation diagnostics present at the cursor (F21-FR-08), which is
 * robust to the diagnostic range sitting on a key while the edit rewrites the
 * value.
 */
export function fixTargetPointer(fix: ValidationFix): string {
  const segments = fix.kind === 'add-required' || fix.kind === 'remove-additional' || fix.kind === 'rename-property'
    ? fix.path.slice(0, -1)
    : fix.path;
  return pointerOf(segments);
}

/**
 * The `code` a validation diagnostic carries so a fix can be matched to it
 * (F21-FR-08): the error's instance path, prefixed for JSONL with the 1-based
 * number of the record it is in — the same path recurs in every record, so the
 * path alone would attach one record's fix to another's diagnostic.
 */
export function diagnosticCode(instancePath: string, record?: number): string {
  return (record === undefined ? '' : `#${record + 1}`) + (instancePath || '/');
}

/** The {@link diagnosticCode} of the diagnostic `fix` belongs to. */
export function fixDiagnosticCode(fix: ValidationFix): string {
  return diagnosticCode(fixTargetPointer(fix), fix.record);
}

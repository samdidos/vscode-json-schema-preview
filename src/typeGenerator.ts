// F18 — TypeScript type generation from a bundled (self-contained) JSON
// Schema. Pure and VS Code-free: constraint annotation, declaration naming,
// and the quicktype-core invocation live here. All external $ref resolution
// and fetching happen *before* this module via F14's bundleSchema
// (F18-FR-06); the JSONSchemaInput below is constructed without a schema
// store, so the engine cannot fetch anything itself (F18-NFR-01).

import type { LanguageName } from 'quicktype-core';
import { isObject } from './schemaPointer';

/** Validation keywords with no TypeScript type-level counterpart. Their
 *  presence is surfaced as a TSDoc note instead of being silently dropped
 *  (F18-FR-08). `format` is also stripped so quicktype emits the widest
 *  correct type (`string`) rather than e.g. `Date` for `date-time`. */
const UNREPRESENTED_KEYWORDS = [
  'pattern', 'minLength', 'maxLength', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minItems', 'maxItems', 'uniqueItems', 'contains',
  'minProperties', 'maxProperties', 'propertyNames', 'patternProperties',
  'if', 'then', 'else', 'not',
  'dependentRequired', 'dependentSchemas',
  'unevaluatedProperties', 'unevaluatedItems',
] as const;

/** Keys whose values are plain data, not subschemas — never walked. */
const SCHEMA_MAP_KEYWORDS = ['properties', '$defs', 'definitions'] as const;
const SCHEMA_VALUE_KEYWORDS = [
  'additionalProperties', 'additionalItems', 'items', 'contains',
  'propertyNames', 'not', 'if', 'then', 'else',
  'unevaluatedProperties', 'unevaluatedItems',
] as const;
const SCHEMA_LIST_KEYWORDS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;

/** Sanitise an arbitrary name into a valid PascalCase identifier (F18-FR-07). */
export function sanitizeIdentifier(name: string): string {
  const words = name.replace(/[^A-Za-z0-9_$]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const joined = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const identifier = joined.replace(/^[0-9]+/, '');
  return identifier ? identifier.charAt(0).toUpperCase() + identifier.slice(1) : 'Schema';
}

/** Render a constraint value compactly for a TSDoc note. */
function fmtValue(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 60 ? `${s.slice(0, 57)}…` : s;
  } catch {
    return String(v);
  }
}

/**
 * Prepare a bundled schema for quicktype (mutates a deep clone, returns it):
 *
 * - `$defs`/`definitions` entries without a `title` get one from their key,
 *   so the emitted declaration is named after the key (F18-FR-07).
 * - Keywords with no type-level counterpart are recorded as a note appended
 *   to the node's `description`, which quicktype emits as TSDoc — the
 *   "comment naming the unrepresented constraint" of F18-FR-08. `format` is
 *   removed afterwards so the widest correct type (`string`) is emitted.
 * - Non-string `const`/`enum` members widen in the output, so they are noted
 *   too (F18-FR-04).
 * - 2020-12 `prefixItems` tuples are rewritten to the draft-07 array form
 *   (`items: [...]`, rest schema moved to `additionalItems`) that quicktype
 *   understands, and the tuple shape is noted (F18-FR-04).
 *
 * Only recognised schema positions are walked — data-carrying keywords
 * (`enum`, `const`, `examples`, `default`) are never treated as schemas.
 */
export function annotateSchemaForCodegen(input: unknown): unknown {
  const root = structuredClone(input);
  walkSchema(root);
  return root;
}

function walkSchema(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) { walkSchema(item); }
    return;
  }
  if (!isObject(node)) { return; }
  annotateNode(node);
  for (const key of SCHEMA_MAP_KEYWORDS) {
    const map = node[key];
    if (!isObject(map)) { continue; }
    for (const [entryKey, sub] of Object.entries(map)) {
      if ((key === '$defs' || key === 'definitions') && isObject(sub) && typeof sub.title !== 'string') {
        sub.title = entryKey; // F18-FR-07: name the declaration after the $defs key
      }
      walkSchema(sub);
    }
  }
  const depSchemas = node.dependentSchemas;
  if (isObject(depSchemas)) {
    for (const sub of Object.values(depSchemas)) { walkSchema(sub); }
  }
  for (const key of SCHEMA_VALUE_KEYWORDS) {
    if (key in node) { walkSchema(node[key]); }
  }
  for (const key of SCHEMA_LIST_KEYWORDS) {
    const list = node[key];
    if (Array.isArray(list)) { for (const sub of list) { walkSchema(sub); } }
  }
}

function annotateNode(node: Record<string, unknown>): void {
  const notes: string[] = [];

  // 2020-12 tuple form → draft-07 tuple form quicktype understands; the
  // element types then flow into the output as Array<union> (F18-FR-04).
  if (Array.isArray(node.prefixItems)) {
    notes.push(`tuple of ${node.prefixItems.length} element(s) (prefixItems)`);
    if (node.items !== undefined && !Array.isArray(node.items)) {
      node.additionalItems = node.items;
    }
    node.items = node.prefixItems;
    delete node.prefixItems;
  } else if (Array.isArray(node.items)) {
    notes.push(`tuple of ${node.items.length} element(s) (items)`);
  }

  if ('const' in node && typeof node.const !== 'string') {
    notes.push(`const: ${fmtValue(node.const)}`);
  }
  if (Array.isArray(node.enum) && node.enum.some(v => typeof v !== 'string')) {
    notes.push(`enum: ${fmtValue(node.enum)}`);
  }

  for (const keyword of UNREPRESENTED_KEYWORDS) {
    if (!(keyword in node)) { continue; }
    const value = node[keyword];
    notes.push(
      value === undefined || isObject(value) || Array.isArray(value)
        ? keyword
        : `${keyword}: ${fmtValue(value)}`,
    );
  }
  // `format` would otherwise make quicktype emit `Date` for `date-time`,
  // which parsed JSON never contains — strip it after noting it.
  delete node.format;

  if (!notes.length) { return; }
  const note = `Unrepresented in the generated type: ${notes.join(', ')}.`;
  node.description = typeof node.description === 'string' && node.description
    ? `${node.description}\n\n${note}`
    : note;
}

/** A code-generation target offered by the language picker (F18-FR-02/10). */
export interface TargetLanguage {
  /** Stable identifier used by the picker and tests. */
  id: string;
  /** Human-readable label shown in the picker. */
  label: string;
  /** quicktype-core's name for the language backend. */
  quicktypeLang: LanguageName;
  /** VS Code language id for the untitled editor (best-effort — F18-FR-02). */
  editorLanguageId: string;
  /** File extension (no dot) used by the save-to-file default (F18-FR-11). */
  extension: string;
  /** Line-comment prefix, for the multi-file banner separators (F18-FR-11). */
  lineComment: string;
  /** Per-language renderer options, verified against quicktype-core 26.0.0. */
  rendererOptions: Readonly<Record<string, string>>;
}

/**
 * The supported targets (F18-FR-10), TypeScript first as the default.
 * `just-types`-style options are passed wherever the backend supports them
 * so output is declarations rather than serializer scaffolding; Rust and C#
 * have no such option in this quicktype version and use backend defaults.
 */
export const TARGET_LANGUAGES: readonly TargetLanguage[] = [
  {
    id: 'typescript', label: 'TypeScript', quicktypeLang: 'typescript',
    editorLanguageId: 'typescript', extension: 'ts', lineComment: '//',
    rendererOptions: {
      'just-types': 'true',        // declarations only, no runtime converters
      'prefer-unions': 'true',     // enum → union of literal types (F18-FR-04)
      'nice-property-names': 'false', // keep property names exactly as in the schema
    },
  },
  { id: 'python', label: 'Python', quicktypeLang: 'python', editorLanguageId: 'python',
    extension: 'py', lineComment: '#', rendererOptions: { 'just-types': 'true' } },
  { id: 'go', label: 'Go', quicktypeLang: 'go', editorLanguageId: 'go',
    extension: 'go', lineComment: '//', rendererOptions: { 'just-types': 'true' } },
  { id: 'rust', label: 'Rust', quicktypeLang: 'rust', editorLanguageId: 'rust',
    extension: 'rs', lineComment: '//', rendererOptions: {} },
  { id: 'java', label: 'Java', quicktypeLang: 'java', editorLanguageId: 'java',
    extension: 'java', lineComment: '//', rendererOptions: { 'just-types': 'true' } },
  { id: 'csharp', label: 'C#', quicktypeLang: 'cs', editorLanguageId: 'csharp',
    extension: 'cs', lineComment: '//', rendererOptions: {} },
  { id: 'kotlin', label: 'Kotlin', quicktypeLang: 'kotlin', editorLanguageId: 'kotlin',
    extension: 'kt', lineComment: '//', rendererOptions: { 'just-types': 'true' } },
  { id: 'swift', label: 'Swift', quicktypeLang: 'swift', editorLanguageId: 'swift',
    extension: 'swift', lineComment: '//', rendererOptions: { 'just-types': 'true' } },
  { id: 'dart', label: 'Dart', quicktypeLang: 'dart', editorLanguageId: 'dart',
    extension: 'dart', lineComment: '//', rendererOptions: { 'just-types': 'true' } },
  { id: 'cpp', label: 'C++', quicktypeLang: 'c++', editorLanguageId: 'cpp',
    extension: 'hpp', lineComment: '//', rendererOptions: { 'just-types': 'true' } },
];

/**
 * Generate typed declarations in `target`'s language from a bundled,
 * self-contained schema (F18-FR-02..10), as the engine's per-file map:
 * single-entry for most targets, one entry per class for Java (F18-FR-10),
 * keyed by the engine-given filename (the top-level file first). Pure with
 * respect to I/O (F18-NFR-02): schema in, text out — async only because
 * quicktype's API is. The top-level declaration is named after the schema's
 * `title`, else `fallbackName` (the file stem). Output is deterministic per
 * target for identical input (F18-FR-09) — quicktype-core is pinned to an
 * exact version to keep it that way (F18-NFR-03).
 */
export async function generateCodeFiles(
  bundledSchema: unknown,
  fallbackName: string,
  target: TargetLanguage,
): Promise<Map<string, string>> {
  // quicktype-core dominates the extension bundle, so it is loaded on first
  // use — as its own webpack chunk — instead of at activation (S03-SR-16:
  // dist/extension.js stays within the activation-bundle budget).
  const { quicktypeMultiFile, InputData, JSONSchemaInput } =
    await import(/* webpackChunkName: "quicktype" */ 'quicktype-core');

  const schema = annotateSchemaForCodegen(bundledSchema);
  const title = isObject(bundledSchema) && typeof bundledSchema.title === 'string'
    ? bundledSchema.title
    : undefined;
  const topLevelName = sanitizeIdentifier(title ?? fallbackName);

  // No schema store → quicktype cannot resolve anything outside the document
  // it is given; an external address in a $ref is a hard error (F18-NFR-01).
  const schemaInput = new JSONSchemaInput(undefined);
  await schemaInput.addSource({ name: topLevelName, schema: JSON.stringify(schema) });
  const inputData = new InputData();
  inputData.addInput(schemaInput);

  const result = await quicktypeMultiFile({
    inputData,
    lang: target.quicktypeLang,
    rendererOptions: { ...target.rendererOptions },
    indentation: '  ',
  });
  return new Map([...result].map(([name, rendered]) => [name, `${rendered.lines.join('\n')}\n`]));
}

/**
 * Join a `generateCodeFiles` result into one string: a single file is
 * returned as-is; a multi-file result gets a per-file banner comment
 * (`// <name>`) between the files — the untitled-editor *preview* form of
 * F18-FR-11 (multiple public Java classes cannot compile from one file;
 * the folder destination writes them separately).
 */
export function concatenateGeneratedFiles(files: Map<string, string>, target: TargetLanguage): string {
  if (files.size === 1) { return files.values().next().value ?? ''; }
  return [...files]
    .map(([name, content]) => `${target.lineComment} ${name}\n\n${content}`)
    .join('\n');
}

/** Single-string form of `generateCodeFiles` (banner-joined when multi-file). */
export async function generateCode(
  bundledSchema: unknown,
  fallbackName: string,
  target: TargetLanguage,
): Promise<string> {
  return concatenateGeneratedFiles(await generateCodeFiles(bundledSchema, fallbackName, target), target);
}

/** The TypeScript target (F18-FR-03..05/08 bind to this one). */
export function generateTypeScript(bundledSchema: unknown, fallbackName: string): Promise<string> {
  return generateCode(bundledSchema, fallbackName, TARGET_LANGUAGES[0]);
}

// F17 — schema quality linting. Pure, VS Code-free: builds a lightweight,
// offset-carrying tree from JSON/JSONC (jsonc-parser) or YAML (yaml AST) and
// runs a set of rule functions over it, returning findings with precise source
// ranges. The manager layer maps findings to diagnostics/code actions.

import { parseTree, type Node } from 'jsonc-parser';
import { parseDocument, isMap, isSeq, isScalar, isPair } from 'yaml';
import { isYaml } from './languages';

// ── Normalised schema tree ───────────────────────────────────────────────────

export type Sev = 'hint' | 'info' | 'warning';

interface PropEntry { key: string; keyOffset: number; keyLength: number; value: TreeNode; }

export type TreeNode =
  | { kind: 'object'; offset: number; length: number; props: PropEntry[] }
  | { kind: 'array'; offset: number; length: number; items: TreeNode[] }
  | { kind: 'scalar'; offset: number; length: number; value: string | number | boolean | null };

interface LintFix {
  /** 'insertText' inserts at `atOffset`; 'replaceRange' rewrites [offset,offset+length). */
  kind: 'insertText' | 'replaceRange' | 'command';
  title: string;
  atOffset?: number;
  offset?: number;
  length?: number;
  text?: string;
  command?: string;
}

export interface LintFinding {
  ruleId: string;
  message: string;
  offset: number;
  length: number;
  defaultSeverity: Sev;
  fix?: LintFix;
}

/** Build a normalised tree from schema text, or undefined if it does not parse. */
export function buildSchemaTree(text: string, languageId: string): TreeNode | undefined {
  return isYaml(languageId) ? buildYaml(text) : buildJson(text);
}

function buildJson(text: string): TreeNode | undefined {
  const root = parseTree(text);
  return root ? fromJsonNode(root) : undefined;
}

function fromJsonNode(node: Node): TreeNode {
  if (node.type === 'object') {
    const props: PropEntry[] = [];
    for (const child of node.children ?? []) {
      if (child.type !== 'property') { continue; }
      const keyNode = child.children?.[0];
      const valNode = child.children?.[1];
      if (!keyNode || !valNode) { continue; }
      props.push({
        key: String(keyNode.value),
        keyOffset: keyNode.offset,
        keyLength: keyNode.length,
        value: fromJsonNode(valNode),
      });
    }
    return { kind: 'object', offset: node.offset, length: node.length, props };
  }
  if (node.type === 'array') {
    return { kind: 'array', offset: node.offset, length: node.length, items: (node.children ?? []).map(fromJsonNode) };
  }
  return { kind: 'scalar', offset: node.offset, length: node.length, value: node.value ?? null };
}

function buildYaml(text: string): TreeNode | undefined {
  let doc;
  try { doc = parseDocument(text); } catch { return undefined; }
  if (!doc.contents) { return undefined; }
  return fromYamlNode(doc.contents);
}

function fromYamlNode(node: unknown): TreeNode {
  const range = (node as { range?: [number, number, number] }).range ?? [0, 0, 0];
  if (isMap(node)) {
    const props: PropEntry[] = [];
    for (const item of node.items) {
      if (!isPair(item) || !isScalar(item.key)) { continue; }
      const kr = (item.key as { range?: [number, number, number] }).range ?? range;
      props.push({
        key: String(item.key.value),
        keyOffset: kr[0],
        keyLength: kr[1] - kr[0],
        value: fromYamlNode(item.value),
      });
    }
    return { kind: 'object', offset: range[0], length: range[1] - range[0], props };
  }
  if (isSeq(node)) {
    return { kind: 'array', offset: range[0], length: range[1] - range[0], items: node.items.map(fromYamlNode) };
  }
  const value = isScalar(node) ? (node.value as string | number | boolean | null) : null;
  return { kind: 'scalar', offset: range[0], length: range[1] - range[0], value };
}

// ── Keyword vocabulary (union across drafts) ─────────────────────────────────

const KNOWN_KEYWORDS = new Set([
  '$schema', '$id', 'id', '$ref', '$defs', 'definitions', '$anchor', '$comment',
  '$dynamicRef', '$dynamicAnchor', '$vocabulary', '$recursiveRef', '$recursiveAnchor',
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'properties',
  'patternProperties', 'additionalProperties', 'dependentSchemas', 'propertyNames',
  'items', 'prefixItems', 'additionalItems', 'contains', 'unevaluatedProperties',
  'unevaluatedItems', 'dependencies', 'type', 'enum', 'const', 'multipleOf',
  'maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum', 'maxLength',
  'minLength', 'pattern', 'maxItems', 'minItems', 'uniqueItems', 'maxContains',
  'minContains', 'maxProperties', 'minProperties', 'required', 'dependentRequired',
  'title', 'description', 'default', 'deprecated', 'readOnly', 'writeOnly',
  'examples', 'format', 'contentMediaType', 'contentEncoding', 'contentSchema',
]);

const SCHEMA_VALUED = new Set([
  'additionalProperties', 'additionalItems', 'contains', 'not', 'if', 'then',
  'else', 'propertyNames', 'unevaluatedProperties', 'unevaluatedItems', 'contentSchema',
]);
const MAP_OF_SCHEMAS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
const ARRAY_OF_SCHEMAS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const DATA_KEYWORDS = new Set(['const', 'default', 'examples', 'enum']);

const KNOWN_LIST = [...KNOWN_KEYWORDS];

// ── Rule engine ──────────────────────────────────────────────────────────────

function prop(node: Extract<TreeNode, { kind: 'object' }>, key: string): PropEntry | undefined {
  return node.props.find(p => p.key === key);
}

/** Levenshtein distance, used to suggest the nearest keyword for a likely typo. */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) { dp[0][j] = j; }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function nearestKeyword(key: string): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  for (const kw of KNOWN_LIST) {
    const d = editDistance(key, kw);
    if (d < bestD) { bestD = d; best = kw; }
  }
  return best;
}

/**
 * Lint a schema document. Returns findings carrying their default severity;
 * the caller applies per-rule severity overrides and skips `off` rules.
 */
export function lintSchema(text: string, languageId: string): LintFinding[] {
  const root = buildSchemaTree(text, languageId);
  if (!root || root.kind !== 'object') { return []; }
  const findings: LintFinding[] = [];
  const isJson = !isYaml(languageId);

  // Root-only rules.
  if (!prop(root, '$schema')) {
    findings.push({
      ruleId: 'require-schema-declaration',
      message: 'Root schema should declare "$schema" so its draft is unambiguous.',
      offset: root.offset, length: 1, defaultSeverity: 'info',
      fix: { kind: 'command', title: 'Insert $schema declaration…', command: 'jsonschema.lint.insertSchemaDeclaration' },
    });
  }
  if (!prop(root, '$id') && !prop(root, 'id')) {
    findings.push({
      ruleId: 'require-root-id',
      message: 'Root schema should declare "$id" when referenced by other files.',
      offset: root.offset, length: 1, defaultSeverity: 'hint',
    });
  }
  if (!prop(root, 'description') && !prop(root, 'title')) {
    findings.push({
      ruleId: 'require-descriptions',
      message: 'Root schema should have a "description" (or "title").',
      offset: root.offset, length: 1, defaultSeverity: 'hint',
    });
  }

  walkSchema(root, findings, isJson);
  return findings;
}

/** Recursively lint one schema-position object node. */
function walkSchema(node: TreeNode, findings: LintFinding[], isJson: boolean): void {
  if (node.kind !== 'object') { return; }

  for (const entry of node.props) {
    const { key, value } = entry;

    if (SCHEMA_VALUED.has(key)) {
      walkSchema(value, findings, isJson);
    } else if (MAP_OF_SCHEMAS.has(key) && value.kind === 'object') {
      for (const sub of value.props) {
        if (key === 'properties') { checkPropertyDescription(sub, findings); }
        walkSchema(sub.value, findings, isJson);
      }
    } else if (ARRAY_OF_SCHEMAS.has(key) && value.kind === 'array') {
      value.items.forEach(it => walkSchema(it, findings, isJson));
    } else if (key === 'items') {
      if (value.kind === 'array') { value.items.forEach(it => walkSchema(it, findings, isJson)); }
      else { walkSchema(value, findings, isJson); }
    } else if (key === 'dependencies' && value.kind === 'object') {
      value.props.forEach(sub => { if (sub.value.kind === 'object') { walkSchema(sub.value, findings, isJson); } });
    } else if (key === 'enum') {
      checkDuplicateEnum(value, findings, isJson);
    } else if (!DATA_KEYWORDS.has(key) && !isKnownOrExtension(key)) {
      findings.push(unknownKeywordFinding(entry));
    }
  }

  checkExplicitAdditionalProperties(node, findings, isJson);
  checkEmptyRequired(node, findings);
}

function isKnownOrExtension(key: string): boolean {
  // Vendor extensions (`x-`/`x_`) are conventionally allowed and not flagged.
  return KNOWN_KEYWORDS.has(key) || /^x[-_]/i.test(key);
}

function unknownKeywordFinding(entry: PropEntry): LintFinding {
  const near = nearestKeyword(entry.key);
  const suffix = near ? ` Did you mean "${near}"?` : '';
  return {
    ruleId: 'no-unknown-keywords',
    message: `Unknown schema keyword "${entry.key}".${suffix}`,
    offset: entry.keyOffset, length: entry.keyLength, defaultSeverity: 'warning',
  };
}

function checkPropertyDescription(sub: PropEntry, findings: LintFinding[]): void {
  const v = sub.value;
  if (v.kind !== 'object') { return; }
  const desc = prop(v, 'description');
  const hasDesc = desc && desc.value.kind === 'scalar' && String(desc.value.value).trim() !== '';
  if (!hasDesc) {
    findings.push({
      ruleId: 'require-descriptions',
      message: `Property "${sub.key}" should have a "description".`,
      offset: sub.keyOffset, length: sub.keyLength, defaultSeverity: 'hint',
    });
  }
}

function checkExplicitAdditionalProperties(
  node: Extract<TreeNode, { kind: 'object' }>,
  findings: LintFinding[],
  isJson: boolean,
): void {
  if (!prop(node, 'properties')) { return; }
  if (prop(node, 'additionalProperties')) { return; }
  findings.push({
    ruleId: 'explicit-additional-properties',
    message: 'Object schema with "properties" should set "additionalProperties" explicitly.',
    offset: node.offset, length: 1, defaultSeverity: 'hint',
    fix: isJson
      ? { kind: 'insertText', title: 'Add "additionalProperties": false', atOffset: node.offset + 1, text: '\n"additionalProperties": false,' }
      : undefined,
  });
}

function checkEmptyRequired(node: Extract<TreeNode, { kind: 'object' }>, findings: LintFinding[]): void {
  const required = prop(node, 'required');
  const addl = prop(node, 'additionalProperties');
  const closed = addl?.value.kind === 'scalar' && addl.value.value === false;
  if (!required || required.value.kind !== 'array' || !closed) { return; }
  const propsNode = prop(node, 'properties');
  const declared = new Set(
    propsNode?.value.kind === 'object' ? propsNode.value.props.map(p => p.key) : [],
  );
  for (const item of required.value.items) {
    if (item.kind === 'scalar' && typeof item.value === 'string' && !declared.has(item.value)) {
      findings.push({
        ruleId: 'no-empty-required',
        message: `Required property "${item.value}" is not declared in "properties" (and additionalProperties is false).`,
        offset: item.offset, length: item.length, defaultSeverity: 'warning',
      });
    }
  }
}

function checkDuplicateEnum(value: TreeNode, findings: LintFinding[], isJson: boolean): void {
  if (value.kind !== 'array') { return; }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of value.items) {
    const norm = normaliseScalar(item);
    if (!seen.has(norm)) { seen.add(norm); unique.push(norm); }
  }
  if (unique.length === value.items.length) { return; }
  findings.push({
    ruleId: 'no-duplicate-enum',
    message: 'Enum contains duplicate values.',
    offset: value.offset, length: value.length, defaultSeverity: 'warning',
    fix: isJson
      ? { kind: 'replaceRange', title: 'Remove duplicate enum values', offset: value.offset, length: value.length, text: `[${unique.join(', ')}]` }
      : undefined,
  });
}

/** Deep, order-sensitive JSON key of a scalar/array/object subtree for equality. */
function normaliseScalar(node: TreeNode): string {
  if (node.kind === 'scalar') { return JSON.stringify(node.value); }
  if (node.kind === 'array') { return `[${node.items.map(normaliseScalar).join(',')}]`; }
  return `{${node.props.map(p => `${JSON.stringify(p.key)}:${normaliseScalar(p.value)}`).join(',')}}`;
}

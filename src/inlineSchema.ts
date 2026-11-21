// F13-FR-11: locate an actual document-level binding, including its source
// range. Parsing keeps comments and strings containing lookalike keys inert.
import { parseTree, type ParseError } from 'jsonc-parser';
import { parseDocument, isMap, isNode, isScalar, visit } from 'yaml';
import { parse as parseToml } from 'smol-toml';
import { scanToml, findTomlNode, type TomlNode, type TomlSpan } from './tomlLocator';

export interface InlineSchemaReference {
  url: string;
  start: number;
  end: number;
  directive?: boolean;
  keyStart?: number;
  flow?: boolean;
  /** TOML only: the whole `key = value` statement, line break included. */
  statement?: TomlSpan;
}

/** `# yaml-language-server: $schema=<url>` modeline, anywhere a line starts. */
const YAML_DIRECTIVE = /^#[ \t]*yaml-language-server[ \t]*:[^\r\n]*?\$schema=(\S+)/gim;
/** The same pattern without the global flag, for the first match only. */
const YAML_DIRECTIVE_FIRST = new RegExp(YAML_DIRECTIVE.source, 'im');

function yamlDirective(match: RegExpMatchArray): InlineSchemaReference {
  const url = match[1];
  const start = match.index! + match[0].length - url.length;
  return { url, start, end: start + url.length, directive: true, keyStart: match.index };
}

/** True when `prefix` holds only lines before which no YAML scalar can begin:
 * blank lines, comments, `%` directives and bare `---` markers (F13-NFR-03).
 * Anything unusual (BOM, lone `\r`, `--- |`, `...`) answers false so the
 * caller parses the document instead. So do U+2028/U+2029: a regex `^` after
 * them sees a new line, but the YAML lexer does not, and `String#trim` would
 * call such a line blank. Blank and comment lines are tested ASCII-only. */
function isYamlPrelude(prefix: string): boolean {
  let started = false;
  for (const raw of prefix.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.includes('\r') || line.includes('\u2028') || line.includes('\u2029')
      || line.startsWith('\uFEFF')) { return false; }
    if (/^[ \t]*(?:#.*)?$/.test(line)) { continue; }
    if (line.startsWith('%') && !started) { continue; }
    if (line.startsWith('---') && /^---(?:[ \t]+(?:#.*)?)?$/.test(line)) { started = true; continue; }
    return false;
  }
  return true;
}

export function inlineSchemaReference(
  text: string, language: string, includeNonStringValue = false,
): InlineSchemaReference | undefined {
  // F13-NFR-03: every binding form spells `$schema` literally; most files
  // don't, so skip the parse that dominates the cost on large documents.
  if (!text.includes('$schema')) { return undefined; }
  try {
    if (language === 'yaml' || language === 'yml') {
      // F13-NFR-03: no scalar can begin before the first content line, so a
      // first directive in the leading prelude needs no parse.
      const first = text.match(YAML_DIRECTIVE_FIRST);
      if (first && isYamlPrelude(text.slice(0, first.index))) { return yamlDirective(first); }
      const doc = parseDocument(text);
      // A directive-looking line inside a quoted/block scalar is just data.
      const scalars: Array<readonly number[]> = [];
      visit(doc, (_key, node) => {
        if (isScalar(node) && node.range) { scalars.push(node.range); }
      });
      // The value ends at the first whitespace, as in yaml-language-server's
      // modeline parser, so a trailing `# note` is not part of the path.
      for (const directive of text.matchAll(YAML_DIRECTIVE)) {
        if (scalars.some(range => directive.index >= range[0] && directive.index < range[1])) { continue; }
        return yamlDirective(directive);
      }
      if (!isMap(doc.contents)) { return undefined; }
      const pair = doc.contents.items.find(item => isScalar(item.key) && item.key.value === '$schema');
      const value = pair?.value;
      if (!isNode(value) || !value.range) { return undefined; }
      const url = isScalar(value) && typeof value.value === 'string' ? value.value : undefined;
      if (url === undefined && !includeNonStringValue) { return undefined; }
      return { url: url ?? '', start: value.range[0], end: value.range[1],
        keyStart: isScalar(pair?.key) ? pair.key.range?.[0] : undefined, flow: doc.contents.flow };
    }
    if (language === 'toml') { return tomlReference(text); }
    if (language !== 'json' && language !== 'jsonc') { return undefined; }
    const errors: ParseError[] = [];
    const root = parseTree(text, errors, {
      allowTrailingComma: language === 'jsonc', disallowComments: language === 'json',
    });
    if (errors.length || root?.type !== 'object') { return undefined; }
    const properties = root.children?.filter(p => p.children?.[0]?.value === '$schema');
    const value = properties?.[properties.length - 1]?.children?.[1];
    return value?.type === 'string'
      ? { url: value.value, start: value.offset, end: value.offset + value.length }
      : undefined;
  } catch {
    return undefined;
  }
}

/** True when `text` has YAML syntax errors. The parser recovers from them,
 * so offsets in such a document cannot be trusted for edits (F10-FR-17). */
export function yamlHasSyntaxErrors(text: string): boolean {
  // A multi-document stream is valid YAML; the binding lives in the first one.
  return parseDocument(text).errors.some(error => error.code !== 'MULTIPLE_DOCS');
}

/** `text` parsed by `smol-toml`, or undefined when it is not valid TOML (F10-FR-17). */
export function tryParseToml(text: string): Record<string, unknown> | undefined {
  try { return parseToml(text); } catch { return undefined; }
}

/** A `"$schema"` key at the start of a line: where a root binding could begin. */
const TOML_SCHEMA_KEY_LINE = /^[ \t]*(?:"\$schema"|'\$schema')[ \t]*=/gm;
/** How many lines past its key a binding's value may span in the prefix retry. */
const TOML_PREFIX_LINES = 10;

function tomlReference(text: string): InlineSchemaReference | undefined {
  const full = scanToml(text);
  if (full) { return tomlBinding(text, full); }
  // A file being edited does not scan, yet completions need its binding while
  // the user types (F19-FR-04). A line-aligned prefix that scans and ends after
  // the binding has the same root table up to that point, so its `"$schema"`
  // is the document's own (F11-FR-15).
  for (const key of text.matchAll(TOML_SCHEMA_KEY_LINE)) {
    let end = key.index;
    for (let line = 0; line < TOML_PREFIX_LINES; line++) {
      const newline = text.indexOf('\n', end);
      end = newline < 0 ? text.length : newline + 1;
      const prefix = scanToml(text.slice(0, end));
      if (prefix) {
        const found = tomlBinding(text, prefix);
        if (found) { return found; }
        break;
      }
      if (newline < 0) { break; }
    }
  }
  return undefined;
}

function tomlBinding(text: string, root: TomlNode): InlineSchemaReference | undefined {
  // Root-scoped by construction: a `"$schema"` under a [table] header or a
  // dotted key is a child of that table, not of the document root (F11-FR-15).
  const node = findTomlNode(root, ['$schema']);
  if (node?.kind !== 'value' || !node.value || !node.key || !node.statement) { return undefined; }
  const raw = text.slice(node.value.start, node.value.end);
  if (raw[0] !== '"' && raw[0] !== "'") { return undefined; }
  const url = (parseToml(`v = ${raw}`) as { v: unknown }).v;
  return typeof url === 'string'
    ? { url, start: node.value.start, end: node.value.end, keyStart: node.key.start, statement: node.statement }
    : undefined;
}

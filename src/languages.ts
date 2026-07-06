import { parse as parseTomlText } from 'smol-toml';

/** VS Code language IDs this extension handles. */
export const JSON_LANGS   = ['json', 'jsonc', 'jsonl'] as const;
export const YAML_LANGS   = ['yaml', 'yml']            as const;
export const TOML_LANGS   = ['toml']                   as const;
export const ALL_LANGS    = [...JSON_LANGS, ...YAML_LANGS, ...TOML_LANGS] as const;

export function isYaml(languageId: string): boolean {
  return (YAML_LANGS as readonly string[]).includes(languageId);
}

export function isToml(languageId: string): boolean {
  return (TOML_LANGS as readonly string[]).includes(languageId);
}

export function isSupported(languageId: string): boolean {
  return (ALL_LANGS as readonly string[]).includes(languageId);
}

/**
 * Parse TOML text into a JSON-compatible value tree (F11-FR-04). Throws on
 * invalid TOML (smol-toml raises `TomlError`). TOML native date/time values are
 * parsed by smol-toml as `Date` objects; they are normalised to ISO-8601
 * strings here so both validation (F11-AC-8) and inference (F11-FR-10) treat
 * them as strings rather than objects. Synchronous and subprocess-free
 * (F11-NFR-01).
 */
export function parseToml(text: string): unknown {
  return normalizeTomlDates(parseTomlText(text));
}

function normalizeTomlDates(value: unknown): unknown {
  if (value instanceof Date) {
    // Offset/local date-times convert cleanly; a bare time can be an invalid
    // Date for toISOString, so fall back to its string form.
    try { return value.toISOString(); } catch { return String(value); }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeTomlDates);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) { out[k] = normalizeTomlDates(v); }
    return out;
  }
  return value;
}

/**
 * Strips // line comments and /* block comments from JSONC text.
 * Quoted strings are preserved intact, so URLs and regexes inside
 * values are not accidentally stripped.
 */
export function stripJsoncComments(text: string): string {
  return text.replace(
    /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (_, quoted) => quoted ?? ''
  );
}

/**
 * Parses a JSONL (newline-delimited JSON) string into an array of values.
 * Blank lines and lines starting with // are skipped.
 */
export function parseJsonl(text: string): unknown[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('//'))
    .map(l => JSON.parse(l));
}

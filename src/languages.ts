/** VS Code language IDs this extension handles. */
export const JSON_LANGS   = ['json', 'jsonc', 'jsonl'] as const;
export const YAML_LANGS   = ['yaml', 'yml']            as const;
export const ALL_LANGS    = [...JSON_LANGS, ...YAML_LANGS] as const;

export type LangId = typeof ALL_LANGS[number];

export function isYaml(languageId: string): boolean {
  return (YAML_LANGS as readonly string[]).includes(languageId);
}

export function isJsonLike(languageId: string): boolean {
  return (JSON_LANGS as readonly string[]).includes(languageId);
}

export function isSupported(languageId: string): boolean {
  return (ALL_LANGS as readonly string[]).includes(languageId);
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

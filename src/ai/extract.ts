// F32-FR-06 — tolerant extraction of a JSON payload from a model response.
// Pure and VS Code-free. Models wrap output in fences, add prose before and
// after, and occasionally emit more than one value; none of that should be the
// difference between a usable draft and a failure, and none of it may throw.

export type ExtractResult =
  | { ok: true; value: unknown; text: string }
  | { ok: false; reason: string };

/**
 * Pull the first balanced JSON object or array out of `response`, unwrapping a
 * fenced code block when there is one. Never throws.
 */
export function extractJson(response: string): ExtractResult {
  const source = unwrapFence(response);
  const span = firstBalancedSpan(source);
  if (!span) {
    return { ok: false, reason: 'The response contained no JSON object or array.' };
  }
  const text = source.slice(span.start, span.end);
  try {
    return { ok: true, value: JSON.parse(text), text };
  } catch (e) {
    return { ok: false, reason: `The response is not valid JSON: ${(e as Error).message}` };
  }
}

/**
 * Content of the first fenced code block, or the input unchanged when there is
 * none. Handles ``` and ```json (and any other language tag).
 */
export function unwrapFence(response: string): string {
  // Scanned rather than matched: a lazy quantifier between a literal and an
  // end-anchored alternation backtracks over the whole response when the fence
  // is never closed, and a model response is exactly the kind of unbounded,
  // uncontrolled input where that matters.
  const open = response.indexOf('```');
  if (open === -1) { return response; }
  const bodyStart = response.indexOf('\n', open);
  if (bodyStart === -1) { return response; }
  const close = response.indexOf('```', bodyStart);
  return close === -1
    ? response.slice(bodyStart + 1)
    : response.slice(bodyStart + 1, close);
}

interface Span { start: number; end: number }

/**
 * Span of the first balanced `{…}` or `[…]` in `text`, ignoring braces inside
 * string literals (and their escapes) so a JSON value containing `}` in a
 * description is not truncated mid-way.
 */
function firstBalancedSpan(text: string): Span | undefined {
  const start = firstOpener(text);
  if (start === -1) { return undefined; }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); continue; }
    if (ch === '}' || ch === ']') {
      const opener = stack.pop();
      if (opener === undefined) { return undefined; }
      if ((ch === '}') !== (opener === '{')) { return undefined; }
      if (!stack.length) { return { start, end: i + 1 }; }
    }
  }
  return undefined;
}

function firstOpener(text: string): number {
  const brace = text.indexOf('{');
  const bracket = text.indexOf('[');
  if (brace === -1) { return bracket; }
  if (bracket === -1) { return brace; }
  return Math.min(brace, bracket);
}

/**
 * Prose from a model response with any fenced blocks removed — used where the
 * answer is an explanation rather than a document (F32-FR-08).
 */
export function extractProse(response: string): string {
  return response.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

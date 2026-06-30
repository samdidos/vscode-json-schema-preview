// Property-based tests (fast-check). Where the example-based suites pin down
// specific cases, these assert invariants that must hold for *all* inputs —
// fast-check generates hundreds of randomized cases and shrinks any failure to
// a minimal counter-example.
import * as assert from 'assert';
import fc from 'fast-check';

const { sanitizeHtml, embedJson, getNonce } = require('../../webviewUtils');
const { stripJsoncComments, parseJsonl, isYaml, isSupported } = require('../../languages');

suite('property: sanitizeHtml()', () => {
  test('output never contains a raw angle bracket', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = sanitizeHtml(s);
        return !out.includes('<') && !out.includes('>');
      })
    );
  });

  test('never shortens the input (escaping only grows or keeps length)', () => {
    fc.assert(fc.property(fc.string(), (s) => sanitizeHtml(s).length >= s.length));
  });
});

suite('property: embedJson()', () => {
  test('escapes every < so a closing tag cannot break out', () => {
    fc.assert(fc.property(fc.jsonValue(), (v) => !embedJson(v).includes('<')));
  });

  test('round-trips back to a structurally identical value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const restored = JSON.parse(embedJson(v));
        assert.strictEqual(JSON.stringify(restored), JSON.stringify(v));
      })
    );
  });
});

suite('property: getNonce()', () => {
  test('is always base64url decoding to exactly 16 bytes', () => {
    fc.assert(
      fc.property(fc.integer(), () => {
        const nonce = getNonce();
        return /^[A-Za-z0-9_-]+$/.test(nonce) && Buffer.from(nonce, 'base64url').length === 16;
      })
    );
  });
});

suite('property: stripJsoncComments()', () => {
  // Inputs with no comment markers and no quotes must pass through untouched.
  const plainText = fc.string().filter((s) => !s.includes('/') && !s.includes('"'));

  test('leaves comment-free, quote-free text unchanged', () => {
    fc.assert(fc.property(plainText, (s) => stripJsoncComments(s) === s));
  });

  test('never grows the input (it only removes comments)', () => {
    fc.assert(fc.property(fc.string(), (s) => stripJsoncComments(s).length <= s.length));
  });
});

suite('property: parseJsonl()', () => {
  test('round-trips an array of JSON values through newline-delimited encoding', () => {
    fc.assert(
      fc.property(fc.array(fc.jsonValue()), (values) => {
        const text = values.map((v) => JSON.stringify(v)).join('\n');
        const parsed = parseJsonl(text);
        assert.strictEqual(JSON.stringify(parsed), JSON.stringify(values));
      })
    );
  });
});

suite('property: language predicates', () => {
  test('every YAML language is also a supported language', () => {
    fc.assert(fc.property(fc.string(), (lang) => !isYaml(lang) || isSupported(lang)));
  });
});

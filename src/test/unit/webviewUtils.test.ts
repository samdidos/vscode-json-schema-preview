import * as assert from 'assert';

const { sanitizeHtml, loadingPage, errorPage, getNonce } = require('../../webviewUtils');

suite('sanitizeHtml()', () => {
  test('escapes ampersands', () => {
    assert.strictEqual(sanitizeHtml('a & b'), 'a &amp; b');
  });

  test('escapes less-than', () => {
    assert.strictEqual(sanitizeHtml('a < b'), 'a &lt; b');
  });

  test('escapes greater-than', () => {
    assert.strictEqual(sanitizeHtml('a > b'), 'a &gt; b');
  });

  test('escapes all three in combination', () => {
    const input    = String.fromCharCode(60) + 'b' + String.fromCharCode(62);   // <b>
    const expected = '&lt;b&gt;';
    assert.strictEqual(sanitizeHtml(input), expected);
  });

  test('escapes ampersand inside tag context', () => {
    assert.strictEqual(sanitizeHtml('x & y'), 'x &amp; y');
  });

  test('returns plain string unchanged', () => {
    assert.strictEqual(sanitizeHtml('hello world'), 'hello world');
  });

  test('handles empty string', () => {
    assert.strictEqual(sanitizeHtml(''), '');
  });
});

suite('getNonce()', () => {
  test('returns a 32-character alphanumeric string', () => {
    const nonce = getNonce();
    assert.strictEqual(nonce.length, 32);
    assert.ok(/^[A-Za-z0-9]+$/.test(nonce));
  });

  test('returns a different value on each call', () => {
    assert.notStrictEqual(getNonce(), getNonce());
  });
});

suite('loadingPage()', () => {
  test('returns a string containing the message', () => {
    const html = loadingPage('Loading...');
    assert.ok(html.includes('Loading...'));
  });

  test('includes a Content-Security-Policy that forbids scripts', () => {
    const html = loadingPage('test');
    assert.ok(html.includes('Content-Security-Policy'));
    assert.ok(html.includes("default-src 'none'"));
  });

  test('returns a valid DOCTYPE html page', () => {
    const html = loadingPage('test');
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<html>'));
    assert.ok(html.includes('</html>'));
  });

  test('includes dark background style', () => {
    const html = loadingPage('test');
    assert.ok(html.includes('#1e1e1e'));
  });

  test('message appears in body', () => {
    const msg = 'Rendering schema';
    const html = loadingPage(msg);
    assert.ok(html.includes('<body>' + msg + '</body>'));
  });
});

suite('errorPage()', () => {
  test('renders heading and escaped message', () => {
    const html = errorPage('Preview — Error', 'boom <x> & y');
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<h2>Preview — Error</h2>'));
    assert.ok(html.includes('boom &lt;x&gt; &amp; y'));
  });

  test('omits hint block by default', () => {
    const html = errorPage('Error', 'plain');
    assert.ok(!html.includes('class="hint"'));
  });

  test('appends provided hint html verbatim', () => {
    const hint = '<div class="hint">do this</div>';
    const html = errorPage('Error', 'msg', hint);
    assert.ok(html.includes(hint));
  });
});

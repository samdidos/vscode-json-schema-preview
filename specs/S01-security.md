# S01 — Webview Security

## Overview

All webview panels MUST enforce a Content-Security-Policy (CSP) that prevents
untrusted code execution and limits resource loading to necessary origins only.

## Requirements

### Nonce-Based CSP

- **S01-SR-01** Every webview HTML document MUST include a `Content-Security-Policy`
  meta tag as the first element inside `<head>`.
- **S01-SR-02** The CSP `script-src` directive MUST allow only scripts that carry
  the webview's nonce value: `script-src 'nonce-<nonce>'`.
- **S01-SR-03** A cryptographically-random nonce of at least 32 characters MUST
  be generated fresh for every HTML document that is written to a webview.
- **S01-SR-04** Every `<script>` element in generated HTML (including those
  produced by `json-schema-for-humans`) MUST be stamped with the `nonce`
  attribute before the document is sent to the webview.
- **S01-SR-05** The `default-src` directive MUST be `'none'` so all resource
  types are deny-by-default unless explicitly listed.
- **S01-SR-06** `style-src` MAY include `'unsafe-inline'` and `https:` because
  `json-schema-for-humans` templates rely on inline style attributes and CDN
  stylesheets; inline styles do not pose code-execution risk.
- **S01-SR-07** `img-src` and `font-src` MUST be limited to `https:` and `data:`.

### HTML Sanitisation

- **S01-SR-08** Any schema-derived value embedded into a webview HTML string
  (e.g. filenames, error messages) MUST be passed through `sanitizeHtml` which
  escapes `&`, `<`, and `>`.
- **S01-SR-09** Any schema-derived value embedded inside a `<script>` block MUST
  be serialised with `embedJson` which additionally escapes `<` as `<` to
  prevent `</script>` injection.

### Static Pages

- **S01-SR-10** Loading and error pages that contain no scripts MUST use a
  stricter static-page CSP: `script-src 'none'; style-src 'unsafe-inline';
  img-src data:`.

### Local Resource Roots

- **S01-SR-11** The `localResourceRoots` of each webview panel MUST be scoped
  to the minimum necessary directory (e.g. the schema file's parent directory
  for the preview panel).

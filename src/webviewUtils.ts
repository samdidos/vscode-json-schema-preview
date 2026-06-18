/** Shared HTML/CSS helpers used by extension webview panels. */

export function sanitizeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function loadingPage(message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#9d9d9d}</style>
</head><body>${message}</body></html>`;
}

/**
 * Renders a dark error page for a webview panel. `message` is escaped; the
 * optional `hintHtml` (already-trusted HTML) is appended after the message.
 */
export function errorPage(heading: string, message: string, hintHtml = ''): string {
  const safe = sanitizeHtml(message);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:sans-serif;padding:32px;background:#1e1e1e;color:#d4d4d4}
  h2{color:#f47067;margin-top:0}
  pre{background:#252526;border:1px solid #3c3c3c;border-radius:6px;padding:16px;white-space:pre-wrap;font-size:13px}
  .hint{margin-top:16px;padding:12px 16px;background:#252526;border-left:3px solid #f47067;border-radius:4px;font-size:13px;line-height:1.6}
  .hint code{background:#1e1e1e;padding:2px 6px;border-radius:3px;font-family:monospace}
</style></head>
<body>
  <h2>${heading}</h2>
  <pre>${safe}</pre>${hintHtml}
</body></html>`;
}

/**
 * CSS shared by the visual editor and configuration panels.
 * Both panels host a json-editor form inside a dark VS Code webview.
 */
export const JE_PANEL_CSS = `
  :root {
    --bg: #1e1e1e; --bg2: #252526; --bg3: #2d2d30;
    --border: #3c3c3c; --text: #cccccc; --text2: #9d9d9d;
    --accent: #0078d4; --accent-hover: #106ebe; --required: #f47067; --radius: 4px;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: var(--vscode-font-family, -apple-system, 'Segoe UI', sans-serif);
         font-size: 13px; line-height: 1.5; color: var(--text);
         background: var(--bg); margin: 0; padding: 24px 32px 48px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0; }
  .subtitle { color: var(--text2); margin: 0 0 24px; font-size: 12px; }
  .btn-file {
    background: none; color: var(--accent); border: 1px solid var(--accent);
    border-radius: var(--radius); padding: 3px 10px; font-size: 12px;
    cursor: pointer; transition: background .15s;
  }
  .btn-file:hover { background: rgba(0,120,212,.12); }
  /* json-editor overrides */
  .je-ready { color: var(--text); }
  .je-ready h3 { font-size: 13px; font-weight: 600; margin: 0 0 2px; color: var(--text); }
  .je-ready p.je-desc { color: var(--text2); font-size: 12px; margin: 0 0 6px; }
  .je-ready label { display: block; font-size: 12px; font-weight: 600;
                    color: var(--text2); margin-bottom: 4px; }
  .je-ready input[type=text], .je-ready input[type=number],
  .je-ready select, .je-ready textarea {
    width: 100%; background: var(--bg2); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 5px 8px; font-size: 13px; font-family: inherit;
    outline: none; transition: border-color .15s;
  }
  .je-ready input:focus, .je-ready select:focus, .je-ready textarea:focus {
    border-color: var(--accent);
  }
  .je-ready input[type=checkbox] { width: auto; accent-color: var(--accent); }
  .je-ready select option { background: var(--bg3); }
  .je-ready .je-object__container { padding: 0; }
  .je-ready .je-indented-panel {
    border-left: 2px solid var(--border); margin: 4px 0 4px 8px; padding: 6px 0 6px 12px;
  }
  .je-ready .row { margin-bottom: 14px; }
  .je-ready .btn { display: none; }
  /* Save bar */
  .save-bar {
    position: sticky; bottom: 0; background: var(--bg); border-top: 1px solid var(--border);
    padding: 12px 0; margin-top: 24px; display: flex; align-items: center; gap: 12px;
  }
  .btn-save {
    background: var(--accent); color: #fff; border: none; border-radius: var(--radius);
    padding: 6px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s;
  }
  .btn-save:hover { background: var(--accent-hover); }
  .save-hint { font-size: 12px; color: var(--text2); }
`;

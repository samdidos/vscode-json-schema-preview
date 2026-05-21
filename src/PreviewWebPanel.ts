import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

let position: { x: number; y: number } = { x: 0, y: 0 };

export const openJsonSchemaFiles: { [id: string]: vscode.WebviewPanel } = {};

export function previewJsonSchema(context: vscode.ExtensionContext) {
  return async (uri: vscode.Uri) => {
    uri = uri || ((await promptForJsonSchemaFile()) as vscode.Uri);
    if (uri) {
      openJsonSchema(context, uri);
    }
  };
}

export function isJsonSchemaFile(document?: vscode.TextDocument) {
  if (!document) {
    return false;
  }
  if (document.languageId === 'json') {
    try {
      const json = JSON.parse(document.getText());
      return !!json.$schema;
    } catch (e) {
      return false;
    }
  }
  if (document.languageId === 'yml' || document.languageId === 'yaml') {
    return document.getText().match(/^\$schema:/m) !== null;
  }
  return false;
}

export function openJsonSchema(context: vscode.ExtensionContext, uri: vscode.Uri) {
  const localResourceRoots = [vscode.Uri.file(path.dirname(uri.fsPath))];
  if (vscode.workspace.workspaceFolders) {
    vscode.workspace.workspaceFolders.forEach(folder => {
      localResourceRoots.push(folder.uri);
    });
  }
  const panel: vscode.WebviewPanel =
    openJsonSchemaFiles[uri.fsPath] ||
    vscode.window.createWebviewPanel('jsonschema-preview', '', vscode.ViewColumn.Two, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots,
    });

  panel.title = path.basename(uri.fsPath);
  panel.webview.html = getWebviewContent(uri, position);

  panel.webview.onDidReceiveMessage(
    message => {
      if (message.type === 'position') {
        position = { x: message.scrollX, y: message.scrollY };
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => {
    delete openJsonSchemaFiles[uri.fsPath];
  });
  openJsonSchemaFiles[uri.fsPath] = panel;
}

export async function promptForJsonSchemaFile() {
  if (isJsonSchemaFile(vscode.window.activeTextEditor?.document)) {
    return vscode.window.activeTextEditor?.document.uri;
  }
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Open JSON Schema file',
    filters: { 'JSON Schema': ['json', 'yaml', 'yml'] },
  });
  return uris?.[0];
}

function parseSchemaFile(filePath: string): object {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return (yaml.load(content) as object) || {};
  }
  return JSON.parse(content);
}

function getWebviewContent(jsonschemaFile: vscode.Uri, pos: { x: number; y: number }): string {
  let schema: object;
  try {
    schema = parseSchemaFile(jsonschemaFile.fsPath);
  } catch (err) {
    return `<html><body style="font-family:sans-serif;padding:24px"><h2>Error parsing schema</h2><pre>${String(err)}</pre></body></html>`;
  }

  const schemaJson = JSON.stringify(schema);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSON Schema Preview</title>
  <style>
    :root {
      --bg: #ffffff;
      --bg-secondary: #f6f8fa;
      --bg-tertiary: #f0f2f5;
      --border: #d0d7de;
      --text: #1f2328;
      --text-secondary: #656d76;
      --link: #0969da;
      --required: #cf222e;
      --optional: #6e7781;
      --c-string: #1a7f37;
      --c-number: #bc4c00;
      --c-boolean: #8250df;
      --c-array: #0550ae;
      --c-object: #0550ae;
      --c-null: #6e7781;
      --c-enum: #b5179e;
      --radius: 6px;
      --shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    body.vscode-dark, body.vscode-high-contrast {
      --bg: #1e1e1e;
      --bg-secondary: #252526;
      --bg-tertiary: #2d2d30;
      --border: #3c3c3c;
      --text: #cccccc;
      --text-secondary: #9d9d9d;
      --link: #4fc1ff;
      --required: #f47067;
      --c-string: #4ec9b0;
      --c-number: #ce9178;
      --c-boolean: #c586c0;
      --c-array: #4fc1ff;
      --c-object: #4fc1ff;
      --c-null: #9d9d9d;
      --c-enum: #d4a0ff;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text);
      background: var(--bg);
      margin: 0;
      padding: 24px 32px 64px;
      max-width: 860px;
    }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 1px 5px;
    }
    pre {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 16px;
      overflow-x: auto;
      font-size: 12px;
    }
    h1 { font-size: 24px; margin: 0 0 8px; font-weight: 700; }
    h2 { font-size: 17px; margin: 32px 0 12px; font-weight: 600; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    h3 { font-size: 15px; margin: 20px 0 8px; font-weight: 600; }

    /* Schema header */
    .schema-header { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid var(--border); }
    .schema-meta { font-size: 12px; color: var(--text-secondary); margin: 4px 0; }
    .schema-meta .label { font-weight: 600; }
    .schema-description { color: var(--text); margin: 12px 0 0; }

    /* Type badges */
    .type-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      font-family: 'SFMono-Regular', Consolas, monospace;
      padding: 1px 7px;
      border-radius: 20px;
      border: 1px solid;
      margin-right: 3px;
      line-height: 18px;
    }
    .type-string  { color: var(--c-string);  border-color: var(--c-string);  background: rgba(26,127,55,.08); }
    .type-number  { color: var(--c-number);  border-color: var(--c-number);  background: rgba(188,76,0,.08); }
    .type-integer { color: var(--c-number);  border-color: var(--c-number);  background: rgba(188,76,0,.08); }
    .type-boolean { color: var(--c-boolean); border-color: var(--c-boolean); background: rgba(130,80,223,.08); }
    .type-array   { color: var(--c-array);   border-color: var(--c-array);   background: rgba(5,80,174,.08); }
    .type-object  { color: var(--c-object);  border-color: var(--c-object);  background: rgba(5,80,174,.08); }
    .type-null    { color: var(--c-null);    border-color: var(--c-null);    background: rgba(110,119,129,.08); }
    .type-enum    { color: var(--c-enum);    border-color: var(--c-enum);    background: rgba(181,23,158,.08); }
    .type-const   { color: var(--c-enum);    border-color: var(--c-enum);    background: rgba(181,23,158,.08); }

    /* Required / optional */
    .required-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .4px;
      color: var(--required);
      border: 1px solid var(--required);
      border-radius: 20px;
      padding: 0 6px;
      margin-left: 6px;
      vertical-align: middle;
      line-height: 16px;
      display: inline-block;
    }

    /* Property rows */
    .properties { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin: 8px 0; }
    .property { border-bottom: 1px solid var(--border); }
    .property:last-child { border-bottom: none; }
    .property-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--bg-secondary);
      cursor: default;
      user-select: none;
    }
    .property-header.collapsible { cursor: pointer; }
    .property-header.collapsible:hover { background: var(--bg-tertiary); }
    .property-name {
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .property-types { margin-left: auto; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .toggle-icon { font-size: 10px; color: var(--text-secondary); transition: transform .15s; margin-left: 4px; }
    .toggle-icon.collapsed { transform: rotate(-90deg); }
    .property-body { padding: 12px 14px; background: var(--bg); }
    .property-body.hidden { display: none; }
    .description { margin: 0 0 8px; color: var(--text); }

    /* Nested properties */
    .properties .properties {
      margin: 8px 0 0;
      border-color: var(--border);
    }
    .section-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 8px 0 4px; }

    /* Constraints */
    .constraints { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
    .constraint {
      font-size: 11px;
      font-family: 'SFMono-Regular', Consolas, monospace;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 7px;
      color: var(--text-secondary);
    }

    /* Enum / default / examples */
    .enum-values, .default-value, .examples-value, .const-value { margin: 6px 0; font-size: 13px; }
    .label { font-weight: 600; color: var(--text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: .3px; margin-right: 6px; }
    .enum-value { display: inline-block; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 3px; padding: 0 5px; font-family: monospace; font-size: 12px; margin: 1px 2px; }

    /* oneOf / anyOf / allOf */
    .combined-schema { margin: 8px 0; }
    .combined-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-secondary); margin: 8px 0 6px; }
    .combined-options { display: flex; flex-direction: column; gap: 6px; }
    .combined-option { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .combined-option-header { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--bg-secondary); font-size: 12px; font-weight: 600; color: var(--text-secondary); }
    .combined-option-body { padding: 10px 12px; }
    .option-number { width: 18px; height: 18px; border-radius: 50%; background: var(--border); color: var(--text-secondary); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }

    /* Array items */
    .array-items { margin: 6px 0; }
    .inline-schema { padding: 6px 0; }

    /* Definitions */
    .definitions { margin-top: 40px; }
    .definition { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 16px; overflow: hidden; }
    .definition-name { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; margin: 0; padding: 10px 14px; background: var(--bg-secondary); border-bottom: 1px solid var(--border); }
    .definition-body { padding: 12px 14px; }

    /* Root type row */
    .root-type-row { margin: 0 0 16px; }

    /* Error */
    .parse-error { border: 1px solid var(--required); border-radius: var(--radius); padding: 16px; color: var(--required); background: rgba(207,34,46,.06); }
  </style>
</head>
<body x-timestamp="${Date.now()}">
  <div id="app"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const rootSchema = ${schemaJson};

    function esc(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function resolveRef(ref, schema) {
      if (!ref || !ref.startsWith('#/')) return null;
      const parts = ref.slice(2).split('/');
      let cur = schema;
      for (const p of parts) {
        const key = p.replace(/~1/g, '/').replace(/~0/g, '~');
        if (cur == null || typeof cur !== 'object') return null;
        cur = cur[key];
      }
      return cur;
    }

    function maybeResolve(schema) {
      if (schema && schema.$ref) {
        const resolved = resolveRef(schema.$ref, rootSchema);
        if (resolved) return Object.assign({}, resolved, schema, { $ref: undefined });
      }
      return schema;
    }

    function typeBadges(schema) {
      if (!schema) return '';
      schema = maybeResolve(schema);
      const types = [];
      if (schema.type) {
        (Array.isArray(schema.type) ? schema.type : [schema.type]).forEach(t => types.push(t));
      } else if (schema.properties) {
        types.push('object');
      } else if (schema.items) {
        types.push('array');
      }
      if (schema.enum) types.push('enum');
      if (schema.const !== undefined && !types.includes('const')) types.push('const');
      if (!types.length) return '';
      return types.map(t => '<span class="type-badge type-' + esc(t) + '">' + esc(t) + '</span>').join('');
    }

    function renderConstraints(schema) {
      const items = [];
      if (schema.minimum !== undefined)        items.push('min: ' + schema.minimum);
      if (schema.maximum !== undefined)        items.push('max: ' + schema.maximum);
      if (schema.exclusiveMinimum !== undefined) items.push('exclusiveMin: ' + schema.exclusiveMinimum);
      if (schema.exclusiveMaximum !== undefined) items.push('exclusiveMax: ' + schema.exclusiveMaximum);
      if (schema.minLength !== undefined)      items.push('minLength: ' + schema.minLength);
      if (schema.maxLength !== undefined)      items.push('maxLength: ' + schema.maxLength);
      if (schema.pattern)                      items.push('pattern: ' + schema.pattern);
      if (schema.minItems !== undefined)       items.push('minItems: ' + schema.minItems);
      if (schema.maxItems !== undefined)       items.push('maxItems: ' + schema.maxItems);
      if (schema.uniqueItems)                  items.push('uniqueItems');
      if (schema.minProperties !== undefined)  items.push('minProperties: ' + schema.minProperties);
      if (schema.maxProperties !== undefined)  items.push('maxProperties: ' + schema.maxProperties);
      if (schema.multipleOf !== undefined)     items.push('multipleOf: ' + schema.multipleOf);
      if (schema.format)                       items.push('format: ' + schema.format);
      if (!items.length) return '';
      return '<div class="constraints">' + items.map(c => '<span class="constraint">' + esc(c) + '</span>').join('') + '</div>';
    }

    function renderMeta(schema) {
      let html = '';
      if (schema.description)
        html += '<p class="description">' + esc(schema.description) + '</p>';
      html += renderConstraints(schema);
      if (schema.enum)
        html += '<div class="enum-values"><span class="label">Enum</span>' +
          schema.enum.map(v => '<span class="enum-value">' + esc(JSON.stringify(v)) + '</span>').join('') + '</div>';
      if (schema.const !== undefined)
        html += '<div class="const-value"><span class="label">Const</span><code>' + esc(JSON.stringify(schema.const)) + '</code></div>';
      if (schema.default !== undefined)
        html += '<div class="default-value"><span class="label">Default</span><code>' + esc(JSON.stringify(schema.default)) + '</code></div>';
      if (schema.examples && schema.examples.length)
        html += '<div class="examples-value"><span class="label">Example</span><code>' + esc(JSON.stringify(schema.examples[0])) + '</code></div>';
      return html;
    }

    function renderCombined(keyword, subschemas, depth) {
      const labels = { oneOf: 'One Of', anyOf: 'Any Of', allOf: 'All Of', not: 'Not' };
      let html = '<div class="combined-schema">';
      html += '<div class="combined-title">' + (labels[keyword] || keyword) + '</div>';
      const list = Array.isArray(subschemas) ? subschemas : [subschemas];
      html += '<div class="combined-options">';
      list.forEach((s, i) => {
        s = maybeResolve(s);
        html += '<div class="combined-option">';
        html += '<div class="combined-option-header"><span class="option-number">' + (i + 1) + '</span>' + typeBadges(s) + '</div>';
        html += '<div class="combined-option-body">' + renderSchemaBody(s, depth + 1) + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
      return html;
    }

    function renderSchemaBody(schema, depth) {
      schema = maybeResolve(schema);
      if (!schema) return '';
      let html = renderMeta(schema);
      if (schema.properties) {
        html += renderProperties(schema.properties, schema.required || [], depth);
      }
      if (schema.items) {
        const items = maybeResolve(schema.items);
        html += '<div class="array-items"><div class="section-label">Items</div>';
        html += '<div class="inline-schema">' + typeBadges(items) + renderSchemaBody(items, depth + 1) + '</div></div>';
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const ap = maybeResolve(schema.additionalProperties);
        html += '<div class="array-items"><div class="section-label">Additional Properties</div>';
        html += '<div class="inline-schema">' + typeBadges(ap) + renderSchemaBody(ap, depth + 1) + '</div></div>';
      }
      ['oneOf', 'anyOf', 'allOf'].forEach(kw => {
        if (schema[kw]) html += renderCombined(kw, schema[kw], depth);
      });
      if (schema.not) html += renderCombined('not', schema.not, depth);
      return html;
    }

    function renderProperty(name, propSchema, requiredFields, depth) {
      propSchema = maybeResolve(propSchema);
      const isRequired = requiredFields.includes(name);
      const id = 'p' + depth + '-' + name.replace(/[^a-z0-9]/gi, '_');
      const hasBody = propSchema.description || propSchema.constraints || propSchema.properties ||
        propSchema.items || propSchema.oneOf || propSchema.anyOf || propSchema.allOf ||
        propSchema.enum || propSchema.const !== undefined || propSchema.default !== undefined ||
        propSchema.examples || propSchema.format || propSchema.pattern ||
        propSchema.minLength !== undefined || propSchema.maxLength !== undefined ||
        propSchema.minimum !== undefined || propSchema.maximum !== undefined ||
        propSchema.additionalProperties;

      let html = '<div class="property">';
      html += '<div class="property-header' + (hasBody ? ' collapsible' : '') + '"' +
        (hasBody ? ' onclick="toggleProp(\\'' + id + '\\')"' : '') + '>';
      html += '<span class="property-name">' + esc(name) + '</span>';
      if (isRequired) html += '<span class="required-badge">required</span>';
      html += '<span class="property-types">' + typeBadges(propSchema);
      if (hasBody) html += '<span class="toggle-icon" id="icon-' + id + '">▼</span>';
      html += '</span>';
      html += '</div>';

      if (hasBody) {
        html += '<div class="property-body" id="body-' + id + '">';
        html += renderSchemaBody(propSchema, depth);
        html += '</div>';
      }

      html += '</div>';
      return html;
    }

    function renderProperties(properties, requiredFields, depth) {
      if (!properties) return '';
      const keys = Object.keys(properties);
      if (!keys.length) return '';
      let html = '<div class="properties">';
      keys.forEach(name => {
        html += renderProperty(name, properties[name], requiredFields, depth);
      });
      html += '</div>';
      return html;
    }

    function renderDefinitions(schema) {
      const defs = schema.$defs || schema.definitions;
      if (!defs || !Object.keys(defs).length) return '';
      let html = '<div class="definitions"><h2>Definitions / $defs</h2>';
      Object.entries(defs).forEach(([name, defSchema]) => {
        defSchema = maybeResolve(defSchema);
        html += '<div class="definition">';
        html += '<h3 class="definition-name" id="def-' + esc(name) + '">' + esc(name) + '</h3>';
        html += '<div class="definition-body">' + typeBadges(defSchema) + renderSchemaBody(defSchema, 0) + '</div>';
        html += '</div>';
      });
      html += '</div>';
      return html;
    }

    function toggleProp(id) {
      const body = document.getElementById('body-' + id);
      const icon = document.getElementById('icon-' + id);
      if (!body) return;
      const hidden = body.classList.toggle('hidden');
      if (icon) icon.classList.toggle('collapsed', hidden);
    }

    function renderPage(schema) {
      let html = '<header class="schema-header">';
      html += '<h1>' + esc(schema.title || 'JSON Schema') + '</h1>';
      if (schema.$schema) html += '<div class="schema-meta"><span class="label">$schema</span> <a href="' + esc(schema.$schema) + '">' + esc(schema.$schema) + '</a></div>';
      if (schema.$id)     html += '<div class="schema-meta"><span class="label">$id</span> <code>' + esc(schema.$id) + '</code></div>';
      if (schema.description) html += '<p class="schema-description">' + esc(schema.description) + '</p>';
      html += '</header>';

      if (schema.type || schema.enum || schema.const !== undefined) {
        html += '<div class="root-type-row">' + typeBadges(schema) + '</div>';
      }
      html += renderConstraints(schema);

      if (schema.properties) {
        html += '<h2>Properties</h2>';
        html += renderProperties(schema.properties, schema.required || [], 0);
      }

      ['oneOf', 'anyOf', 'allOf'].forEach(kw => {
        if (schema[kw]) html += renderCombined(kw, schema[kw], 0);
      });
      if (schema.not) html += renderCombined('not', schema.not, 0);

      html += renderDefinitions(schema);
      return html;
    }

    document.getElementById('app').innerHTML = renderPage(rootSchema);

    window.addEventListener('scrollend', () => {
      vscode.postMessage({ type: 'position', scrollX: window.scrollX || 0, scrollY: window.scrollY || 0 });
    });
    window.addEventListener('load', () => {
      setTimeout(() => window.scrollTo(${pos.x}, ${pos.y}), 100);
    });
  </script>
</body>
</html>`;
}

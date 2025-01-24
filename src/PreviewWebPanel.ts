import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let position : {x:0,y:0} = {
  x: 0,
  y: 0
};

export const openJsonSchemaFiles: { [id: string]: vscode.WebviewPanel } = {}; // vscode.Uri.fsPath => vscode.WebviewPanel

export function previewJsonSchema(context: vscode.ExtensionContext) {
 return async (uri: vscode.Uri) => {
    uri = uri || (await promptForJsonSchemaFile()) as vscode.Uri;
    if (uri) {
      console.log('Opening jsonschema file', uri.fsPath);
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
      return json.$schema;
    } catch (e) {
      return false;
    }
  }
  if (document.languageId === 'yml' || document.languageId === 'yaml') {
    return document.getText().match('^$schema:') !== null;
  }
  return false;
}

export function openJsonSchema(context: vscode.ExtensionContext, uri: vscode.Uri) {
  const localResourceRoots = [
    vscode.Uri.file(path.dirname(uri.fsPath)),
  ];
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
  panel.webview.html = getWebviewContent(context, panel.webview, uri, position);
          
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.type) {
        case 'position':{
          position = {
            x: message.scrollX,
            y: message.scrollY
          };
          
        }
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
    openLabel: 'Open Json Schema file',
    filters: {
      asyncAPI: ['yml', 'yaml', 'json'],
    },
  });
  return uris?.[0];
}

function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview, jsonschemaFile: vscode.Uri, position: {x:0,y:0}) {
  const jsonschemaComponentJs = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist/node_modules/@asyncapi/react-component/browser/standalone/index.js')
  );
  const jsonschemaComponentCss = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist/node_modules/@asyncapi/react-component/styles/default.min.css')
  );
  const jsonschemaWebviewUri = webview.asWebviewUri(jsonschemaFile);
  const jsonschemaBasePath = jsonschemaWebviewUri.toString().replace('%2B', '+'); // this is loaded by a different library so it requires unescaping the + character
  const jsonschemaContent = fs.readFileSync(jsonschemaFile.fsPath, 'utf-8');

  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <link rel="stylesheet" href="${jsonschemaComponentCss}">
      <style> 
      html{
        scroll-behavior: smooth;
      }
      body {
        color: #121212;
        background-color: #fff;
        word-wrap: break-word;
      }
      h1 {
        color: #121212;
      }
      </style>
    </head>
    <body x-timestamp="${Date.now()}">
      
      <div id="jsonschema"></div>
  
      <script src="${jsonschemaComponentJs}"></script>
      <script>
        const vscode = acquireVsCodeApi();
        JsonSchemaStandalone.render({
          schema:  {
            url: '${jsonschemaWebviewUri}',
            options: { method: "GET", mode: "cors" },
          },
          config: {
            show: {
              sidebar: true,
              errors: true,
            },
            parserOptions: { path: '${jsonschemaBasePath}' }
          },
        }, document.getElementById('jsonschema'));
        
        window.addEventListener('scrollend', event => {
                vscode.postMessage({
                  type: 'position',
                  scrollX: window.scrollX || 0,
                  scrollY: window.scrollY || 0
                });
        });
        
        window.addEventListener("load", (event) => {
          setTimeout(()=>{window.scrollBy('${position.x}','${position.y}')},1000)
        });
        
      </script>
  
    </body>
  </html>
    `;
  return html;
}

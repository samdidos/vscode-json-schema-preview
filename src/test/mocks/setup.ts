// Intercepts require('vscode') before any test file is loaded and returns the
// mock module instead. Must be passed via mocha --require so it runs first.
/* eslint-disable @typescript-eslint/no-var-requires */
const Module = require('module');
const path   = require('path');

const mockPath = path.resolve(__dirname, 'vscode');
const _orig    = Module._load.bind(Module);

Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'vscode') { return require(mockPath); }
  return _orig(request, parent, isMain);
};

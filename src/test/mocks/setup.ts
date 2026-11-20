// Intercepts require('vscode') before any test file is loaded and returns the
// mock module instead. Must be passed via mocha --require so it runs first.
 
const Module = require('module');
const path   = require('path');

const mockPath = path.resolve(__dirname, 'vscode');
const _orig    = Module._load.bind(Module);

Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'vscode') { return require(mockPath); }
  return _orig(request, parent, isMain);
};

// Sinon's default sandbox keeps every fake it creates so `sinon.restore()` can
// undo them later, along with each fake's full call history (a stack trace per
// call). This suite never calls `sinon.restore()`, so every anonymous
// `sinon.stub()` from every test stayed reachable: with ~2000 tests that grew
// to ~1.8 GB, close to Node's default heap limit, and the coverage run died of
// OOM. Once a test finishes, forget its anonymous fakes; stubs that wrap a real
// method (those with `restore`) stay, so restoring them keeps working. Nothing
// else is lost — no test uses the sandbox-wide reset/restore helpers.
const sinon = require('sinon');

export const mochaHooks = {
  afterEach(): void {
    const fakes: Array<{ restore?: unknown }> = sinon.getFakes();
    for (let i = fakes.length - 1; i >= 0; i--) {
      if (typeof fakes[i].restore !== 'function') { fakes.splice(i, 1); }
    }
  },
};

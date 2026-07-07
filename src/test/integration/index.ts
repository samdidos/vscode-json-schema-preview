// Mocha loader executed inside the Extension Host by @vscode/test-electron
// (S08-SR-01, tdd interface per S08-SR-03). Which suite files run depends on
// which fixture workspace runTest.ts opened this VS Code instance against
// (S08-SR-02), communicated via JSONSCHEMA_E2E_SUITE since the suite files
// themselves have no other way to know which workspace is open.
import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60_000 });
  const suiteDir = path.resolve(__dirname, '../suites');
  const which = process.env.JSONSCHEMA_E2E_SUITE ?? 'single-folder';
  const prefix = which === 'multi-root' ? 'multiRoot.' : 'singleFolder.';
  const files = fs.readdirSync(suiteDir).filter(f => f.startsWith(prefix) && f.endsWith('.test.js'));

  if (files.length === 0) {
    return Promise.reject(new Error(`No integration test files matched "${prefix}*.test.js" in ${suiteDir}`));
  }
  files.forEach(f => mocha.addFile(path.join(suiteDir, f)));

  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) { reject(new Error(`${failures} integration test(s) failed.`)); }
        else { resolve(); }
      });
    } catch (err) {
      reject(err);
    }
  });
}

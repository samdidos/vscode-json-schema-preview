import * as path from 'path';
import Mocha = require('mocha');
import { sync as globSync } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10_000 });
  const testsRoot = path.resolve(__dirname, '.');

  const files = globSync('**/*.test.js', { cwd: testsRoot });
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) reject(new Error(`${failures} tests failed`));
      else resolve();
    });
  });
}

'use strict';
const fs = require('fs');
const path = require('path');

const summaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('coverage/coverage-summary.json not found — run tests with --coverage first.');
  process.exit(1);
}

const { total } = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
const thresholds = { lines: 80, branches: 80, functions: 80, statements: 80 };

let passed = true;
for (const [key, min] of Object.entries(thresholds)) {
  const pct = total[key]?.pct ?? 0;
  const ok = pct >= min;
  console.log(`${ok ? '✓' : '✗'} ${key.padEnd(11)} ${String(pct).padStart(5)}%  (threshold ${min}%)`);
  if (!ok) { passed = false; }
}

if (!passed) {
  console.error('\nCoverage below threshold — add more tests.');
  process.exit(1);
}
console.log('\nAll coverage thresholds met.');

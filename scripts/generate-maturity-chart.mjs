#!/usr/bin/env node
// Regenerates the maturity-scorecard bar chart embedded in MATURITY.md from
// the score data below. Run after editing the snapshot table in MATURITY.md
// so the chart and the table never drift apart:
//   node scripts/generate-maturity-chart.mjs
//
// Emits a light and a dark SVG (docs/public/maturity-scorecard-{light,dark}.svg),
// referenced from MATURITY.md via a <picture> element so GitHub renders the
// theme-matched version. Static (no JS) by design — GitHub-rendered markdown
// cannot execute scripts, so there is no hover layer; the full detail lives in
// MATURITY.md's own table, which this chart summarises visually.

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', 'public');
const SNAPSHOT_DATE = '2026-07-04';
const MAX_SCORE = 5;

// Mirrors the snapshot table in MATURITY.md — update both together.
const OVERALL = { label: 'Overall', score: 4.5 };
const DIMENSIONS = [
  { label: 'Spec & process', score: 5.0 },
  { label: 'AI-agent integration', score: 4.7 },
  { label: 'Testing', score: 4.5 },
  { label: 'Security / supply chain', score: 4.5 },
  { label: 'CI/CD & release', score: 4.5 },
  { label: 'Docs', score: 4.0 },
  { label: 'Code quality', score: 4.0 },
].sort((a, b) => b.score - a.score);

const THEME = {
  light: {
    surface: '#fcfcfb',
    primaryInk: '#0b0b0b',
    secondaryInk: '#52514e',
    mutedInk: '#898781',
    gridline: '#e1e0d9',
    baseline: '#c3c2b7',
    accent: '#2a78d6', // validated: node scripts/validate_palette.js "#2a78d6" --mode light
  },
  dark: {
    surface: '#1a1a19',
    primaryInk: '#ffffff',
    secondaryInk: '#c3c2b7',
    mutedInk: '#898781',
    gridline: '#2c2c2a',
    baseline: '#383835',
    accent: '#3987e5', // validated: node scripts/validate_palette.js "#3987e5" --mode dark --surface "#1a1a19"
  },
};

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderChart(theme) {
  const width = 640;
  const marginLeft = 190;
  const marginRight = 56;
  const marginTop = 98; // clears the title + subtitle before the axis row starts
  const axisLabelY = marginTop - 14;
  const gridTop = marginTop - 6;
  const barHeight = 22;
  const barGap = 14;
  const groupGap = 26; // extra air between the Overall bar and the per-dimension bars
  const plotWidth = width - marginLeft - marginRight;

  const rows = [OVERALL, ...DIMENSIONS];
  const rowY = [];
  let y = marginTop;
  rows.forEach((_, i) => {
    rowY.push(y);
    y += barHeight + barGap + (i === 0 ? groupGap - barGap : 0);
  });
  const height = y - barGap + 40;

  const xScale = (score) => (score / MAX_SCORE) * plotWidth;

  const gridlines = [1, 2, 3, 4, 5].map(tick => {
    const x = marginLeft + xScale(tick);
    return `
    <line x1="${x}" y1="${gridTop}" x2="${x}" y2="${y - barGap + 8}"
          stroke="${tick === 5 ? theme.baseline : theme.gridline}" stroke-width="1" />
    <text x="${x}" y="${axisLabelY}" font-size="11" fill="${theme.mutedInk}"
          text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">${tick}</text>`;
  }).join('');

  const bars = rows.map((row, i) => {
    const barY = rowY[i];
    const barW = Math.max(xScale(row.score), barHeight); // never shorter than its own rounded cap
    const isOverall = i === 0;
    const labelWeight = isOverall ? '600' : '400';
    const barFill = theme.accent;
    return `
    <text x="${marginLeft - 16}" y="${barY + barHeight / 2 + 4}" font-size="13"
          font-weight="${labelWeight}" fill="${theme.primaryInk}" text-anchor="end"
          font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">${escapeXml(row.label)}</text>
    <rect x="${marginLeft}" y="${barY}" width="${barW}" height="${barHeight}" rx="4" ry="4" fill="${barFill}" />
    <text x="${marginLeft + barW + 10}" y="${barY + barHeight / 2 + 4}" font-size="13" font-weight="600"
          fill="${theme.primaryInk}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">${row.score.toFixed(1)}</text>`;
  }).join('');

  const dividerY = rowY[1] - groupGap / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${theme.surface}" />
  <text x="${marginLeft}" y="28" font-size="16" font-weight="600" fill="${theme.primaryInk}"
        font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">Project Maturity Scorecard</text>
  <text x="${marginLeft}" y="48" font-size="12" fill="${theme.secondaryInk}"
        font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">Snapshot: ${SNAPSHOT_DATE} — scored out of ${MAX_SCORE}</text>
  ${gridlines}
  <line x1="${marginLeft}" y1="${dividerY}" x2="${width - marginRight}" y2="${dividerY}"
        stroke="${theme.gridline}" stroke-width="1" />
  ${bars}
</svg>`;
}

for (const [mode, theme] of Object.entries(THEME)) {
  const svg = renderChart(theme);
  const outPath = join(OUT_DIR, `maturity-scorecard-${mode}.svg`);
  writeFileSync(outPath, svg);
  console.log(`Wrote ${outPath}`);
}

#!/usr/bin/env python3
"""Sync static shields.io badges in README.md from live project data.

Vendor-neutral: run it directly as `npm run badges:sync` (or
`python3 scripts/sync-readme-badges.py`). It reads package.json and, when
present, coverage/coverage-summary.json, and rewrites the matching static
shields.io badges in README.md. It never fails a build — a missing coverage
summary just leaves the coverage badge untouched.

Called from two places, both through the npm command so the logic lives here
only (AGENTS.md "reach shared logic through vendor-neutral commands"):
  - `.claude/hooks/update-readme-badges.sh` — a Claude Code convenience hook,
    after package.json edits (engine/node/license badges).
  - `.github/workflows/maturity-refresh.yml` — the weekly CI job that runs
    coverage and opens a data-only PR, so the coverage badge is refreshed and
    committed as a real pipeline guarantee, not only when an agent happens to
    run.

The coverage badge is only as fresh as the last coverage run on disk, so run
`npm run test:coverage` first if you invoke this by hand.
"""
import json, re, sys, urllib.parse
from pathlib import Path

root = Path(__file__).parent.parent
readme_path = root / 'README.md'
text = readme_path.read_text()
pkg = json.loads((root / 'package.json').read_text())
cov_path = root / 'coverage' / 'coverage-summary.json'
changes: list[str] = []


def enc(s: str) -> str:
    return urllib.parse.quote(s, safe='')


# ── Coverage badge ────────────────────────────────────────────────────────────
if cov_path.exists():
    totals = json.loads(cov_path.read_text()).get('total', {})
    pcts = [
        v['pct'] for v in totals.values()
        if isinstance(v, dict) and isinstance(v.get('pct'), (int, float))
    ]
    if pcts:
        min_pct = min(pcts)
        pct_str = f'{min_pct:.1f}%'
        color = 'brightgreen' if min_pct >= 80 else 'yellow' if min_pct >= 70 else 'red'
        new_url = f'https://img.shields.io/badge/coverage-{enc(pct_str)}-{color}'
        # The coverage badge has no ?params, so [^)]+ safely captures the full URL
        text, n = re.subn(
            r'https://img\.shields\.io/badge/coverage-[^)]+',
            new_url, text
        )
        if n:
            changes.append(f'coverage={pct_str}')

# ── VS Code engine badge ──────────────────────────────────────────────────────
# URL-encoded engine strings (e.g. %5E1.96.0) contain no literal hyphens,
# so [^-]+ safely matches the value up to the -blue colour segment.
vscode = pkg.get('engines', {}).get('vscode', '')
if vscode:
    text, n = re.subn(
        r'(https://img\.shields\.io/badge/VS%20Code-)[^-]+(-blue)',
        rf'\g<1>{enc(vscode)}\g<2>', text
    )
    if n:
        changes.append(f'vscode={vscode}')

# ── Node engine badge ─────────────────────────────────────────────────────────
node_ver = pkg.get('engines', {}).get('node', '')
if node_ver:
    text, n = re.subn(
        r'(https://img\.shields\.io/badge/node-)[^-]+(-brightgreen)',
        rf'\g<1>{enc(node_ver)}\g<2>', text
    )
    if n:
        changes.append(f'node={node_ver}')

# ── License badge ─────────────────────────────────────────────────────────────
lic = pkg.get('license', '')
if lic:
    text, n = re.subn(
        r'(https://img\.shields\.io/badge/License-)[^-]+(-yellow)',
        rf'\g<1>{enc(lic)}\g<2>', text
    )
    if n:
        changes.append(f'license={lic}')

# ── Write back ────────────────────────────────────────────────────────────────
readme_path.write_text(text)
if changes:
    print(f'✓ README badges synced: {", ".join(changes)}', file=sys.stderr)
else:
    print('✓ README badges already current.', file=sys.stderr)

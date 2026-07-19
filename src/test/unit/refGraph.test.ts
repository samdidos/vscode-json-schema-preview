import * as assert from 'assert';
import fc from 'fast-check';

const {
  buildRefGraph,
  detectCycle,
  layoutGraph,
  renderGraphSvg,
  renderAdjacencyList,
  summarizeGraph,
} = require('../../refGraph');

const nodeIds = (g: { nodes: { id: string }[] }): string[] => g.nodes.map((n) => n.id).sort();
const edgePairs = (g: { edges: { from: string; to: string }[] }): string[] =>
  g.edges.map((e) => `${e.from}->${e.to}`).sort();

suite('[F24-FR-04][F24-NFR-01] buildRefGraph() — nodes & edges', () => {
  test('creates root plus a node per $defs entry, referenced or not', () => {
    const schema = {
      properties: { u: { $ref: '#/$defs/A' } },
      $defs: { A: { $ref: '#/$defs/B' }, B: {}, C: {} },
    };
    const g = buildRefGraph(schema);
    assert.deepStrictEqual(nodeIds(g), ['#', '#/$defs/A', '#/$defs/B', '#/$defs/C']);
    // Root→A (from the property), A→B (inside def A). C is isolated.
    assert.deepStrictEqual(edgePairs(g), ['#->#/$defs/A', '#/$defs/A->#/$defs/B']);
  });

  test('attributes an edge to the enclosing definition, not the root', () => {
    const schema = { $defs: { A: { properties: { x: { $ref: '#/$defs/B' } } }, B: {} } };
    const g = buildRefGraph(schema);
    assert.ok(g.edges.some((e: any) => e.from === '#/$defs/A' && e.to === '#/$defs/B'));
    assert.ok(!g.edges.some((e: any) => e.from === '#'));
  });

  test('handles the legacy definitions keyword', () => {
    const schema = { $ref: '#/definitions/A', definitions: { A: {} } };
    const g = buildRefGraph(schema);
    assert.ok(g.nodes.some((n: any) => n.id === '#/definitions/A' && n.kind === 'definition'));
  });

  test('dedupes repeated identical edges and labels the ref', () => {
    const schema = { allOf: [{ $ref: '#/$defs/A' }, { $ref: '#/$defs/A' }], $defs: { A: {} } };
    const g = buildRefGraph(schema);
    assert.strictEqual(g.edges.length, 1);
    assert.strictEqual(g.edges[0].ref, '#/$defs/A');
  });
});

suite('[F24-FR-04][F24-NFR-03] buildRefGraph() — external endpoints', () => {
  test('adds relative and remote nodes without fetching', () => {
    const schema = {
      allOf: [{ $ref: './other.json#/X' }, { $ref: 'https://example.com/s.json#/Y' }],
    };
    const g = buildRefGraph(schema);
    const rel = g.nodes.find((n: any) => n.id === './other.json');
    const rem = g.nodes.find((n: any) => n.id === 'https://example.com/s.json');
    assert.strictEqual(rel.kind, 'relative');
    assert.strictEqual(rem.kind, 'remote');
  });

  test('a bare "#" ref points back at the root node', () => {
    const g = buildRefGraph({ properties: { self: { $ref: '#' } } });
    assert.ok(g.edges.some((e: any) => e.to === '#'));
  });
});

suite('[F24-FR-05] buildRefGraph() — unresolved refs', () => {
  test('marks a pointer with no target as unresolved and lists it', () => {
    const g = buildRefGraph({ $ref: '#/$defs/Missing', $defs: { Present: {} } });
    const missing = g.nodes.find((n: any) => n.id === '#/$defs/Missing');
    assert.strictEqual(missing.kind, 'unresolved');
    assert.deepStrictEqual(g.unresolved, ['#/$defs/Missing']);
  });
});

suite('[F24-FR-06] detectCycle()', () => {
  test('finds a mutual A→B→A cycle', () => {
    const g = buildRefGraph({ $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } } });
    const cycle = detectCycle(g);
    assert.ok(cycle, 'a cycle is detected');
    assert.ok(cycle.includes('#/$defs/A') && cycle.includes('#/$defs/B'));
  });

  test('returns undefined for an acyclic graph', () => {
    const g = buildRefGraph({ $defs: { A: { $ref: '#/$defs/B' }, B: {} } });
    assert.strictEqual(detectCycle(g), undefined);
  });

  test('detects a self-reference cycle', () => {
    const g = buildRefGraph({ $defs: { A: { $ref: '#/$defs/A' } } });
    assert.ok(detectCycle(g));
  });
});

suite('[F24-FR-07] layoutGraph()', () => {
  test('assigns BFS layers from the root and columns increase with depth', () => {
    const g = buildRefGraph({ properties: { u: { $ref: '#/$defs/A' } }, $defs: { A: { $ref: '#/$defs/B' }, B: {} } });
    const layout = layoutGraph(g);
    const byId = new Map<string, any>(layout.nodes.map((n: any) => [n.id, n]));
    assert.strictEqual(byId.get('#').layer, 0);
    assert.strictEqual(byId.get('#/$defs/A').layer, 1);
    assert.strictEqual(byId.get('#/$defs/B').layer, 2);
    assert.ok(byId.get('#/$defs/B').x > byId.get('#').x);
    assert.ok(layout.width > 0 && layout.height > 0);
  });

  test('places a node unreachable from the root in a trailing layer', () => {
    const g = buildRefGraph({ properties: { u: { $ref: '#/$defs/A' } }, $defs: { A: {}, Orphan: {} } });
    const layout = layoutGraph(g);
    const byId = new Map<string, any>(layout.nodes.map((n: any) => [n.id, n]));
    assert.ok(byId.get('#/$defs/Orphan').layer > byId.get('#/$defs/A').layer);
  });
});

suite('[F24-NFR-02] rendering escapes untrusted content', () => {
  test('renderGraphSvg escapes angle brackets in a ref/label', () => {
    const g = buildRefGraph({ $ref: './<script>.json' });
    const svg = renderGraphSvg(layoutGraph(g));
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('&lt;script&gt;'));
    assert.ok(svg.startsWith('<svg'));
  });

  test('renderAdjacencyList lists each node and its targets', () => {
    const g = buildRefGraph({ properties: { u: { $ref: '#/$defs/A' } }, $defs: { A: {}, C: {} } });
    const adj = renderAdjacencyList(g);
    assert.match(adj, /\(root\) \[root\] → A/);
    assert.match(adj, /C \[definition\] → \(no references\)/);
  });

  test('summarizeGraph counts references, definitions, external, and flags cycles', () => {
    const g = buildRefGraph({ $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } } });
    const s = summarizeGraph(g);
    assert.match(s, /2 references/);
    assert.match(s, /2 definitions/);
    assert.match(s, /cyclic/);
  });
});

suite('[F24-NFR-03] property: buildRefGraph never throws', () => {
  test('handles arbitrary JSON schemas', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (schema) => {
        const g = buildRefGraph(schema);
        // Layout and rendering must also survive any graph.
        renderGraphSvg(layoutGraph(g));
        renderAdjacencyList(g);
        return Array.isArray(g.nodes) && Array.isArray(g.edges);
      }),
    );
  });
});

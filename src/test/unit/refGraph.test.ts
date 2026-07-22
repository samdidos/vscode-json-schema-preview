import * as assert from 'assert';
import fc from 'fast-check';

const {
  buildRefGraph,
  detectCycle,
  layoutGraph,
  renderGraphSvg,
  renderAdjacencyList,
  summarizeGraph,
  expandRefGraph,
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

suite('[F24-FR-10][F24-NFR-05] expandRefGraph() — fetch and recurse', () => {
  test('fetches an external node and adds its own $defs under it', async () => {
    const local = buildRefGraph({ allOf: [{ $ref: './child.json' }] });
    const resolve = async (uri: string) => {
      assert.strictEqual(uri, './child.json');
      return { id: '/abs/child.json', schema: { $defs: { A: {} }, properties: { p: { $ref: '#/$defs/A' } } } };
    };
    const g = await expandRefGraph(local, resolve, { maxDepth: 3 });
    assert.ok(g.nodes.some((n: any) => n.id === './child.json' && n.kind === 'relative'));
    const def = g.nodes.find((n: any) => n.id === '/abs/child.json#/$defs/A');
    assert.ok(def && def.kind === 'definition');
    assert.ok(g.edges.some((e: any) => e.from === './child.json' && e.to === '/abs/child.json#/$defs/A'));
  });

  test('stops at maxDepth and leaves the deeper ref as an unfetched terminal node', async () => {
    let calls = 0;
    const resolve = async (uri: string) => {
      calls++;
      if (uri === './child.json') { return { id: '/abs/child.json', schema: { $ref: './grandchild.json' } }; }
      throw new Error(`unexpected fetch of ${uri}`);
    };
    const local = buildRefGraph({ $ref: './child.json' });
    const g = await expandRefGraph(local, resolve, { maxDepth: 1 });
    assert.strictEqual(calls, 1, 'grandchild.json must not be fetched beyond maxDepth');
    const terminal = g.nodes.find((n: any) => n.id === '/abs/child.json::./grandchild.json');
    assert.ok(terminal, 'unfetched terminal node is still present');
    assert.strictEqual(terminal.kind, 'relative');
  });
});

suite('[F24-FR-11] expandRefGraph() — document reuse and cross-document cycles', () => {
  test('a document reached via a second ref is not re-walked', async () => {
    const local = buildRefGraph({
      properties: { x: { $ref: './a.json' }, y: { $ref: './b.json' } },
    });
    const resolve = async () => ({ id: 'CANON', schema: { $defs: { Shared: {} } } });
    const g = await expandRefGraph(local, resolve, { maxDepth: 3 });
    const shared = g.nodes.filter((n: any) => n.label === 'Shared');
    assert.strictEqual(shared.length, 1, 'the same canonical document contributes definitions only once');
  });

  test('a reference cycle spanning two fetched documents is detected', async () => {
    const local = buildRefGraph({ $ref: './b.json' });
    const resolve = async (uri: string) => {
      if (uri === './b.json') { return { id: 'B', schema: { $ref: './c.json' } }; }
      if (uri === './c.json') { return { id: 'C', schema: { $ref: './b.json' } }; }
      throw new Error(`unexpected fetch of ${uri}`);
    };
    const g = await expandRefGraph(local, resolve, { maxDepth: 5 });
    const cycle = detectCycle(g);
    assert.ok(cycle, 'a cross-document cycle is reported');
  });
});

suite('[F24-FR-12] expandRefGraph() — a failed document does not abort the pass', () => {
  test('records an error node and message, other branches still resolve', async () => {
    const local = buildRefGraph({
      properties: { a: { $ref: './ok.json' }, b: { $ref: './bad.json' } },
    });
    const resolve = async (uri: string) => {
      if (uri === './ok.json') { return { id: 'OK', schema: { $defs: { X: {} } } }; }
      throw new Error('network down');
    };
    const g = await expandRefGraph(local, resolve, { maxDepth: 3 });
    assert.ok(g.nodes.some((n: any) => n.id === 'OK#/$defs/X'), 'the unrelated ok.json branch still resolves');
    const bad = g.nodes.find((n: any) => n.id === './bad.json');
    assert.strictEqual(bad.kind, 'error');
    assert.ok(g.errors.some((e: any) => e.ref === './bad.json' && e.message === 'network down'));
  });

  test('an auth-shaped failure carries the challenged URL for the caller to offer configuration', async () => {
    class FakeAuthError extends Error {
      constructor(public readonly url: string) {
        super('HTTP 401');
        this.name = 'AuthRequiredError';
      }
    }
    const local = buildRefGraph({ $ref: 'https://example.com/private.json' });
    const resolve = async () => { throw new FakeAuthError('https://example.com/private.json'); };
    const g = await expandRefGraph(local, resolve, { maxDepth: 3 });
    assert.strictEqual(g.errors[0].authUrl, 'https://example.com/private.json');
  });
});

suite('[F24-FR-10][F24-FR-12] expandRefGraph() — nested document detail', () => {
  test('walks an array of $refs, a bare "#" self-ref, and records a nested fetch failure', async () => {
    const local = buildRefGraph({ $ref: './parent.json' });
    const resolve = async (uri: string, baseId: string) => {
      if (uri === './parent.json') {
        return {
          id: 'PARENT',
          schema: { allOf: [{ $ref: '#' }, { $ref: './child-bad.json' }] },
        };
      }
      if (uri === './child-bad.json') {
        assert.strictEqual(baseId, 'PARENT');
        throw new Error('boom');
      }
      throw new Error(`unexpected fetch of ${uri}`);
    };
    const g = await expandRefGraph(local, resolve, { maxDepth: 3 });
    assert.ok(g.edges.some((e: any) => e.from === './parent.json' && e.to === 'PARENT' && e.ref === '#'));
    const errNode = g.nodes.find((n: any) => n.id === 'PARENT::err:./child-bad.json');
    assert.ok(errNode && errNode.kind === 'error');
    assert.ok(g.errors.some((e: any) => e.ref === './child-bad.json' && e.message === 'boom'));
  });
});

suite('[F24-FR-09] expandRefGraph() — cancellation aborts the whole pass', () => {
  test('a "Canceled" resolver rejection propagates instead of becoming an error node', async () => {
    const local = buildRefGraph({ $ref: './child.json' });
    const resolve = async () => {
      const e = new Error('Canceled');
      e.name = 'Canceled';
      throw e;
    };
    await assert.rejects(() => expandRefGraph(local, resolve, { maxDepth: 3 }), /Canceled/);
  });
});

suite('[F24-NFR-04] expandRefGraph() — document cap', () => {
  test('stops fetching once the cap is reached, leaving the rest unresolved', async () => {
    let calls = 0;
    const local = buildRefGraph({
      properties: { a: { $ref: './a.json' }, b: { $ref: './b.json' } },
    });
    const resolve = async (uri: string) => {
      calls++;
      return { id: uri, schema: { $defs: { Def: {} } } };
    };
    const g = await expandRefGraph(local, resolve, { maxDepth: 3, maxDocs: 1 });
    assert.strictEqual(calls, 1, 'only one document is fetched once the cap is hit');
    const bNode = g.nodes.find((n: any) => n.id === './b.json');
    assert.strictEqual(bNode.kind, 'relative', 'the capped node is left exactly as the local graph had it');
  });
});

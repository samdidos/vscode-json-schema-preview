import * as http from 'http';

export interface FixtureHttpServer {
  /** e.g. `http://127.0.0.1:54321` — a real origin the extension host can fetch. */
  origin: string;
  close: () => Promise<void>;
}

/**
 * Serves `routes` (path -> response body) over plain HTTP on a random
 * loopback-only port.
 *
 * S08-NFR-02 requires that remote-schema scenarios "use a local HTTP fixture
 * server" rather than reach the real network — so this is the sanctioned way to
 * demo anything defined in terms of a URL (the local schema cache, F08; catalog
 * sources, F12). Two features genuinely need one: the extension fetches schemas
 * and catalogs with `fetch()`, which in the extension host is undici and does
 * not support the `file:` scheme, so pointing them at a path on disk is not an
 * option even though the file is right there.
 *
 * Loopback-only (`127.0.0.1`), a random port, and torn down with the demo — it
 * is reachable from the extension-host process and from nowhere else.
 *
 * This mirrors the integration suite's own `startFixtureHttpServer`
 * (src/test/integration/helpers.ts) deliberately rather than importing it: the
 * two suites compile under different tsconfigs and the integration helper drags
 * in VS Code test plumbing an e2e demo has no use for.
 */
export function startFixtureHttpServer(routes: Record<string, string>): Promise<FixtureHttpServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const body = req.url ? routes[req.url] : undefined;
      if (body === undefined) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('expected an AddressInfo from the fixture HTTP server'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res2, rej2) => server.close(err => (err ? rej2(err) : res2()))),
      });
    });
  });
}

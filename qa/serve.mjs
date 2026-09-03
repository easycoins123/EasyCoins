/**
 * Minimal static server with SPA history fallback, used for QA runs.
 * Serves the production build the same way a static host would.
 *
 * With `API_PROXY` set (or the third argument), requests under `/api/` are
 * forwarded to that origin with their cookies, and the reply comes back with
 * its `Set-Cookie` headers intact. That is the shape of production, where the
 * storefront's host rewrites `/api/*` to the API project, so a browser test
 * against a local backend exercises the same same-origin cookie behaviour.
 *
 * Exported so QA scripts can own the server lifecycle in-process rather than
 * depending on a separate long-running shell.
 */
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Forwards one request to the API origin and streams the reply back. */
function proxy(req, res, target) {
  const upstream = new URL(target);
  const headers = { ...req.headers, host: upstream.host };
  const forwarded = httpRequest(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(res);
    },
  );
  forwarded.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ kind: 'PROXY', message: `API unreachable: ${error.message}` }));
  });
  req.pipe(forwarded);
}

export function startServer(
  port = 4321,
  root = join(process.cwd(), 'dist', 'top-token'),
  apiProxy = process.env.API_PROXY,
) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (apiProxy && url.pathname.startsWith('/api/')) {
      proxy(req, res, apiProxy);
      return;
    }

    let filePath = resolve(root, `.${normalize(decodeURIComponent(url.pathname))}`);

    if (!filePath.startsWith(root)) {
      filePath = join(root, 'index.html');
    }

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
    } catch {
      filePath = join(root, 'index.html'); // SPA history fallback
    }

    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });

  return new Promise((resolveReady) => {
    server.listen(port, () => resolveReady(server));
  });
}

// Allow running standalone: node qa/serve.mjs [port]
// Compared as paths, not URL strings: on Windows the URL form carries an extra
// slash before the drive letter, so a string comparison never matched there.
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const port = Number(process.argv[2] ?? 4321);
  await startServer(port);
  console.log(`QA static server on http://localhost:${port}${process.env.API_PROXY ? ` (proxying /api to ${process.env.API_PROXY})` : ''}`);
}

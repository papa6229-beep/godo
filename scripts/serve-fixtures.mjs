#!/usr/bin/env node
/*
 * scripts/serve-fixtures.mjs
 * repo 루트를 정적 서빙하는 초경량 서버(렌더 검증 fixture 확인용).
 *   실행: node scripts/serve-fixtures.mjs   → http://127.0.0.1:5601/scripts/fixtures/ranked-chart-visual-check.html
 * 목적: Marketing rankedBar 시각 렌더 검증 — 실제 CSS + RankedBarChart DOM을 브라우저(또는 Playwright)로 열어
 *       track/fill의 computed height/width/backgroundColor를 확인한다(chartSpec smoke로 못 잡는 CSS 붕괴 감시).
 */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const PORT = Number(process.env.FIXTURE_PORT || 5601);
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };

http.createServer((req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const fp = path.resolve(path.join(ROOT, url));
    if (!fp.startsWith(ROOT) || !existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(readFileSync(fp));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`fixture server: http://127.0.0.1:${PORT}/scripts/fixtures/ranked-chart-visual-check.html`);
});

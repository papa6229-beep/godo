#!/usr/bin/env node
/*
 * scripts/report-vercel-api-function-count.mjs
 * Vercel이 세는 /api route entry(=서버리스 함수) 수 진단. api/_shared 제외.
 * 진단 전용 — 파일 개수만으로 기능을 삭제하지 않는다.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const API_DIR = path.join(REPO, 'api');
const HOBBY_LIMIT = 12;

function listRouteEntries(dir, rel = 'api') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = `${rel}/${name}`;
    if (statSync(full).isDirectory()) {
      if (name === '_shared') continue; // _shared는 함수가 아님(공유 라이브러리)
      out.push(...listRouteEntries(full, relPath));
    } else if (name.endsWith('.ts') || name.endsWith('.js')) {
      out.push(relPath);
    }
  }
  return out;
}

const entries = listRouteEntries(API_DIR).sort();
console.log('Vercel API route entries:');
entries.forEach((e, i) => console.log(`${i + 1}. ${e}`));
console.log(`\nTotal route entries: ${entries.length}`);
console.log(`Vercel Hobby demo target: <= ${HOBBY_LIMIT}`);
console.log(entries.length <= HOBBY_LIMIT ? 'OK — within Hobby limit' : `OVER by ${entries.length - HOBBY_LIMIT}`);
process.exit(0);

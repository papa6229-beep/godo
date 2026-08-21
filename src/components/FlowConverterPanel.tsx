import React, { useCallback, useEffect, useRef, useState } from 'react';
import './FlowConverterPanel.css';

// 단순형 정본 변환기 — 고도 화면 안의 최소 진입 (P1).
//
// 서버는 `api/flow-convert.py` 하나이고, 변환 규칙·HTML·게이트 판정은 전부
// `tools/detail-page-converter` 정본 모듈이 한다. 이 화면은 파일을 올리고, 목록에서
// 하나를 고르고, 결과를 보여줄 뿐 어떤 판정도 다시 하지 않는다.
//
// P1 범위 밖(여기 없다): 자동 문구 채우기(AI) · 캡션 손편집 · 지난 회차 · 일괄 ZIP.

const ENDPOINT = '/api/flow-convert';

interface RowInfo {
  i: number;
  code: string;
  name: string;
  brand: string;
  images: number;
  captions: number;
  options: number;
  adapter: string;
  ok: boolean;
  reason: string;
}

interface ConvertResult {
  code: string;
  name: string;
  adapter: string;
  level: 'ok' | 'no' | 'bad';
  why: string[];
  gate_ok: boolean;
  reason_text: string;
  notes: string[];
  ink: number | null;
  units: number;
  ad: number;
  bytes: number;
  ms: number;
  html: string;
}

const LEVEL_LABEL: Record<ConvertResult['level'], string> = {
  ok: '초록 · 그대로 써도 됩니다',
  no: '노랑 · 한 번 보세요',
  bad: '빨강 · 사람 손이 필요합니다',
};

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.readAsDataURL(file);
  });

const post = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // 변환 함수가 없는 곳(예: 순수 vite 로컬 dev)에서는 HTML 이 돌아온다.
    throw new Error(`변환 서버가 응답하지 않았습니다(HTTP ${res.status}). 이 화면은 Vercel Preview에서 동작합니다.`);
  }
  if (!parsed.ok) throw new Error(String(parsed.error || '알 수 없는 오류'));
  return parsed;
};

export const FlowConverterPanel: React.FC = () => {
  const [fileName, setFileName] = useState('');
  const [xlsx, setXlsx] = useState('');
  const [rows, setRows] = useState<RowInfo[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState<'' | 'list' | 'convert'>('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [htmlUrl, setHtmlUrl] = useState('');
  const urlRef = useRef('');

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const publish = useCallback((html: string) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    urlRef.current = url;
    setHtmlUrl(url);
  }, []);

  const pickFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(''); setRows(null); setPicked(null); setResult(null); setHtmlUrl('');
    setFileName(file.name);
    setBusy('list');
    try {
      const encoded = await toBase64(file);
      setXlsx(encoded);
      const data = await post({ action: 'list', xlsx: encoded });
      const list = (data.rows as RowInfo[]) || [];
      setRows(list);
      if (list.length === 1) setPicked(list[0].i);
    } catch (e) {
      setXlsx('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }, []);

  const convert = useCallback(async () => {
    if (picked === null || !xlsx) return;
    setError(''); setResult(null); setHtmlUrl('');
    setBusy('convert');
    try {
      const data = await post({ action: 'convert', xlsx, row: picked });
      const done = data as unknown as ConvertResult;
      setResult(done);
      publish(done.html);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }, [picked, xlsx, publish]);

  return (
    <div className="fcp">
      <div className="fcp-side">
        <div className="fcp-head">
          <h3 className="fcp-title">단순형 변환기(정본)</h3>
          <p className="fcp-sub">엑셀을 올리고 상품 하나를 골라 변환합니다. 변환 규칙·검수 신호등은 정본 그대로입니다.</p>
        </div>

        <label className="fcp-file">
          <span className="fcp-file-btn">엑셀 선택</span>
          <span className="fcp-file-name">{fileName || '.xlsx 파일'}</span>
          <input type="file" accept=".xlsx" onChange={(e) => void pickFile(e.target.files?.[0])} />
        </label>

        {busy === 'list' && <p className="fcp-msg">엑셀을 읽는 중입니다…</p>}
        {error && <p className="fcp-error">{error}</p>}

        {rows && rows.length === 0 && <p className="fcp-msg">이 엑셀에서 상품을 찾지 못했습니다.</p>}

        {rows && rows.length > 0 && (
          <>
            <p className="fcp-count">상품 {rows.length}개 · 하나를 고르세요</p>
            <div className="fcp-rows">
              {rows.map((r) => (
                <button
                  type="button"
                  key={r.i}
                  className={`fcp-row${picked === r.i ? ' on' : ''}`}
                  onClick={() => setPicked(r.i)}
                >
                  <span className={`fcp-dot ${r.ok ? 'ok' : 'bad'}`} />
                  <span className="fcp-row-body">
                    <span className="fcp-row-name">{r.name || '(이름 없음)'}</span>
                    <span className="fcp-row-meta">
                      {r.code} · {r.adapter} · 이미지 {r.images} · 문구 {r.captions} · 옵션 {r.options}
                    </span>
                    {!r.ok && <span className="fcp-row-why">{r.reason}</span>}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="fcp-go"
              disabled={picked === null || busy === 'convert'}
              onClick={() => void convert()}
            >
              {busy === 'convert' ? '변환하는 중…' : '변환하기'}
            </button>
            <p className="fcp-note">이번 단계는 <b>원문 그대로 변환</b>입니다. 자동 문구 채우기(AI)와 캡션 손편집은 아직 붙지 않았습니다.</p>
          </>
        )}
      </div>

      <div className="fcp-main">
        {!result && <div className="fcp-empty">{busy === 'convert' ? '변환하는 중입니다…' : '변환하면 결과가 여기에 보입니다.'}</div>}
        {result && (
          <>
            <div className="fcp-result">
              <span className={`fcp-badge ${result.level}`}>{LEVEL_LABEL[result.level]}</span>
              <span className="fcp-result-name">{result.name}</span>
              <span className="fcp-result-meta">
                {result.code} · {result.adapter} · 유닛 {result.units} · {(result.bytes / 1048576).toFixed(2)}MB · {result.ms}ms
                {result.ink != null && ` · 잉크 ${(result.ink * 100).toFixed(1)}%`}
              </span>
              {result.why.length > 0 && <span className="fcp-result-why">{result.why.join(' · ')}</span>}
              {result.notes.length > 0 && <span className="fcp-result-note">{result.notes.join(' · ')}</span>}
              <a className="fcp-dl" href={htmlUrl} download={`${result.code || 'detail'}.html`}>HTML 내려받기</a>
            </div>
            {htmlUrl && <iframe className="fcp-preview" src={htmlUrl} title="변환 결과 미리보기" />}
          </>
        )}
      </div>
    </div>
  );
};

export default FlowConverterPanel;

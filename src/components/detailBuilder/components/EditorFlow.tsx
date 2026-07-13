// @ts-nocheck — 변환기 단순형(flow) 에디터. 기존 Editor.tsx와 완전 분리(회귀0).
import React from 'react';
import type { ProductData } from '../types';
import { COLOR_PRESETS } from '../constants';
import { parseMainMallArrayBuffer } from '../services/mainMallExcelParser';
import { getFlowBlocks, imagesToBlocks, newBlockId } from '../services/flowBlocks';
import { extractProductImages } from '../services/flowImageSplitter';
import { toProxyUrl } from '../services/exportImagePrep';
import { imageSignature, signatureDistance, normalizeThumbnail } from '../services/flowThumbnail';
import { rewriteFlowCaptions } from '../services/flowCaptionService';
import { convertBakedToFlow } from '../services/bakedFlowConverter';

const fileToDataUrl = (file: File, cb: (url: string) => void) => {
  const r = new FileReader();
  r.onloadend = () => cb(r.result as string);
  r.readAsDataURL(file);
};

// 이미지 원본 크기(픽셀 접근 아님 → CDN URL도 taint 없이 가능).
const imgSize = (src: string): Promise<{ w: number; h: number } | null> =>
  new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => res(null);
    i.src = src;
  });

// 섬네일 자동 = 원본(메인몰) 섬네일과 '가장 닮은' 깨끗한 상세컷 매칭 → 크기 정규화(bbox+fit).
//   원본섬네일 = 사람이 고른 대표. 그와 닮은 상세컷(브랜딩 없음)을 골라 제품크기 균일하게 앉힘.
//   통이미지는 정밀추출해 서브컷을 후보로. 옵션 다수·후보 없음 → 이슈(수동/배치 이슈리스트).
const THUMB_TALL = 2.5;
const isRemoteUrl = (s: string) => /^https?:\/\//i.test(s) && !s.startsWith('data:');

const autoPickThumbnail = async (
  blocks: any[],
  mallThumbUrl: string,
  hasOptions: boolean,
  optionCount: number,
): Promise<{ image: string; issue: boolean; reason: string }> => {
  // 옵션 2종+ = 옵션마다 제품/패키지 달라 단일 대표 섬네일 자동판단 난해 → 이슈(닛포리류, 어차피 수동)
  if (hasOptions && optionCount >= 2) return { image: '', issue: true, reason: '옵션 다수(수동)' };

  // 후보 수집: 통이미지는 정밀추출한 조각(base64), 아니면 원본 URL
  const cands: string[] = [];
  for (const b of blocks) {
    const sz = await imgSize(b.image);
    if (!sz || !sz.w) continue;
    if (sz.h / sz.w >= THUMB_TALL) {
      try {
        const segs = await extractProductImages(toProxyUrl(b.image));
        segs.forEach((s) => cands.push(s.dataUrl));
      } catch { /* 추출 실패 무시 */ }
    } else {
      cands.push(b.image);
    }
  }
  if (!cands.length) return { image: '', issue: true, reason: '후보 없음' };

  // 원본 섬네일과 가장 닮은 후보 선택(이미지 유사도) — 빠름. (VLM 방식은 로컬에서 분 단위라 폐기)
  let best = '';
  const mallSig = mallThumbUrl ? await imageSignature(toProxyUrl(mallThumbUrl)) : null;
  if (mallSig) {
    let bestDist = Infinity;
    for (const src of cands) {
      const sig = await imageSignature(isRemoteUrl(src) ? toProxyUrl(src) : src);
      if (!sig) continue;
      const d = signatureDistance(mallSig, sig);
      if (d < bestDist) { bestDist = d; best = src; }
    }
  }
  if (!best) best = cands[0]; // 원본섬네일 없거나 매칭 불가 → 첫 후보 폴백

  // 크기 정규화(bbox 트림 + 표준 프레임 fit) — 모든 섬네일 제품크기 균일
  const norm = await normalizeThumbnail(isRemoteUrl(best) ? toProxyUrl(best) : best);
  return { image: norm || best, issue: false, reason: '' };
};

const EditorFlow: React.FC<{ data: ProductData; onChange: (v: React.SetStateAction<ProductData>) => void }> = ({ data, onChange }) => {
  const blocks = getFlowBlocks(data);
  const setField = (k: keyof ProductData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(prev => ({ ...prev, [k]: e.target.value }));

  // 블록(이미지+캡션) 편집 — 항상 flowBlocks에 기록(첫 편집 시 구 flowImages에서 마이그레이션).
  const setBlocks = (updater: (cur: any[]) => any[]) =>
    onChange(prev => ({ ...prev, flowBlocks: updater(getFlowBlocks(prev)) }));
  const [splitting, setSplitting] = React.useState<string | null>(null);

  const [importing, setImporting] = React.useState(false);
  const [importNote, setImportNote] = React.useState<{ ok: boolean; text: string } | null>(null);
  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setImporting(true); setImportNote(null);
    try {
      const buf = await f.arrayBuffer();
      const p = await parseMainMallArrayBuffer(buf);
      if (!p) { setImportNote({ ok: false, text: '엑셀을 읽지 못했습니다(형식 확인).' }); return; }
      // 구조화 페어링: 이미지 + (있으면) 원본 설명 텍스트를 캡션에 프리필 + 옵션 태그. 통이미지는 원본 그대로.
      const baseBlocks = (p.detailBlocks || []).map(b => ({ id: newBlockId(), image: b.image, caption: b.text || '', option: b.option || '' }));
      onChange(prev => ({
        ...prev,
        flowEyebrow: p.eyebrow || prev.flowEyebrow || '',
        productNameKr: p.productNameKr || prev.productNameKr,
        productNameEn: p.productNameEn || prev.productNameEn,
        brandName: p.brandName || prev.brandName,
        flowHeaderText: p.flowHeaderText || prev.flowHeaderText,
        flowImages: p.flowImages.length ? p.flowImages : (prev.flowImages || []),
        flowBlocks: baseBlocks.length ? baseBlocks : (prev.flowBlocks || getFlowBlocks(prev)),
        // 섬네일은 로고 박힌 목록이미지 대신 상세 이미지에서 자동 선택(아래) — 여기선 안 건드림
      }));
      const ex = p.excludedImages.length ? ` · 공통배너 ${p.excludedImages.length}장 제외` : '';
      if (p.flowImages.length === 0) {
        setImportNote({ ok: false, text: `✓ ${p.productNameKr} · ⚠ 제품이미지 0장(수동 추가 필요)${ex}` });
        return;
      }
      const typedCount = (p.detailBlocks || []).filter(b => b.text).length;
      const typeMsg = p.hasTypedText
        ? ` · 닛포리형(원본 설명 ${typedCount}개 프리필)`
        : ' · 통이미지형(설명텍스트 없음 — 필요시 ✂정밀추출)';
      const optMsg = p.hasOptions ? ` · 🔀옵션 ${p.optionValues.length}종(${p.optionName || '타입'})` : '';
      // 섬네일 자동 = 원본섬네일 닮은 상세컷 매칭 → 크기 정규화. 애매하면 이슈(수동/배치 이슈리스트).
      const thumb = await autoPickThumbnail(baseBlocks, p.thumbnailSource, p.hasOptions, p.optionValues.length);
      if (thumb.image) onChange(prev => ({ ...prev, mainImage: thumb.image }));
      const thumbMsg = thumb.image ? ' · 섬네일 자동✓' : ` · ⚠섬네일 이슈(${thumb.reason})`;
      setImportNote({ ok: true, text: `✓ ${p.productNameKr} · 제품이미지 ${p.flowImages.length}장${ex}${typeMsg}${optMsg}${thumbMsg}` });

      // ── 업로드 즉시 자동실행: 분리형=캡션 리라이트 / 통이미지형=통이미지 읽기(둘 다 리라이트+##강조## 포함) ──
      const autoCtx = { productNameKr: p.productNameKr, brandName: p.brandName, flowHeaderText: p.flowHeaderText, introText: p.flowHeaderText };
      try {
        if (p.hasTypedText) {
          const withText = baseBlocks.filter((b: any) => (b.caption || '').trim());
          if (withText.length) {
            setCaptioning({ done: 0, total: withText.length });
            const filled = await rewriteFlowCaptions(autoCtx as any, baseBlocks, (pr) => setCaptioning(pr));
            onChange(prev => ({ ...prev, flowBlocks: filled }));
            setCaptioning(null);
            setImportNote({ ok: true, text: `✓ ${p.productNameKr} · 분리형 자동 리라이트 완료` });
          }
        } else {
          setBaking({ phase: '통이미지 자동 읽기 시작' });
          const res = await convertBakedToFlow(p.flowImages, autoCtx, (pr) => setBaking(pr));
          onChange(prev => ({ ...prev, flowBlocks: res.flowBlocks }));
          setBaking(null);
          setImportNote({ ok: true, text: `✓ ${p.productNameKr} · 통이미지 자동 변환 완료 (블록 ${res.flowBlocks.length}개)` });
        }
      } catch (autoErr: any) {
        setCaptioning(null); setBaking(null);
        setImportNote({ ok: false, text: '자동 AI 처리 실패: ' + (autoErr?.message || String(autoErr)) + ' (구조는 남음 · 버튼으로 재시도 가능)' });
      }
    } catch (err: any) {
      setImportNote({ ok: false, text: '오류: ' + (err?.message || String(err)) });
    } finally { setImporting(false); }
  };

  const addImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(files.map(f => new Promise<string>(res => fileToDataUrl(f, res)))).then(urls => {
      setBlocks(cur => [...cur, ...imagesToBlocks(urls)]);
    });
    e.target.value = '';
  };
  const removeBlock = (id: string) => setBlocks(cur => cur.filter(b => b.id !== id));
  const moveBlock = (i: number, dir: number) => setBlocks(cur => {
    const arr = [...cur]; const j = i + dir;
    if (j < 0 || j >= arr.length) return cur;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return arr;
  });
  const setCaption = (id: string, caption: string) => setBlocks(cur => cur.map(b => b.id === id ? { ...b, caption } : b));

  // 통이미지 읽기: baked 통이미지형(설명이 픽셀에 박힘)을 Claude가 분할·읽어 flowBlocks 생성(=분리형과 동일해짐).
  const [baking, setBaking] = React.useState<{ phase: string } | null>(null);
  const runBaked = async () => {
    if (baking) return;
    const urls: string[] = (data.flowImages || []).filter((u: any) => typeof u === 'string' && u);
    if (!urls.length) { alert('통이미지가 없습니다. 먼저 엑셀을 불러와 주세요.'); return; }
    setBaking({ phase: '시작' });
    try {
      const res = await convertBakedToFlow(
        urls,
        { productNameKr: data.productNameKr, brandName: data.brandName, introText: data.flowHeaderText },
        (p) => setBaking(p),
      );
      onChange(prev => ({ ...prev, flowBlocks: res.flowBlocks }));
      if (res.notes?.length) console.log('[통이미지 읽기]', res.notes);
    } catch (err: any) {
      alert('통이미지 읽기 실패: ' + (err?.message || String(err)));
    } finally {
      setBaking(null);
    }
  };

  // AI 리라이트: 원본 설명을 '분량·팩트 유지, 표현만 변주'로 다시 씀(변환기 Claude 배치).
  const [captioning, setCaptioning] = React.useState<{ done: number; total: number } | null>(null);
  const runRewrite = async () => {
    if (captioning) return;
    const cur = blocks;
    const withText = cur.filter(b => (b.caption || '').trim()).length;
    if (!withText) { alert('리라이트할 원본 설명이 없습니다.\n(원본 설명이 있는 상품에서 동작 — 통이미지형은 캡션 생성 예정)'); return; }
    setCaptioning({ done: 0, total: withText });
    try {
      const filled = await rewriteFlowCaptions(data, cur, (p) => setCaptioning({ done: p.done, total: p.total }));
      onChange(prev => ({ ...prev, flowBlocks: filled }));
    } catch (err: any) {
      alert('AI 리라이트 실패: ' + (err?.message || String(err)));
    } finally {
      setCaptioning(null);
    }
  };

  // 정밀추출: 통이미지 1장 → 깨끗한 제품 사진들만 추출(캡션·금선 버림)해 블록으로 치환.
  const splitBlock = async (id: string) => {
    if (splitting) return;
    const target = blocks.find(b => b.id === id);
    if (!target) return;
    setSplitting(id);
    try {
      // CDN URL이면 same-origin 프록시로 로드(캔버스 taint 회피). 이미 base64면 그대로.
      const segs = await extractProductImages(toProxyUrl(target.image));
      if (segs.length <= 1) { alert('추출할 제품 사진이 여럿 나오지 않았습니다 (단일 사진이거나 경계가 불명확).'); return; }
      const parts = segs.map(s => ({ id: newBlockId(), image: s.dataUrl, caption: '' }));
      setBlocks(cur => cur.flatMap(b => b.id === id ? parts : [b]));
    } catch (err: any) {
      alert('정밀추출 실패: ' + (err?.message || String(err)));
    } finally {
      setSplitting(null);
    }
  };
  const setThumb = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f, url => onChange(prev => ({ ...prev, mainImage: url }))); e.target.value = ''; };
  const setPackage = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f, url => onChange(prev => ({ ...prev, packageImage: url, isPackageImageEnabled: true }))); e.target.value = ''; };
  const removePackage = () => onChange(prev => ({ ...prev, packageImage: null }));
  const setWatermark = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f, url => onChange(prev => ({ ...prev, watermarkImage: url }))); e.target.value = ''; };

  const addOption = () => onChange(prev => ({ ...prev, options: [...prev.options, { id: Date.now().toString(), name: '', image: null, x: 0, y: 0, width: 320, height: 400 }] }));
  const removeOption = (id: string) => onChange(prev => ({ ...prev, options: prev.options.filter(o => o.id !== id) }));
  const setOptName = (id: string, name: string) => onChange(prev => ({ ...prev, options: prev.options.map(o => o.id === id ? { ...o, name } : o) }));
  const setOptImg = (id: string, e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f, url => onChange(prev => ({ ...prev, options: prev.options.map(o => o.id === id ? { ...o, image: url } : o) }))); e.target.value = ''; };

  return (
    <div className="p-6 pb-32 space-y-8">
      <div className="rounded-lg bg-emerald-900/20 border border-emerald-500/30 p-3 text-xs text-emerald-300 leading-relaxed">
        🔄 <b>단순형 변환기</b> — 상단 텍스트 + 통이미지 세로 스택. 본문엔 메인이미지 영역이 없고, 섬네일용 이미지만 별도로 넣습니다. (기존 고도몰 생성기와 무관)
      </div>

      {/* 메인몰 엑셀 자동 프리필 */}
      <div className="rounded-lg bg-sky-900/20 border border-sky-500/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-sky-300">📥 메인몰 엑셀에서 자동 불러오기</span>
          <label className={`text-xs px-3 py-1.5 rounded cursor-pointer font-bold transition-colors ${importing ? 'bg-sky-800/50 text-sky-400' : 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'}`}>
            {importing ? '불러오는 중…' : '엑셀 선택(.xlsx)'}
            <input type="file" accept=".xlsx" className="sr-only" onChange={importExcel} disabled={importing} />
          </label>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">상품명·브랜드·상단문구·통이미지·섬네일을 자동 채웁니다. (제품이미지 <code className="text-sky-300">goodsm</code>만 추림 · 공통배너 제외 · 이미지는 CDN URL로 표시)</p>
        {importNote && <p className={`text-[11px] font-bold ${importNote.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{importNote.text}</p>}
        {/* 통이미지형(설명이 픽셀에 박힘) 전용 — Claude가 분할·읽어 사진+설명 쌍으로 분리 */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
          <span className="text-[11px] text-violet-300 leading-relaxed">🔍 <b>통이미지형</b>(설명이 이미지에 박힌 상품): Claude가 찢어 읽어 <b>사진+설명</b>으로 분리 → 그다음 🤖 AI 리라이트.</span>
          <button type="button" onClick={runBaked} disabled={!!baking}
            className={`text-xs px-3 py-1.5 rounded font-bold whitespace-nowrap transition-colors ${baking ? 'bg-violet-800/50 text-violet-400' : 'bg-violet-500/20 text-violet-200 hover:bg-violet-500/30'}`}>
            {baking ? (baking.phase || '읽는 중…') : '통이미지 읽기'}
          </button>
        </div>
      </div>

      {/* 기본 */}
      <section className="space-y-4">
        <h2 className="text-lg font-black text-white border-b border-white/10 pb-2 font-mono">📂 기본</h2>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-2">컬러 테마</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_PRESETS.slice(0, 14).map(p => (
              <button key={p.value} onClick={() => onChange(prev => ({ ...prev, themeColor: p.value }))} title={(p as any).label || p.value}
                className={`w-7 h-7 rounded-full border-2 transition-all ${data.themeColor === p.value ? 'border-gray-400 scale-110' : 'border-transparent hover:scale-105'}`} style={{ background: p.value }} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">태그 (선택 · 상품명 앞 <code className="text-sky-300">[대괄호]</code>)</label>
          <input className="w-full p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-[#22C55E]" value={data.flowEyebrow || ''} onChange={setField('flowEyebrow')} placeholder="예: 일본 직수입" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">상품명 (한글) · Enter 줄바꿈</label>
          <textarea rows={2} className="w-full p-3 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#22C55E] resize-y" value={data.productNameKr} onChange={setField('productNameKr')} placeholder="예: 하루히 모카의 타액 로션 80ml" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">영문/일본어 상품명 (선택 · 괄호 없이)</label>
          <input className="w-full p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-[#22C55E]" value={data.productNameEn} onChange={setField('productNameEn')} placeholder="예: 萌あなトリニティ" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">브랜드 (선택)</label>
          <input className="w-full p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-[#22C55E]" value={data.brandName} onChange={setField('brandName')} placeholder="예: 라이드재팬" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">상단 텍스트</label>
          <textarea rows={4} className="w-full p-3 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded-lg text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[#22C55E] resize-y" value={data.flowHeaderText || ''} onChange={setField('flowHeaderText')} placeholder="상세페이지 최상단 소개 문구 (원본 단순 텍스트)" />
        </div>
      </section>

      {/* 이미지+캡션 블록 */}
      <section className="space-y-3">
        <div className="flex justify-between items-center border-b border-white/10 pb-2 gap-2">
          <h2 className="text-lg font-black text-white font-mono">🖼️ 이미지 + 캡션 블록</h2>
          <div className="flex items-center gap-2">
            <button onClick={runRewrite} disabled={!!captioning || blocks.length === 0}
              className="text-xs font-bold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 px-3 py-1.5 rounded transition-colors">
              {captioning ? `AI 리라이트 중… ${captioning.done}/${captioning.total}` : '🤖 AI 리라이트'}
            </button>
            <label className="text-xs bg-white/10 text-slate-300 px-3 py-1.5 rounded cursor-pointer hover:bg-white/20 transition-colors">+ 이미지 추가
              <input type="file" accept="image/*" multiple className="sr-only" onChange={addImages} />
            </label>
          </div>
        </div>
        {captioning && <p className="text-[11px] text-emerald-400 font-bold">🤖 원본 설명을 리라이트하는 중… ({captioning.done}/{captioning.total}) · 팩트 유지·표현만 변주(text-only 배치).</p>}
        {blocks.length === 0
          ? <p className="text-xs text-slate-500">위→아래 순서로 쌓입니다. 통이미지 1장은 <b className="text-sky-300">✂ 정밀추출</b>로 깨끗한 제품 사진만 뽑을 수 있어요.</p>
          : <p className="text-[11px] text-slate-500">각 블록 = 이미지 + 그 아래 캡션(SEO 문구). 세로로 긴 <b className="text-sky-300">통이미지</b>는 <b className="text-sky-300">✂ 정밀추출</b> → 제품 사진만 뽑고 <b className="text-slate-400">원본 캡션·구분선은 버림</b>. 캡션은 자동생성/수동입력.</p>}
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <React.Fragment key={b.id}>
              {/* 옵션 그룹 헤더 — 옵션이 바뀌는 지점에만 표시 */}
              {(b.option || '') !== (blocks[i - 1]?.option || '') && (b.option || '').trim() && (
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-[11px] font-black text-fuchsia-300 bg-fuchsia-500/15 px-2 py-0.5 rounded">🔀 {b.option}</span>
                  <div className="flex-1 h-px bg-fuchsia-500/20" />
                </div>
              )}
              <div className="bg-[#0F172A]/50 border border-white/10 rounded p-2 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-slate-500 w-5 text-center pt-1">{i + 1}</span>
                  <img src={b.image} className="w-16 h-16 object-cover rounded border border-white/10 bg-white flex-shrink-0" alt={`block-${i}`} />
                <div className="flex-1 min-w-0">
                  <textarea
                    rows={2}
                    value={b.caption || ''}
                    onChange={(e) => setCaption(b.id, e.target.value)}
                    placeholder="캡션(이미지 아래 SEO 문구) · 나중에 AI가 채움"
                    className="w-full p-2 bg-[#0F172A]/60 border border-white/10 rounded text-xs text-slate-200 outline-none focus:ring-1 focus:ring-[#22C55E] resize-y leading-relaxed"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => splitBlock(b.id)} disabled={!!splitting}
                  className="text-[11px] font-bold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-40 px-2 py-1 rounded transition-colors">
                  {splitting === b.id ? '추출 중…' : '✂ 정밀추출'}
                </button>
                <div className="flex-1" />
                <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="text-slate-400 disabled:opacity-30 px-1.5 text-lg leading-none">↑</button>
                <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="text-slate-400 disabled:opacity-30 px-1.5 text-lg leading-none">↓</button>
                <button onClick={() => removeBlock(b.id)} className="text-red-400 text-xs font-bold px-2 hover:text-red-600">삭제</button>
              </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* 섬네일 소스 · 패키지 · 워터마크 */}
      <section className="space-y-3">
        <h2 className="text-lg font-black text-white border-b border-white/10 pb-2 font-mono">🏷️ 섬네일 소스 · 패키지 · 워터마크</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">섬네일 소스(메인이미지) {!data.mainImage && blocks.length > 0 && <span className="text-amber-400">⚠ 이슈·수동</span>}</label>
            <label className="relative block w-full h-28 bg-[#0F172A]/50 border-2 border-dashed border-white/10 rounded-lg overflow-hidden cursor-pointer hover:border-white/20">
              {data.mainImage ? <img src={data.mainImage} className="w-full h-full object-contain bg-white" alt="thumb-src" /> : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs text-center px-2">자동 이슈 — 수동 업로드</div>}
              <input type="file" accept="image/*" className="sr-only" onChange={setThumb} />
            </label>
            <p className="text-[10px] text-slate-500 mt-1">상세컷에서 자동 선택→섬네일 4종 자동생성. 애매하면 이슈(수동 업로드).</p>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-slate-500">패키지 (섬네일에 표시)</label>
              {data.packageImage && <button onClick={removePackage} className="text-[10px] text-red-400 font-bold hover:text-red-600 underline">삭제</button>}
            </div>
            <label className="relative block w-full h-28 bg-[#0F172A]/50 border-2 border-dashed border-amber-500/30 rounded-lg overflow-hidden cursor-pointer hover:border-amber-400/50">
              {data.packageImage ? <img src={data.packageImage} className="w-full h-full object-contain bg-white" alt="package" /> : <div className="absolute inset-0 flex items-center justify-center text-amber-400/80 text-xs text-center px-2">+ 패키지 이미지</div>}
              <input type="file" accept="image/*" className="sr-only" onChange={setPackage} />
            </label>
            <p className="text-[10px] text-slate-500 mt-1">섬네일에 오버레이로 표시(우하단). 미리보기 섬네일에서 위치·크기 드래그.</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">워터마크 (선택)</label>
            <div className="flex gap-3 items-start">
              <label className="relative block w-28 h-28 flex-shrink-0 bg-[#0F172A]/50 border-2 border-dashed border-purple-500/30 rounded-lg overflow-hidden cursor-pointer">
                {data.watermarkImage ? <img src={data.watermarkImage} className="w-full h-full object-contain" alt="wm" /> : <div className="absolute inset-0 flex items-center justify-center text-purple-400 text-xs">+ PNG</div>}
                <input type="file" accept="image/*" className="sr-only" onChange={setWatermark} />
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed flex-1">상단 <b className="text-slate-400">'모든 워터마크 켜기'</b> 후 미리보기 통이미지 위에서 위치·크기 조절. (메인몰 워터마크 덮어쓰기용 · 나중 자동변환에서 자동 배치)</p>
            </div>
          </div>
        </div>
      </section>

      {/* 옵션 (타입5) */}
      <section className="space-y-3">
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
          <h2 className="text-md font-bold text-white font-mono">✨ 옵션 (선택 · 타입5)</h2>
          <button onClick={addOption} className="text-xs bg-white/10 text-slate-300 px-3 py-1.5 rounded hover:bg-white/20">+ 추가</button>
        </div>
        {data.options.map((opt, i) => (
          <div key={opt.id} className="bg-[#0F172A]/50 p-3 rounded border border-white/10 space-y-2">
            <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-400">옵션 {i + 1}</span><button onClick={() => removeOption(opt.id)} className="text-red-400 text-xs hover:text-red-600">삭제</button></div>
            <input value={opt.name} onChange={(e) => setOptName(opt.id, e.target.value)} placeholder="옵션명" className="w-full p-2 bg-[#0F172A]/60 border border-white/10 rounded text-sm text-slate-200 outline-none focus:ring-1 focus:ring-[#22C55E]" />
            <div className="flex items-center gap-2">
              <div className="w-14 h-14 rounded overflow-hidden border border-white/10 bg-white flex-shrink-0">{opt.image ? <img src={opt.image} className="w-full h-full object-cover" alt="opt" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">패키지</div>}</div>
              <input type="file" accept="image/*" className="text-xs text-slate-400" onChange={(e) => setOptImg(opt.id, e)} />
            </div>
          </div>
        ))}
        <p className="text-[10px] text-slate-500">옵션별 패키지 이미지 → 고도몰 옵션 등록 이미지로 사용.</p>
      </section>
    </div>
  );
};

export default EditorFlow;

// @ts-nocheck — 변환기 단순형(flow) 에디터. 기존 Editor.tsx와 완전 분리(회귀0).
import React from 'react';
import type { ProductData } from '../types';
import { COLOR_PRESETS } from '../constants';
import { parseMainMallArrayBuffer } from '../services/mainMallExcelParser';
import { getFlowBlocks, imagesToBlocks, newBlockId } from '../services/flowBlocks';
import { splitImageByWhitespace } from '../services/flowImageSplitter';
import { toProxyUrl } from '../services/exportImagePrep';

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

// 자동분할(변환기 기본 동작): 세로로 충분히 긴(=통이미지) 블록만 여백 기준으로 조각냄.
// 개별 제품사진(가로세로비 낮음)은 건드리지 않아 URL 그대로(저장 경량 유지) · CDN은 서버 base64 후 분할.
const TALL_RATIO = 2.5; // 높이/너비 이 값 이상이면 '통이미지'로 보고 자동분할 시도
const autoSplitBlocks = async (blocks: any[]): Promise<any[]> => {
  const out: any[] = [];
  for (const b of blocks) {
    let didSplit = false;
    try {
      const sz = await imgSize(b.image);
      if (sz && sz.w > 0 && sz.h / sz.w >= TALL_RATIO) {
        // CDN URL은 same-origin 프록시로 로드 → 캔버스 taint 없이 픽셀 분할. (dev엔 서버 없어 로드 실패 → 원본 유지)
        const segs = await splitImageByWhitespace(toProxyUrl(b.image));
        if (segs.length > 1) {
          segs.forEach((s) => out.push({ id: newBlockId(), image: s.dataUrl, caption: '' }));
          didSplit = true;
        }
      }
    } catch { /* 실패 시 원본 유지 */ }
    if (!didSplit) out.push(b);
  }
  return out;
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
      const baseBlocks = imagesToBlocks(p.flowImages);
      // 1) 필드 + 초기 블록 즉시 반영(화면에 바로 뜸)
      onChange(prev => ({
        ...prev,
        flowEyebrow: p.eyebrow || prev.flowEyebrow || '',
        productNameKr: p.productNameKr || prev.productNameKr,
        productNameEn: p.productNameEn || prev.productNameEn,
        brandName: p.brandName || prev.brandName,
        flowHeaderText: p.flowHeaderText || prev.flowHeaderText,
        // 신모델: 이미지 → 캡션 빈 블록. 구 flowImages도 함께 유지(호환).
        flowImages: p.flowImages.length ? p.flowImages : (prev.flowImages || []),
        flowBlocks: p.flowImages.length ? baseBlocks : (prev.flowBlocks || getFlowBlocks(prev)),
        mainImage: p.thumbnailSource || prev.mainImage,
      }));
      const ex = p.excludedImages.length ? ` · 공통배너 ${p.excludedImages.length}장 제외` : '';
      if (p.flowImages.length === 0) {
        setImportNote({ ok: false, text: `✓ ${p.productNameKr} · ⚠ 제품이미지 0장(수동 추가 필요)${ex}` });
        return;
      }
      // 2) 자동분할(기본 동작) — 통이미지를 여백 기준으로 조각냄. 버튼 안 눌러도 됨.
      setImportNote({ ok: true, text: `✓ ${p.productNameKr} · 통이미지 ${p.flowImages.length}장${ex} · 자동분할 중…` });
      const split = await autoSplitBlocks(baseBlocks);
      onChange(prev => ({ ...prev, flowBlocks: split }));
      const grew = split.length > baseBlocks.length;
      setImportNote({ ok: true, text: `✓ ${p.productNameKr} · 통이미지 ${p.flowImages.length}장${ex} · ${grew ? `자동분할 → ${split.length}조각` : '분할 여백 없음(원본 유지)'}` });
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

  // 자동분할: 통이미지 1장 → 여백 감지로 여러 조각 블록으로 치환. CDN URL이면 먼저 base64 변환(서버).
  const splitBlock = async (id: string) => {
    if (splitting) return;
    const target = blocks.find(b => b.id === id);
    if (!target) return;
    setSplitting(id);
    try {
      // CDN URL이면 same-origin 프록시로 로드(캔버스 taint 회피). 이미 base64면 그대로.
      const segs = await splitImageByWhitespace(toProxyUrl(target.image));
      if (segs.length <= 1) { alert('분할할 여백을 찾지 못했습니다 (이미 한 조각이거나 여백이 없음).'); return; }
      const parts = segs.map(s => ({ id: newBlockId(), image: s.dataUrl, caption: '' }));
      setBlocks(cur => cur.flatMap(b => b.id === id ? parts : [b]));
    } catch (err: any) {
      alert('자동분할 실패: ' + (err?.message || String(err)));
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
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
          <h2 className="text-lg font-black text-white font-mono">🖼️ 이미지 + 캡션 블록</h2>
          <label className="text-xs bg-white/10 text-slate-300 px-3 py-1.5 rounded cursor-pointer hover:bg-white/20 transition-colors">+ 이미지 추가
            <input type="file" accept="image/*" multiple className="sr-only" onChange={addImages} />
          </label>
        </div>
        {blocks.length === 0
          ? <p className="text-xs text-slate-500">위→아래 순서로 쌓입니다. 통이미지 1장은 <b className="text-sky-300">✂ 자동분할</b>로 섹션별로 나눌 수 있어요.</p>
          : <p className="text-[11px] text-slate-500">각 블록 = 이미지 + 그 아래 캡션(SEO 문구). 세로로 긴 <b className="text-sky-300">통이미지</b>는 <b className="text-sky-300">✂ 자동분할</b> → 여백 기준으로 조각냄. 캡션은 나중에 AI가 채웁니다.</p>}
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <div key={b.id} className="bg-[#0F172A]/50 border border-white/10 rounded p-2 space-y-2">
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
                  {splitting === b.id ? '분할 중…' : '✂ 자동분할'}
                </button>
                <div className="flex-1" />
                <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="text-slate-400 disabled:opacity-30 px-1.5 text-lg leading-none">↑</button>
                <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="text-slate-400 disabled:opacity-30 px-1.5 text-lg leading-none">↓</button>
                <button onClick={() => removeBlock(b.id)} className="text-red-400 text-xs font-bold px-2 hover:text-red-600">삭제</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 섬네일 소스 · 패키지 · 워터마크 */}
      <section className="space-y-3">
        <h2 className="text-lg font-black text-white border-b border-white/10 pb-2 font-mono">🏷️ 섬네일 소스 · 패키지 · 워터마크</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">섬네일 소스 이미지</label>
            <label className="relative block w-full h-28 bg-[#0F172A]/50 border-2 border-dashed border-white/10 rounded-lg overflow-hidden cursor-pointer hover:border-white/20">
              {data.mainImage ? <img src={data.mainImage} className="w-full h-full object-contain bg-white" alt="thumb-src" /> : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">+ 업로드</div>}
              <input type="file" accept="image/*" className="sr-only" onChange={setThumb} />
            </label>
            <p className="text-[10px] text-slate-500 mt-1">본문엔 안 나오고 섬네일 4종 자동생성에만 쓰임</p>
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

// @ts-nocheck — 변환기 단순형(flow) 에디터. 기존 Editor.tsx와 완전 분리(회귀0).
import React from 'react';
import type { ProductData } from '../types';
import { COLOR_PRESETS } from '../constants';
import { parseMainMallArrayBuffer } from '../services/mainMallExcelParser';

const fileToDataUrl = (file: File, cb: (url: string) => void) => {
  const r = new FileReader();
  r.onloadend = () => cb(r.result as string);
  r.readAsDataURL(file);
};

const EditorFlow: React.FC<{ data: ProductData; onChange: (v: React.SetStateAction<ProductData>) => void }> = ({ data, onChange }) => {
  const images = Array.isArray(data.flowImages) ? data.flowImages : [];
  const setField = (k: keyof ProductData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(prev => ({ ...prev, [k]: e.target.value }));

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
      onChange(prev => ({
        ...prev,
        flowEyebrow: p.eyebrow || prev.flowEyebrow || '',
        productNameKr: p.productNameKr || prev.productNameKr,
        productNameEn: p.productNameEn || prev.productNameEn,
        brandName: p.brandName || prev.brandName,
        flowHeaderText: p.flowHeaderText || prev.flowHeaderText,
        flowImages: p.flowImages.length ? p.flowImages : (prev.flowImages || []),
        mainImage: p.thumbnailSource || prev.mainImage,
      }));
      const warn = p.flowImages.length === 0 ? ' — ⚠ 제품이미지 0장(수동 추가 필요)' : '';
      const ex = p.excludedImages.length ? ` · 공통배너 ${p.excludedImages.length}장 제외` : '';
      setImportNote({ ok: p.flowImages.length > 0, text: `✓ ${p.productNameKr} · 통이미지 ${p.flowImages.length}장${ex}${warn}` });
    } catch (err: any) {
      setImportNote({ ok: false, text: '오류: ' + (err?.message || String(err)) });
    } finally { setImporting(false); }
  };

  const addImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(files.map(f => new Promise<string>(res => fileToDataUrl(f, res)))).then(urls => {
      onChange(prev => ({ ...prev, flowImages: [...(prev.flowImages || []), ...urls] }));
    });
    e.target.value = '';
  };
  const removeImage = (i: number) => onChange(prev => ({ ...prev, flowImages: (prev.flowImages || []).filter((_, idx) => idx !== i) }));
  const moveImage = (i: number, dir: number) => onChange(prev => {
    const arr = [...(prev.flowImages || [])]; const j = i + dir;
    if (j < 0 || j >= arr.length) return prev;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...prev, flowImages: arr };
  });
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

      {/* 통이미지 스택 */}
      <section className="space-y-3">
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
          <h2 className="text-lg font-black text-white font-mono">🖼️ 통이미지 스택</h2>
          <label className="text-xs bg-white/10 text-slate-300 px-3 py-1.5 rounded cursor-pointer hover:bg-white/20 transition-colors">+ 이미지 추가
            <input type="file" accept="image/*" multiple className="sr-only" onChange={addImages} />
          </label>
        </div>
        {images.length === 0 && <p className="text-xs text-slate-500">위→아래 순서로 쌓입니다. 여러 장 한 번에 선택 가능.</p>}
        <div className="space-y-2">
          {images.map((src, i) => (
            <div key={i} className="flex items-center gap-2 bg-[#0F172A]/50 border border-white/10 rounded p-2">
              <span className="text-xs text-slate-500 w-5 text-center">{i + 1}</span>
              <img src={src} className="w-14 h-14 object-cover rounded border border-white/10 bg-white" alt={`stack-${i}`} />
              <div className="flex-1" />
              <button onClick={() => moveImage(i, -1)} disabled={i === 0} className="text-slate-400 disabled:opacity-30 px-1.5 text-lg leading-none">↑</button>
              <button onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} className="text-slate-400 disabled:opacity-30 px-1.5 text-lg leading-none">↓</button>
              <button onClick={() => removeImage(i)} className="text-red-400 text-xs font-bold px-2 hover:text-red-600">삭제</button>
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

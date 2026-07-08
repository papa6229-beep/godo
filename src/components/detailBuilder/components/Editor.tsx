// @ts-nocheck — 이식된 상세페이지 생성기(벤더 코드): GODO 엄격 TS/lint 면제. 로직 수정 최소화.
import React from 'react';
import type { ProductData, OptionItem } from '../types';
import { COLOR_PRESETS } from '../constants';

// =============================================================================
// ✅ 컴포넌트들을 Editor 함수 밖으로 꺼냈습니다 (입력 끊김 해결의 핵심!)
// =============================================================================

// 1. 공통 이미지 업로더
const ImageUploader = React.memo(({ 
  label, value, subLabel, isSmall = false, targetId, onDelete, onChange, onApplyWatermark, isWatermarkOn 
}: { 
  label: string, value: string | null, subLabel?: string, isSmall?: boolean, targetId?: string, onDelete?: () => void, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, onApplyWatermark?: () => void, isWatermarkOn?: boolean 
}) => {
  const hasImage = value && value !== '__ENABLED__';
  
  const scrollToPreview = () => {
    if (targetId) {
      const element = document.getElementById(targetId);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="mb-4" onClick={scrollToPreview}>
      {/* 1. 상단 라벨 및 삭제 버튼 영역 */}
      <div className="flex justify-between items-end mb-1">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide cursor-default">
              {label} <span className="text-slate-500 font-normal">{subLabel}</span>
          </label>
          {onDelete && value && (
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                className="text-[10px] text-red-400 font-bold hover:text-red-600 underline focus:outline-none focus:text-red-600"
                aria-label={`${label} 삭제`}
              >
                삭제
              </button>
          )}
      </div>

      {/* 2. 업로드 영역 (Label로 감싸서 클릭 시 파일 선택창 자동 활성화) */}
      <label 
        className={`relative block w-full ${isSmall ? 'h-32' : 'aspect-video'} bg-[#0F172A]/50 border-2 border-dashed border-white/10 rounded-lg overflow-hidden hover:border-white/20 transition-all duration-200 ease-out group cursor-pointer focus-within:ring-2 focus-within:ring-[#22C55E] focus-within:border-transparent shadow-[var(--shadow-lg)] hover:shadow-[var(--shadow-xl)]`}
      >
        {hasImage ? (
          <img src={value} alt={label} className="w-full h-full object-contain bg-white" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <span className="text-2xl mb-1" aria-hidden="true">+</span>
            <span className="text-[10px] font-bold">UPLOAD</span>
          </div>
        )}
        
        {/* 접근성을 위한 숨김 처리 (sr-only: 시각적으로만 숨김) */}
        <input 
            type="file" 
            accept="image/*" 
            className="sr-only" 
            onChange={onChange} 
            onClick={(e) => (e.currentTarget.value = '')} 
        />
      </label>
      
      {/* 이미지 편집 및 워터마크 버튼 */}
      <div className="mt-2 flex justify-end gap-2">
        {onApplyWatermark && hasImage && (
            <button 
                onClick={(e) => { e.stopPropagation(); onApplyWatermark(); }}
                className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 transition-all duration-200 ease-out ${isWatermarkOn ? 'bg-purple-900/40 text-purple-400 font-bold' : 'bg-white/5 text-slate-400 hover:text-purple-400'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                {isWatermarkOn ? '워터마크 ON' : '워터마크 OFF'}
            </button>
        )}

        <a 
            href="https://new.express.adobe.com/" 
            target="_blank" 
            rel="noreferrer"
            className="text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-xs font-bold px-4 py-2 rounded-full inline-flex items-center gap-1.5 transition-all duration-200 ease-out shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)] transform hover:-translate-y-0.5 focus:ring-2 focus:ring-violet-300 focus:outline-none"
            onClick={(e) => e.stopPropagation()} 
        >
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Adobe로 이미지 편집
        </a>
      </div>
    </div>
  );
});

// 2. 공통 텍스트 에디터 (memo 적용으로 성능 최적화)
const Textarea = React.memo(({ 
  label, value, placeholder, rows = 3, targetId, onDelete, onChange 
}: { 
  label: string, value: string, placeholder: string, rows?: number, targetId?: string, onDelete?: () => void, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void 
}) => {
  
  const handleFocus = () => {
    if (targetId) {
      const element = document.getElementById(targetId);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="mb-5" onFocus={handleFocus}>
      <div className="flex justify-between items-end mb-2">
          <label className="block text-xs font-bold text-slate-500">{label}</label>
          {onDelete && value && <button onClick={onDelete} className="text-[10px] text-red-400 font-bold hover:text-red-600 underline">삭제</button>}
      </div>
      <textarea
        className="w-full p-3 bg-[#0F172A]/50 border border-white/10 rounded-lg text-sm leading-relaxed text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-[#22C55E] outline-none transition-all duration-200 ease-out shadow-[var(--shadow-sm)] focus:shadow-[var(--shadow-md)] resize-y"
        value={value === '__ENABLED__' ? '' : value || ''}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
});

// =============================================================================
// 메인 Editor 컴포넌트
// =============================================================================

interface EditorProps {
  data: ProductData;
  onChange: (value: React.SetStateAction<ProductData>) => void;
  onGenerateAI: () => void;
  isLoading: boolean;
  layoutMode?: 'bananamall' | 'godo';
}

const Editor: React.FC<EditorProps> = ({ data, onChange, onGenerateAI, isLoading, layoutMode = 'bananamall' }) => {
  const isGodo = layoutMode === 'godo';

  // --- 핸들러 함수들 ---
  
  // 스크롤 이동
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // 상품명은 상세페이지 최상단 → 미리보기 스크롤 컨테이너를 맨 위(0)로 보낸다.
    // scrollIntoView(start)는 컨테이너 p-8 패딩만큼(≈32px) 불필요하게 스크롤돼,
    // 이미 맨 위인 디폴트 상태에서도 미리보기가 살짝 움직이는 문제가 있음.
    // top으로 보내면 이미 맨 위면 그대로, 아래면 맨 위로 올라온다.
    if (id === 'preview-top') {
      // 실제 스크롤 컨테이너(overflow auto/scroll + 넘침)를 찾아 맨 위로.
      let sc: HTMLElement | null = el.parentElement;
      while (sc) {
        const oy = getComputedStyle(sc).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight) break;
        sc = sc.parentElement;
      }
      if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // 텍스트 변경
  const handleTextChange = (key: keyof ProductData) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    onChange(prev => ({ ...prev, [key]: e.target.value }));
  };

  // 스펙 변경
  const handleSummaryChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(prev => ({
        ...prev,
        summaryInfo: { ...prev.summaryInfo, [key]: e.target.value }
    }));
  };

  // [고도몰] KEY FEATURE 3블록 변경 (idx 0~2, sub: 'title' | 'desc')
  const handleKeyFeatureChange = (idx: number, sub: 'title' | 'desc') => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const val = e.target.value;
    onChange(prev => {
      const base = (prev.keyFeatures && prev.keyFeatures.length === 3)
        ? prev.keyFeatures
        : [{ title: '', desc: '' }, { title: '', desc: '' }, { title: '', desc: '' }];
      const kf = base.map((item, i) => i === idx ? { ...item, [sub]: val } : item);
      return { ...prev, keyFeatures: kf };
    });
  };

  // 이미지 업로드
  const handleImageChange = (key: keyof ProductData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => onChange(prev => ({ ...prev, [key]: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  // 워터마크 적용 (토글 방식)
  const applyWatermark = (targetKey: keyof ProductData) => {
    if (!data.watermarkImage) {
        alert('먼저 워터마크 이미지를 등록해주세요 (메인 이미지 섹션 상단)');
        return;
    }

    const currentSetting = data.watermarkSettings?.[targetKey];
    const isShown = currentSetting?.show;

    // 토글 처리
    onChange(prev => ({
        ...prev,
        watermarkSettings: {
            ...prev.watermarkSettings,
            [targetKey]: {
                x: 0, y: 0, width: 100, height: 100, // 초기값 (Preview에서 자동 중앙 정렬됨)
                ...(currentSetting || {}),
                show: !isShown
            }
        }
    }));
  };

  // 컬러 변경
  const handleColorChange = (color: string) => {
    onChange(prev => ({ ...prev, themeColor: color }));
  };

  // 서브 포인트 제어 (활성화/삭제)
  const enableSlot = (key: keyof ProductData) => {
    onChange(prev => ({ ...prev, [key]: '__ENABLED__' }));
  };
  
  const removeSlot = (key: keyof ProductData) => {
    onChange(prev => ({ ...prev, [key]: key.toLowerCase().includes('image') ? null : '' }));
  };

  // 옵션 관련
  const addOption = () => {
    // 기본값: x=0, y=0, w=320, h=400 (적당한 크기)
    const newOption: OptionItem = { 
        id: Date.now().toString(), 
        name: '', 
        image: null,
        x: 0, 
        y: 0, 
        width: 320, 
        height: 400 
    };
    onChange(prev => ({ ...prev, options: [...prev.options, newOption] }));
  };
  const removeOption = (id: string) => {
    if (window.confirm('삭제하시겠습니까?')) {
        onChange(prev => ({ ...prev, options: prev.options.filter(o => o.id !== id) }));
    }
  };
  const updateOptionName = (id: string, name: string) => {
    onChange(prev => ({
        ...prev,
        options: prev.options.map(opt => opt.id === id ? { ...opt, name } : opt)
    }));
  };
  const updateOptionImage = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(prev => ({
            ...prev,
            options: prev.options.map(opt => opt.id === id ? { ...opt, image: reader.result as string } : opt)
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // 서브포인트 렌더링 헬퍼
  const renderSubPoint = (n: number, prefix: 'point1' | 'point2', targetId: string) => {
    const imgKey = `${prefix}Image${n}` as keyof ProductData;
    const descKey = `ai${prefix.charAt(0).toUpperCase() + prefix.slice(1)}Desc${n}` as keyof ProductData;
    const isImgActive = (data as any)[imgKey];
    const isDescActive = (data as any)[descKey];

    if (!isImgActive && !isDescActive) {
        return (
            <div className="flex gap-2 mt-4">
                <button onClick={() => enableSlot(imgKey)} className="flex-1 py-3 border-2 border-dashed border-white/10 rounded-lg text-slate-500 font-bold hover:border-blue-400/50 hover:text-blue-400 hover:bg-blue-900/10 transition-all duration-200 ease-out text-xs shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">+ 이미지 ({prefix}-{n})</button>
                <button onClick={() => enableSlot(descKey)} className="flex-1 py-3 border-2 border-dashed border-white/10 rounded-lg text-slate-500 font-bold hover:border-green-400/50 hover:text-green-400 hover:bg-green-900/10 transition-all duration-200 ease-out text-xs shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">+ 설명 ({prefix}-{n})</button>
            </div>
        );
    }

    return (
        <div className="mt-4 pt-4 border-t border-dashed border-white/10 animate-fade-in-down">
            <div className="text-xs font-bold text-slate-500 mb-2 uppercase">{prefix} - {n}</div>
            {(() => {
                const imgEl = isImgActive ? (
                    <ImageUploader key="img" label={`Image ${prefix === 'point1' ? '1' : '2'}-${n}`} value={(data as any)[imgKey]} targetId={targetId} onDelete={() => removeSlot(imgKey)} onChange={handleImageChange(imgKey)} onApplyWatermark={() => applyWatermark(imgKey)} isWatermarkOn={data.watermarkSettings?.[imgKey]?.show} />
                ) : (
                    <button key="img" onClick={() => enableSlot(imgKey)} className="w-full py-2 border border-dashed border-white/10 rounded text-xs text-slate-500 hover:bg-white/5 transition-all duration-200 ease-out shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">+ 이미지 추가</button>
                );
                const descEl = isDescActive ? (
                    <Textarea key="desc" label={`설명 ${prefix === 'point1' ? '1' : '2'}-${n}`} value={(data as any)[descKey]} placeholder="AI 작성 영역" targetId={targetId} onDelete={() => removeSlot(descKey)} onChange={handleTextChange(descKey)} />
                ) : (
                    <button key="desc" onClick={() => enableSlot(descKey)} className="w-full py-2 border border-dashed border-white/10 rounded text-xs text-slate-500 hover:bg-white/5 transition-all duration-200 ease-out shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">+ 설명 추가</button>
                );
                // ⑩ 고도몰: 미리보기와 동일하게 설명 → 이미지 순서
                return isGodo ? [descEl, <div key="gap" className="h-2" />, imgEl] : [imgEl, <div key="gap" className="h-2" />, descEl];
            })()}
        </div>
    );
  };

  // 스펙 라벨 (한글)
  const SPEC_LABELS: Record<string, string> = {
    feature: '특징', type: '타입/종류', material: '재질/소재', size: '사이즈 (mm)', weight: '무게 (g)', power: '전원/충전', maker: '제조사'
  };

  return (
    <div className="p-6 pb-32 space-y-8 relative">
      
      {/* 1. 기본 설정 */}
      <section className="space-y-4" onClick={() => scrollTo('preview-top')}>
        <h2 className="text-lg font-black text-white border-b border-white/10 pb-2 font-mono">📂 기본 설정</h2>
        <div className="mb-4">
            <label className="block text-sm font-bold text-slate-500 mb-2">컬러 테마</label>
            <div className="flex gap-2 flex-wrap mb-2">
                {COLOR_PRESETS.map(p => (
                    <button key={p.value} onClick={() => handleColorChange(p.value)} className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ease-out shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] ${data.themeColor === p.value ? 'border-gray-600 scale-110' : 'border-transparent hover:scale-105'}`} style={{ background: p.value }} title={(p as any).label || p.value} />
                ))}
            </div>
             <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded cursor-pointer border-none bg-transparent" value={data.themeColor} onChange={(e) => handleColorChange(e.target.value)} />
                <input type="text" className="flex-1 p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded uppercase text-sm" value={data.themeColor} onChange={(e) => handleColorChange(e.target.value)} />
             </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-1">상품명 (한글)</label>
          <input type="text" className="w-full p-3 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded-lg font-bold placeholder-slate-500 focus:ring-2 focus:ring-[#22C55E] outline-none transition-all duration-200 ease-out shadow-[var(--shadow-sm)] focus:shadow-[var(--shadow-md)]" value={data.productNameKr} onChange={handleTextChange('productNameKr')} onFocus={() => scrollTo('preview-top')} placeholder="예: 바나나 오나홀" />
        </div>
        <div>
           <label className="block text-sm font-bold text-slate-500 mb-1">영문 상품명</label>
           <input type="text" className="w-full p-3 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded-lg font-medium font-montserrat placeholder-slate-500 focus:ring-2 focus:ring-[#22C55E] outline-none transition-all duration-200 ease-out shadow-[var(--shadow-sm)] focus:shadow-[var(--shadow-md)]" value={data.productNameEn} onChange={handleTextChange('productNameEn')} onFocus={() => scrollTo('preview-top')} placeholder="BANANA ONAHOLE" />
        </div>
        <div>
           <label className="block text-sm font-bold text-slate-500 mb-1">제조사/브랜드명</label>
           <input type="text" className="w-full p-3 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded-lg font-medium placeholder-slate-500 focus:ring-2 focus:ring-[#22C55E] outline-none transition-all duration-200 ease-out shadow-[var(--shadow-sm)] focus:shadow-[var(--shadow-md)]" value={data.brandName} onChange={handleTextChange('brandName')} onFocus={() => scrollTo('preview-top')} placeholder="예: BANANA MALL" />
        </div>
      </section>

      {/* 2. 메인 이미지 */}
      <section className="space-y-4" onClick={() => scrollTo('preview-main')}>
        <h2 className="text-lg font-black text-white border-b border-white/10 pb-2 font-mono">🖼️ 메인 이미지</h2>
        
        {/* 워터마크 등록 영역 */}
        <div className="mb-6 p-4 bg-purple-900/20 rounded-xl border border-purple-500/30 shadow-[var(--shadow-lg)] transition-all duration-200 ease-out">
            <h3 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                워터마크 등록
            </h3>
            <div className="flex gap-4 items-center">
                <div className="w-16 h-16 bg-white/5 border border-purple-500/30 rounded-lg flex items-center justify-center overflow-hidden relative group cursor-pointer">
                    {data.watermarkImage ? (
                        <img src={data.watermarkImage} className="w-full h-full object-contain" alt="watermark" />
                    ) : (
                       <span className="text-purple-400 text-xs text-center leading-tight">IMG<br/>UPLOAD</span>
                    )}
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageChange('watermarkImage')} title="워터마크 이미지 업로드" />
                </div>
                <div className="flex-1 text-xs text-slate-500">
                    <p className="font-bold">투명 배경(PNG) 권장</p>
                    <p>등록 후 각 이미지 섹션에서 '워터마크 삽입' 버튼을 눌러 적용하세요.</p>
                </div>
                {data.watermarkImage && (
                    <button onClick={() => onChange(prev => ({ ...prev, watermarkImage: null }))} className="text-red-400 text-xs hover:text-red-600 underline">삭제</button>
                )}
            </div>
        </div>

        <ImageUploader label="Main Image" value={data.mainImage} targetId="preview-main" onChange={handleImageChange('mainImage')} onApplyWatermark={() => applyWatermark('mainImage')} isWatermarkOn={data.watermarkSettings?.['mainImage']?.show} />
      </section>

      {/* 3. 스펙 정보 */}
      <section className="space-y-4" onClick={() => scrollTo('preview-spec')}>
         <h2 className="text-lg font-black text-white border-b border-white/10 pb-2 font-mono">📝 스펙 정보</h2>
         <div className="grid grid-cols-2 gap-3">
            {Object.keys(SPEC_LABELS).map((key) => (
              <div key={key}>
                 <label className="block text-xs font-bold text-slate-500 mb-1 capitalize">{SPEC_LABELS[key]}</label>
                 <input type="text" className="w-full p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-[#22C55E]" value={(data.summaryInfo as any)[key] || ''} onChange={handleSummaryChange(key)} onFocus={() => scrollTo('preview-spec')} />
              </div>
            ))}
         </div>
         {isGodo ? (
           /* [고도몰] AI 생성 참고용 핵심 특징 3블록 — 메인특징=직접입력(필수, AI 핵심참고), 특징설명=AI 생성 가능 */
           <div className="mt-2 space-y-4" onClick={() => scrollTo('preview-feature')}>
             <div className="text-xs font-bold text-emerald-400/90 uppercase tracking-wider">AI 생성 참고용 핵심 특징 (KEY FEATURE)</div>
             {[0, 1, 2].map((idx) => (
               <div key={idx} className="p-3 rounded-lg bg-[#0F172A]/40 border border-white/10 space-y-2">
                 <label className="block text-xs font-bold text-slate-400">메인특징 {idx + 1} <span className="text-rose-400">*직접입력</span></label>
                 <input
                   type="text"
                   className="w-full p-2 border border-white/10 bg-[#0F172A]/60 text-slate-100 rounded text-sm font-bold outline-none focus:ring-1 focus:ring-[#22C55E] placeholder-slate-600"
                   value={data.keyFeatures?.[idx]?.title || ''}
                   onChange={handleKeyFeatureChange(idx, 'title')}
                   onFocus={() => scrollTo('preview-feature')}
                   placeholder={`예: ${idx === 0 ? '10단 강력 진동' : idx === 1 ? '부드러운 실리콘' : '방수 IPX7'}`}
                 />
                 <Textarea
                   label={`특징 설명 ${idx + 1} (AI 생성 가능)`}
                   value={data.keyFeatures?.[idx]?.desc || ''}
                   placeholder="AI가 메인특징을 참고해 작성 · 직접 입력도 가능"
                   rows={2}
                   targetId="preview-feature"
                   onChange={handleKeyFeatureChange(idx, 'desc')}
                 />
               </div>
             ))}
             <p className="text-[11px] text-slate-500 leading-relaxed">※ 입력한 <b className="text-slate-400">메인특징 3개</b>는 AI가 전체 문구를 생성할 때 핵심 참고자료로 사용됩니다.</p>
           </div>
         ) : (
           <>
             <Textarea label="AI 생성 참고용 핵심 요약" value={data.aiSummary} placeholder="예: 강력한 진동, 부드러운 실리콘 재질..." rows={2} targetId="preview-spec" onChange={handleTextChange('aiSummary')} />

             {/* [추가] 동영상 삽입 (800x450) — 고도몰 모드에선 비활성(숨김, 필드는 유지) */}
             <div className="mt-4 pt-4 border-t border-dashed border-white/10">
                <ImageUploader
                    label="동영상 삽입 (이미지)"
                    subLabel="800x450 권장"
                    value={data.videoInsertImage}
                    targetId="preview-spec"
                    onChange={handleImageChange('videoInsertImage')}
                    onDelete={() => onChange(prev => ({ ...prev, videoInsertImage: null }))}
                />
             </div>
           </>
         )}
      </section>

      {/* 4. 패키지 이미지 정보 (분리됨) */}
      <section className="space-y-4" onClick={() => scrollTo('preview-package')}>
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
            <h2 className="text-lg font-black text-white font-mono">📦 패키지 이미지 설정</h2>
            <label className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={data.isPackageImageEnabled ?? true} 
                    onChange={(e) => onChange(prev => ({ ...prev, isPackageImageEnabled: e.target.checked }))} 
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all duration-200 ease-out peer-checked:bg-[#22C55E] shadow-sm"></div>
                <span className="ml-3 text-sm font-medium text-slate-500">{data.isPackageImageEnabled ? 'ON' : 'OFF'}</span>
            </label>
        </div>

        {data.isPackageImageEnabled && (
            <div className="grid grid-cols-2 gap-4 animate-fade-in-down">
                <div className="col-span-1"><ImageUploader label="Package Image" value={data.packageImage} isSmall={true} targetId="preview-package" onChange={handleImageChange('packageImage')} onApplyWatermark={() => applyWatermark('packageImage')} isWatermarkOn={data.watermarkSettings?.['packageImage']?.show} /></div>
                 <div className="col-span-1 flex items-center justify-center text-xs text-gray-400">패키지 이미지는<br/>작게 출력됩니다.</div>
            </div>
        )}
      </section>

      {/* 5. 옵션 */}
      <section className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-[var(--shadow-lg)] transition-all duration-200 ease-out" onClick={() => scrollTo('preview-option')}>
         <div className="flex justify-between items-center mb-4">
             <h2 className="text-md font-bold text-white font-mono">✨ 추가 옵션 (Option)</h2>
             <button onClick={addOption} className="text-xs bg-white/10 text-slate-400 px-3 py-1.5 rounded hover:bg-white/20 hover:text-white transition-all duration-200 ease-out shadow-sm hover:shadow-md">+ 추가</button>
         </div>
         {data.options.map((opt, i) => (
             <div key={opt.id} className="bg-[#0F172A]/50 p-3 rounded-lg border border-white/10 mb-3 last:mb-0 relative shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)] transition-all duration-200 ease-out" onFocus={() => scrollTo('preview-option')}>
                 <div className="flex justify-between items-center mb-2">
                    <div className="text-xs font-bold text-slate-400">Option {i + 1}</div>
                    <button onClick={() => removeOption(opt.id)} className="text-red-400 text-xs font-bold hover:underline px-2">삭제</button>
                 </div>
                 <input type="text" value={opt.name} onChange={(e) => updateOptionName(opt.id, e.target.value)} placeholder="옵션명" className="w-full p-2 bg-[#0F172A]/50 border border-white/10 rounded text-sm mb-2 text-slate-200 outline-none focus:ring-1 focus:ring-[#22C55E]" />
                 <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-white/5 rounded overflow-hidden flex-shrink-0 border border-white/10">
                        {opt.image ? <img src={opt.image} className="w-full h-full object-cover" alt="opt" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">No Img</div>}
                    </div>
                    <input type="file" className="text-xs" onChange={(e) => updateOptionImage(opt.id, e)} />
                 </div>
                 {/* 옵션 이미지에는 워터마크 버튼 아직 미구현 (구조상 복잡) - 일단 패스하거나 필요시 추가 */}
             </div>
         ))}
      </section>

      {/* 5. 상세 포인트 */}
      <section className="space-y-6">
         <h2 className="text-lg font-black text-white border-b border-white/10 pb-2 font-mono">✨ 상세 포인트</h2>
         
         {/* Feature */}
         <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-[var(--shadow-lg)] transition-all duration-200 ease-out" onClick={() => scrollTo('preview-feature')}>
            <h3 className="font-bold text-slate-300 mb-3">Feature (핵심 특징){isGodo ? ' 이미지' : ''}</h3>
            {isGodo ? (
                <>
                    <ImageUploader label="Feature Image (KEY FEATURE 좌측)" value={data.featureImage} targetId="preview-feature" onChange={handleImageChange('featureImage')} onDelete={() => onChange(prev => ({ ...prev, featureImage: null }))} onApplyWatermark={() => applyWatermark('featureImage')} isWatermarkOn={data.watermarkSettings?.['featureImage']?.show} />
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">※ 설명 문구는 위 <b className="text-slate-400">핵심특징 3블록</b>이 대체합니다. KEY FEATURE 부제는 스펙 <b className="text-slate-400">'특징'</b>이 자동으로 붙습니다.</p>
                </>
            ) : data.featureImage || data.aiFeatureDesc ? (
                <>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-400">Main</span>
                        <button onClick={() => { removeSlot('featureImage'); removeSlot('aiFeatureDesc'); }} className="text-red-500 text-xs font-bold hover:bg-red-50 px-2 py-1 rounded">🗑 섹션 삭제</button>
                    </div>
                    <div className="mb-3">
                        <input 
                            type="text" 
                            className="w-full p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded text-sm placeholder-slate-500 outline-none focus:ring-1 focus:ring-[#22C55E]"
                            placeholder="섹션 타이틀 (기본값: 특징)"
                            value={data.featureTitle || ''} 
                            onChange={(e) => onChange(prev => ({ ...prev, featureTitle: e.target.value }))}
                        />
                    </div>
                    <ImageUploader label="Feature Image" value={data.featureImage} targetId="preview-feature" onChange={handleImageChange('featureImage')} onDelete={() => removeSlot('featureImage')} onApplyWatermark={() => applyWatermark('featureImage')} isWatermarkOn={data.watermarkSettings?.['featureImage']?.show} />
                    <Textarea label="AI 설명" value={data.aiFeatureDesc} placeholder="AI 작성 영역" targetId="preview-feature" onChange={handleTextChange('aiFeatureDesc')} onDelete={() => removeSlot('aiFeatureDesc')} />
                </>
            ) : (
                <button onClick={() => { enableSlot('featureImage'); enableSlot('aiFeatureDesc'); }} className="w-full py-6 border-2 border-dashed border-white/10 rounded-lg text-slate-500 font-bold hover:border-blue-400/50 hover:text-blue-400 hover:bg-blue-900/10 transition-all duration-200 ease-out shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">+ Feature 섹션 추가하기</button>
            )}
         </div>

         {/* Point 1 */}
         <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-[var(--shadow-lg)] transition-all duration-200 ease-out" onClick={() => scrollTo('preview-point1')}>
            <h3 className="font-bold text-slate-300 mb-3">Point 01</h3>
            {data.point1Image1 || data.aiPoint1Desc || (data as any).point1Image2 || (data as any).point1Image3 ? (
             <>
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400">Main</span>
                    <button onClick={() => { removeSlot('point1Image1'); removeSlot('aiPoint1Desc'); }} className="text-red-500 text-xs font-bold hover:bg-red-50 px-2 py-1 rounded">🗑 섹션 삭제 (전체)</button>
                </div>
                    <div className="mb-3">
                    <input 
                        type="text" 
                        className="w-full p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded text-sm placeholder-slate-500 outline-none focus:ring-1 focus:ring-[#22C55E]"
                        placeholder="섹션 타이틀 (기본값: POINT 01)"
                        value={data.point1Title || ''} 
                        onChange={(e) => onChange(prev => ({ ...prev, point1Title: e.target.value }))}
                    />
                </div>
                {(() => {
                    const img = <ImageUploader key="i" label="Image 1-1" value={data.point1Image1} targetId="preview-point1" onChange={handleImageChange('point1Image1')} onDelete={() => removeSlot('point1Image1')} onApplyWatermark={() => applyWatermark('point1Image1')} isWatermarkOn={data.watermarkSettings?.['point1Image1']?.show} />;
                    const desc = <Textarea key="d" label="설명 1-1" value={data.aiPoint1Desc} placeholder="AI 작성 영역" targetId="preview-point1" onChange={handleTextChange('aiPoint1Desc')} onDelete={() => removeSlot('aiPoint1Desc')} />;
                    return isGodo ? [desc, img] : [img, desc];
                })()}
                
                {renderSubPoint(2, 'point1', 'preview-point1')}
                {renderSubPoint(3, 'point1', 'preview-point1')}
             </>
            ) : (
                <button onClick={() => { enableSlot('point1Image1'); enableSlot('aiPoint1Desc'); }} className="w-full py-6 border-2 border-dashed border-white/10 rounded-lg text-slate-500 font-bold hover:border-blue-400/50 hover:text-blue-400 hover:bg-blue-900/10 transition-all duration-200 ease-out shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">+ Point 01 섹션 추가하기</button>
            )}
         </div>

         {/* Point 2 */}
         <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-[var(--shadow-lg)] transition-all duration-200 ease-out" onClick={() => scrollTo('preview-point2')}>
            <h3 className="font-bold text-slate-300 mb-3">Point 02</h3>
            {data.point2Image1 || data.aiPoint2Desc ? (
               <>
                 <div className="flex justify-between items-center mb-2">
                     <span className="text-xs font-bold text-slate-400">Main</span>
                     <button onClick={() => { removeSlot('point2Image1'); removeSlot('aiPoint2Desc'); }} className="text-red-500 text-xs font-bold hover:bg-red-50 px-2 py-1 rounded">🗑 섹션 삭제</button>
                 </div>
                 <div className="mb-3">
                    <input 
                        type="text" 
                        className="w-full p-2 border border-white/10 bg-[#0F172A]/50 text-slate-200 rounded text-sm placeholder-slate-500 outline-none focus:ring-1 focus:ring-[#22C55E]"
                        placeholder="섹션 타이틀 (기본값: POINT 02)"
                        value={data.point2Title || ''} 
                        onChange={(e) => onChange(prev => ({ ...prev, point2Title: e.target.value }))}
                    />
                 </div>
                 {(() => {
                    const img = <ImageUploader key="i" label="Image 2-1" value={data.point2Image1} targetId="preview-point2" onChange={handleImageChange('point2Image1')} onDelete={() => removeSlot('point2Image1')} onApplyWatermark={() => applyWatermark('point2Image1')} isWatermarkOn={data.watermarkSettings?.['point2Image1']?.show} />;
                    const desc = <Textarea key="d" label="설명 2-1" value={data.aiPoint2Desc} placeholder="AI 작성 영역" targetId="preview-point2" onChange={handleTextChange('aiPoint2Desc')} onDelete={() => removeSlot('aiPoint2Desc')} />;
                    return isGodo ? [desc, img] : [img, desc];
                 })()}
                 
                 {renderSubPoint(2, 'point2', 'preview-point2')}
                 {renderSubPoint(3, 'point2', 'preview-point2')}
               </>
            ) : (
                <button onClick={() => { enableSlot('point2Image1'); enableSlot('aiPoint2Desc'); }} className="w-full py-6 border-2 border-dashed border-white/10 rounded-lg text-slate-500 font-bold hover:border-rose-400/50 hover:text-rose-400 hover:bg-rose-900/10 transition-all duration-200 ease-out shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]">+ Point 02 섹션 추가하기</button>
            )}
         </div>

         {/* Size & Thumb */}
         <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-[var(--shadow-lg)] transition-all duration-200 ease-out" onClick={() => scrollTo('preview-size')}>
            <h2 className="text-md font-bold text-white mb-3">📏 사이즈 및 썸네일</h2>
            <div className="grid grid-cols-2 gap-4">
                <ImageUploader label="Size Detail" value={data.sizeImage} targetId="preview-size" onChange={handleImageChange('sizeImage')} onDelete={() => removeSlot('sizeImage')} onApplyWatermark={() => applyWatermark('sizeImage')} isWatermarkOn={data.watermarkSettings?.['sizeImage']?.show} />
                <ImageUploader label="Thumbnail" value={data.thumbnailImage} targetId="preview-size" onChange={handleImageChange('thumbnailImage')} onDelete={() => removeSlot('thumbnailImage')} onApplyWatermark={() => applyWatermark('thumbnailImage')} isWatermarkOn={data.watermarkSettings?.['thumbnailImage']?.show} />
            </div>
         </div>
      </section>

      {/* AI Button */}
      <div className="sticky bottom-0 z-50 bg-[#020617]/90 border-t border-white/10 p-4 -mx-6 shadow-2xl backdrop-blur-md">
        <button onClick={onGenerateAI} disabled={isLoading} className="db-cta">
          {isLoading ? <><span className="db-cta-spin"></span>AI가 문구 작성중...</> : <>✨ AI 문구 자동 생성하기</>}
        </button>
      </div>
    </div>
  );
};

export default Editor;
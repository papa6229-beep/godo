// @ts-nocheck — 이식된 상세페이지 생성기(벤더 코드): GODO 엄격 TS/lint 면제. 로직 수정 최소화.
import React, { useState, useRef } from "react";
import { toJpeg } from "html-to-image";
import type { ProductData } from "./types";
import { INITIAL_PRODUCT_DATA, THUMBNAIL_PRESETS } from "./constants";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import Editor from "./components/Editor";
import EditorFlow from "./components/EditorFlow";
import Preview from "./components/Preview";
import PreviewGodo from "./components/PreviewGodo";
import PreviewGodoFlow from "./components/PreviewGodoFlow";
import ThumbnailPreview from "./components/ThumbnailPreview";
import { generateCopywriting } from "./services/geminiService";
// 이식 회귀 수정: 원본은 Tailwind preflight ON에서 제작 → GODO는 전역 preflight를 꺼서
// 이미지 크기/중앙정렬/박스 계산이 어긋남. 생성기 루트로만 스코프된 리셋을 되살린다.
import "./detailBuilder.css";

// layoutMode: 'bananamall'(기존 메인몰 레이아웃) | 'godo'(고도몰 전용 레이아웃)
const App: React.FC<{ layoutMode?: 'bananamall' | 'godo' | 'godoFlow' }> = ({ layoutMode = 'bananamall' }) => {
  const isGodo = layoutMode === 'godo';
  const isGodoFlow = layoutMode === 'godoFlow'; // 단순형 변환기(격리된 신규 렌더러)
  const [data, setData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("처리 중입니다..."); // ✅ 로딩 메시지 상태 추가

  const detailRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleGenerateAI = async () => {
    if (isLoading) return; // 중복 실행 방지(더블클릭·연타)
    if (!data.productNameKr) {
      alert("상품명을 입력해주세요. AI가 상품명을 모르면 글을 못 씁니다!");
      return;
    }

    setIsLoading(true);
    setLoadingMessage("AI가 문구를 작성 중입니다..."); // ✅ 메시지 설정
    try {
      const aiResult = await generateCopywriting(data);
      setData((prev) => ({ ...prev, ...aiResult }));
    } catch (error) {
      console.error(error);
      alert("AI 문구 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const cropImage = (
    image: HTMLImageElement,
    y: number,
    height: number,
    width: number,
  ): string => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // 원본 이미지에서 해당 영역만 잘라서 그리기
    // drawImage(image, sy, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
    ctx.drawImage(image, 0, y, width, height, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 1.0); // 최고 품질 1.0
  };

  const exportDetailPage = async () => {
    if (isLoading) return; // 중복 캡처 방지(더블클릭)
    if (!detailRef.current) return;
    setIsLoading(true);
    setLoadingMessage("이미지 구조를 분석하고 저장 중입니다...");

    try {
      const element = detailRef.current;
      await new Promise((resolve) => setTimeout(resolve, 800)); // 이미지 로딩 대기

      // 1. 전체 이미지를 고화질로 캡처
      // ✅ pixelRatio: 1로 설정하여 800px 너비 유지 (기존 2 -> 1)
      const pixelRatio = 1;
      const dataUrl = await toJpeg(element, {
        quality: 1.0, // 최고 품질
        backgroundColor: "#ffffff",
        pixelRatio: pixelRatio,
      });

      const videoSection = element.querySelector(
        "#video-insert-section",
      ) as HTMLElement;
      const hasVideoData =
        data.videoInsertImage &&
        typeof data.videoInsertImage === "string" &&
        data.videoInsertImage.length > 0;

      // 2. 동영상 섹션이 없거나(데이터 없음 or DOM 없음) 체크
      // 데이터가 있어도 DOM이 없으면(예: 렌더링 타이밍 이슈) 일반 저장으로 처리하여 에러 방지
      if (!hasVideoData || !videoSection) {
        const link = document.createElement("a");
        link.download = `detail_page_${data.productNameKr || "product"}.jpg`;
        link.href = dataUrl;
        document.body.appendChild(link); // Firefox 등 호환성 위해 body에 추가
        link.click();
        document.body.removeChild(link);
      } else {
        try {
          // 3. 동영상 섹션이 있으면 3분할 저장 (ZIP)
          setLoadingMessage(
            "이미지를 3분할(상단/중단/하단)하여 저장 중입니다...",
          );

          // 위치 계산 (컨테이너 기준 상대 위치)
          const containerRect = element.getBoundingClientRect();

          // 섹션 내부의 실제 이미지 요소(img)를 찾아서 기준점으로 삼음
          const videoImgElement = videoSection.querySelector("img");

          if (!videoImgElement) {
            throw new Error("동영상 이미지를 찾을 수 없습니다.");
          }

          const videoImgRect = videoImgElement.getBoundingClientRect();

          // 좌표 및 크기 (pixelRatio 1이므로 그대로 사용)
          const videoTop = videoImgRect.top - containerRect.top;
          const videoHeight = videoImgRect.height;
          const totalHeight = containerRect.height;
          const width = containerRect.width;

          // 이미지 객체 생성 (전체 스크린샷 캔버스용)
          const img = new Image();

          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error("스크린샷 이미지 로드 실패"));
            img.src = dataUrl;
          });

          // 분할 작업
          const zip = new JSZip();

          // Part 1: 상단 (main1.jpg)
          const safeVideoTop = Math.max(0, videoTop);
          if (safeVideoTop > 0) {
            const part1Url = cropImage(img, 0, safeVideoTop, width);
            zip.file("main1.jpg", part1Url.split(",")[1], { base64: true });
          }

          // Part 2: 동영상 부분 (main2.gif)
          if (!data.videoInsertImage!.includes("base64,")) {
            throw new Error("동영상 이미지 데이터 형식이 잘못되었습니다.");
          }
          const originalGifData = data.videoInsertImage!.split(",")[1];
          zip.file("main2.gif", originalGifData, { base64: true });

          // Part 3: 하단 (main3.jpg)
          const part3Start = safeVideoTop + videoHeight;
          const part3Height = totalHeight - part3Start;

          if (part3Height > 0) {
            const part3Url = cropImage(img, part3Start, part3Height, width);
            zip.file("main3.jpg", part3Url.split(",")[1], { base64: true });
          }

          const content = await zip.generateAsync({ type: "blob" });
          saveAs(
            content,
            `detail_split_${data.productNameKr || "product"}.zip`,
          );
        } catch (splitError) {
          console.warn(
            "분할 저장 중 오류 발생, 전체 이미지 저장으로 전환합니다:",
            splitError,
          );
          // 분할 저장 실패 시 백업: 전체 이미지 저장
          const link = document.createElement("a");
          link.download = `detail_page_${data.productNameKr || "product"}.jpg`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } catch (err) {
      console.error("Export failed", err);
      alert(
        `이미지 저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const exportThumbnails = async () => {
    if (isLoading) return; // 중복 실행 방지
    setIsLoading(true);
    setLoadingMessage("썸네일을 압축 저장 중입니다...");
    try {
      const zip = new JSZip();

      for (let i = 0; i < THUMBNAIL_PRESETS.length; i++) {
        const ref = thumbnailRefs.current[i];
        if (ref) {
          const preset = THUMBNAIL_PRESETS[i];

          // html-to-image 사용
          const dataUrl = await toJpeg(ref, {
            quality: 1.0, // 최고 품질
            backgroundColor: "#ffffff",
            pixelRatio: 1,
          });

          // dataURL에서 base64 데이터만 추출
          const imageData = dataUrl.split(",")[1];
          zip.file(`thumbnail_${preset.label}.jpg`, imageData, {
            base64: true,
          });
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `thumbnails_${data.productNameKr || "product"}.zip`);
    } catch (err) {
      console.error(err);
      alert(
        `썸네일 저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ 개별 썸네일 다운로드 함수
  const downloadSingleThumbnail = async (index: number, label: string) => {
    if (isLoading) return; // 중복 실행 방지
    const ref = thumbnailRefs.current[index];
    if (!ref) return;

    setIsLoading(true);
    setLoadingMessage(`썸네일(${label}) 저장 중...`);

    try {
      const dataUrl = await toJpeg(ref, {
        quality: 1.0, // 최고 품질
        backgroundColor: "#ffffff",
        pixelRatio: 1,
      });

      const link = document.createElement("a");
      link.download = `thumbnail_${label}_${data.productNameKr || "product"}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error(error);
      alert(
        `이미지 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ 옵션 레이아웃 변경 핸들러
  const handleOptionLayoutChange = (
    id: string,
    layout: { x: number; y: number; width: number; height: number },
  ) => {
    setData((prev) => ({
      ...prev,
      options: prev.options.map((opt) =>
        opt.id === id ? { ...opt, ...layout } : opt,
      ),
    }));
  };

  // ✅ 패키지 이미지 레이아웃 변경 핸들러
  const handlePackageLayoutChange = (layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    setData((prev) => ({
      ...prev,
      packageLayout: layout,
    }));
  };

  // [고도몰] KEY FEATURE 이미지 레이아웃(드래그/리사이즈) 핸들러
  const handleFeatureImageLayoutChange = (layout: { x: number; y: number; width: number; height: number }) => {
    setData((prev) => ({ ...prev, featureImageLayout: layout }));
  };
  // [고도몰] 레이아웃 간격 변경(드래그 핸들) 핸들러 — 구버전 종류별 폴백
  const handleGodoSpacingChange = (spacing: { section: number; element: number; heading: number }) => {
    setData((prev) => ({ ...prev, godoSpacing: spacing }));
  };
  // [고도몰] 간격 위치별 독립 변경 핸들러 — 위치 id마다 따로 저장(다른 위치 불변)
  const handleGodoGapChange = (id: string, value: number) => {
    setData((prev) => ({ ...prev, godoGaps: { ...(prev.godoGaps || {}), [id]: value } }));
  };

  // ✅ 썸네일 패키지 이미지 레이아웃 변경 핸들러 (500px 기준)
  const handleThumbnailPackageLayoutChange = (layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    setData((prev) => ({
      ...prev,
      thumbnailPackageLayout: layout,
    }));
  };

  // ✅ 워터마크 레이아웃 변경 핸들러
  const handleWatermarkLayoutChange = (
    id: string,
    layout: { x: number; y: number; width: number; height: number },
  ) => {
    setData((prev) => ({
      ...prev,
      watermarkSettings: {
        ...prev.watermarkSettings,
        [id]: { ...prev.watermarkSettings?.[id], ...layout, show: true },
      },
    }));
  };

  // ✅ 모든 워터마크 일괄 적용/해제 토글
  const toggleAllWatermarks = () => {
    if (!data.watermarkImage) {
      alert("먼저 워터마크 이미지를 등록해주세요 (메인 이미지 섹션)");
      return;
    }

    const targetKeys = [
      "mainImage",
      "featureImage",
      "point1Image1",
      "point1Image2",
      "point1Image3",
      "point2Image1",
      "point2Image2",
      "point2Image3",
      "sizeImage",
      "thumbnailImage",
      // [0단계] godo는 패키지 워터마크 미지원 → 일괄 토글 대상에서 제외(bananamall만 포함)
      ...(isGodo ? [] : ["packageImage"]),
    ];

    // 현재 하나라도 켜져 있으면 -> 전체 끄기, 다 꺼져 있으면 -> 전체 켜기
    const isAnyOn = targetKeys.some(
      (key) => data.watermarkSettings?.[key]?.show,
    );
    const nextState = !isAnyOn;

    const newSettings = { ...data.watermarkSettings };
    targetKeys.forEach((key) => {
      // 이미지가 있는 경우에만 적용
      if ((data as any)[key]) {
        newSettings[key] = {
          x: 0,
          y: 0,
          width: 100,
          height: 100, // 초기값 (Preview에서 자동 조정됨)
          ...(newSettings[key] || {}),
          show: nextState,
        };
      }
    });

    setData((prev) => ({ ...prev, watermarkSettings: newSettings }));
  };

  // ✅ 임시 저장 함수
  const saveTemporary = () => {
    try {
      localStorage.setItem("builder_temp_save", JSON.stringify(data));
      alert(
        "임시 저장이 완료되었습니다!\n(브라우저 캐시를 지우면 삭제될 수 있습니다)",
      );
    } catch (error) {
      console.error(error);
      alert("임시 저장 중 오류가 발생했습니다.");
    }
  };

  // ✅ 불러오기 함수
  const loadTemporary = () => {
    const savedData = localStorage.getItem("builder_temp_save");
    if (!savedData) {
      alert("저장된 데이터가 없습니다.");
      return;
    }

    if (
      window.confirm(
        "저장된 데이터를 불러오시겠습니까?\n현재 작업 중인 내용은 사라집니다.",
      )
    ) {
      try {
        const parsedData = JSON.parse(savedData);
        // 기존 데이터 구조와 호환성 체크 (간단하게)
        if (parsedData && typeof parsedData === "object") {
          setData((prev) => ({ ...prev, ...parsedData }));
        }
      } catch (error) {
        console.error(error);
        alert("데이터를 불러오는 중 오류가 발생했습니다.");
      }
    }
  };

  return (
    // ✅ 화면 전체 높이 고정 (overflow-hidden) -> 내부에서 스크롤 처리
    // detail-builder-root: 스코프 preflight 리셋 적용 지점(detailBuilder.css)
    // h-full: 오버레이(.dtd-builder-body)에 정확히 맞춤. h-screen(100vh)이면 상단바만큼
    // 넘쳐서 오버레이가 스크롤되고, scrollIntoView 시 미리보기가 살짝 밀리는 문제가 생김.
    <div className="detail-builder-root h-full flex flex-col bg-[#020617] font-sans overflow-hidden text-slate-200">
      {/* 헤더 */}
      <nav className="bg-[#020617]/90 backdrop-blur-md border-white/5 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-lg flex-shrink-0 h-[70px]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 text-black rounded flex items-center justify-center font-black text-lg">
            B
          </div>
          <h1 className="font-bold text-white text-lg font-mono">
            Detail Page Builder{" "}
            <span className="text-xs text-green-400">v3.0</span>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded ${isGodoFlow ? "bg-sky-500/20 text-sky-300" : isGodo ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-400"}`}>
              {isGodoFlow ? "변환기(단순형)" : isGodo ? "고도몰" : "메인몰"}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAllWatermarks}
            className={`db-btn db-btn--ghost${
              data.watermarkSettings &&
              Object.values(data.watermarkSettings).some((s: any) => s.show)
                ? " is-active"
                : ""
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
            모든 워터마크{" "}
            {data.watermarkSettings &&
            Object.values(data.watermarkSettings).some((s: any) => s.show)
              ? "끄기"
              : "켜기"}
          </button>
          <div className="db-divider"></div>
          <button onClick={saveTemporary} className="db-btn db-btn--ghost">
            임시 저장
          </button>
          <button onClick={loadTemporary} className="db-btn db-btn--ghost">
            불러오기
          </button>
          <div className="db-divider"></div>
          <button onClick={exportThumbnails} disabled={isLoading} className="db-btn db-btn--ghost">
            썸네일 저장
          </button>
          <button onClick={exportDetailPage} disabled={isLoading} className="db-btn db-btn--primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
            전체 이미지 저장
          </button>
        </div>
      </nav>

      {/* 메인 영역 (flex-1로 남은 공간 다 차지) */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* 에디터 (좌측) - 독립 스크롤 */}
        <aside className="w-full lg:w-[450px] border-r border-white/5 bg-[#020617] overflow-y-auto z-20 shadow-[var(--shadow-xl)] relative flex-shrink-0 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {isGodoFlow ? (
            <EditorFlow data={data} onChange={setData} />
          ) : (
            <Editor
              data={data}
              onChange={setData}
              onGenerateAI={handleGenerateAI}
              isLoading={isLoading}
              layoutMode={layoutMode}
            />
          )}
        </aside>

        {/* 프리뷰 (우측) - 독립 스크롤 (가로/세로 모두 가능) */}
        <section className="flex-1 bg-[#0F172A] overflow-auto relative p-8 flex justify-center">
          <div className="flex flex-col items-center gap-10 min-w-[800px] pb-20">
            {/* 상세페이지 프리뷰 */}
            <div className="shadow-[var(--shadow-2xl)] bg-white transition-all duration-200 ease-out">
              {isGodoFlow ? (
                <PreviewGodoFlow
                  data={data}
                  ref={detailRef}
                  onWatermarkLayoutChange={handleWatermarkLayoutChange}
                  onGapChange={handleGodoGapChange}
                />
              ) : isGodo ? (
                <PreviewGodo
                  data={data}
                  ref={detailRef}
                  onOptionLayoutChange={handleOptionLayoutChange}
                  onPackageLayoutChange={handlePackageLayoutChange}
                  onWatermarkLayoutChange={handleWatermarkLayoutChange}
                  onFeatureImageLayoutChange={handleFeatureImageLayoutChange}
                  onSpacingChange={handleGodoSpacingChange}
                  onGapChange={handleGodoGapChange}
                />
              ) : (
                <Preview
                  data={data}
                  ref={detailRef}
                  layoutMode={layoutMode}
                  onOptionLayoutChange={handleOptionLayoutChange}
                  onPackageLayoutChange={handlePackageLayoutChange}
                  onWatermarkLayoutChange={handleWatermarkLayoutChange}
                />
              )}
            </div>

            {/* 썸네일 프리뷰 */}
            <div className="bg-white p-6 rounded-xl shadow-[var(--shadow-lg)] border border-gray-100 w-full max-w-[800px] transition-all duration-200 ease-out hover:shadow-[var(--shadow-xl)]">
              <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase text-center">
                Thumbnail Check
              </h3>
              <div className="flex justify-center gap-4 flex-wrap">
                <div className="flex justify-center gap-4 flex-wrap">
                  {THUMBNAIL_PRESETS.map((preset, i) => (
                    <div
                      key={preset.label}
                      className="flex flex-col items-center gap-2"
                    >
                      {/* 고정된 200px 너비 박스 안에 scale로 축소 표시 */}
                      <div
                        style={{
                          width: 200,
                          height: 200 * (preset.height / preset.width),
                        }}
                        className="border bg-gray-50 overflow-hidden relative shadow-sm rounded-lg"
                      >
                        <div
                          className="origin-top-left"
                          style={{ transform: `scale(${200 / preset.width})` }}
                        >
                          <ThumbnailPreview
                            data={data}
                            width={preset.width}
                            height={preset.height}
                            hidePackage={preset.hidePackage}
                            externalScale={200 / preset.width}
                            layoutMode={isGodoFlow ? "godo" : layoutMode}
                            onLayoutChange={handleThumbnailPackageLayoutChange}
                            ref={(el) => (thumbnailRefs.current[i] = el)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500">
                          {preset.label}
                        </span>
                        <button
                          onClick={() =>
                            downloadSingleThumbnail(i, preset.label)
                          }
                          className="px-3 py-1 bg-gray-800 text-white text-xs rounded hover:bg-black transition-colors"
                        >
                          다운로드
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 로딩 인디케이터 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm transition-all duration-300">
          <div className="bg-[#0F172A]/90 border border-white/10 px-8 py-6 rounded-2xl shadow-[var(--shadow-2xl)] flex flex-col items-center gap-4 text-white backdrop-blur-md">
            <div className="w-10 h-10 border-4 border-white/10 border-t-[#22C55E] rounded-full animate-spin"></div>
            <p className="font-bold text-lg tracking-wide">{loadingMessage}</p>{" "}
            {/* ✅ 동적 메시지 표시 */}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
import React, { useState, useMemo, useRef } from 'react';
import type {
  OperationsDataSnapshot,
  ImportHistoryItem,
  DataDomain,
  DataImportStatus
} from '../types/dataConnector';
import { parseCSVToObjectArray } from '../utils/csvParser';
import { buildOperationsSnapshot, normalizeRawObject } from '../utils/dataNormalizer';
import { defaultOperationsData } from '../data/defaultOperationsData';
import './DataPanel.css';

interface DataPanelProps {
  activeOperationsData: OperationsDataSnapshot;
  setActiveOperationsData: React.Dispatch<React.SetStateAction<OperationsDataSnapshot>>;
  importHistory: ImportHistoryItem[];
  setImportHistory: React.Dispatch<React.SetStateAction<ImportHistoryItem[]>>;
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
  setActiveTab: (tab: 'agents' | 'office' | 'logs' | 'brain' | 'studio' | 'engine' | 'data' | 'calendar') => void;
  setLastSelectedDate: (date: string) => void;
}

export const DataPanel: React.FC<DataPanelProps> = ({
  activeOperationsData,
  setActiveOperationsData,
  importHistory,
  setImportHistory,
  onAddLog,
  setActiveTab,
  setLastSelectedDate
}) => {
  // 탭바 상태
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'upload' | 'preview' | 'mapping' | 'quality' | 'privacy' | 'history'>('overview');
  
  // 프리뷰 및 업로드 관련 임시 상태
  const [uploadDomain, setUploadDomain] = useState<DataDomain | 'all'>('orders');
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<DataImportStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // 파싱 후 대기 중인 로컬 임시 원본 데이터
  const [tempParsedData, setTempParsedData] = useState<Record<string, string>[] | null>(null);
  const [tempFullSnapshot, setTempFullSnapshot] = useState<OperationsDataSnapshot | null>(null);
  const [tempFileName, setTempFileName] = useState<string>('');
  
  // 프리뷰 탭 필터
  const [previewFilter, setPreviewFilter] = useState<DataDomain>('orders');
  
  // Toast 알림 상태
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. 통계 데이터 계산
  const stats = useMemo(() => {
    const ordersCount = activeOperationsData.orders.length;
    const inquiriesCount = activeOperationsData.inquiries.length;
    const reviewsCount = activeOperationsData.reviews.length;
    const inventoryCount = activeOperationsData.inventory.length;
    
    // 매출 요약 기간 산정
    let salesPeriod = '데이터 없음';
    if (activeOperationsData.sales.length > 0) {
      const dates = activeOperationsData.sales.map(s => s.date).sort();
      salesPeriod = `${dates[0]} ~ ${dates[dates.length - 1]}`;
    }
    
    const qualityScore = activeOperationsData.qualityReport?.qualityScore ?? 100;
    const privacyMaskedCount = activeOperationsData.qualityReport?.privacyMaskedCount ?? 0;
    
    return {
      sourceType: activeOperationsData.sourceType.toUpperCase(),
      ordersCount,
      inquiriesCount,
      reviewsCount,
      inventoryCount,
      salesPeriod,
      qualityScore,
      privacyMaskedCount
    };
  }, [activeOperationsData]);

  // 2. 파일 드래그 앤 드롭 핸들러
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // 3. 파일 처리 & 파싱 로직
  const processFile = (file: File) => {
    setUploadStatus('parsing');
    setUploadError(null);
    setTempParsedData(null);
    setTempFullSnapshot(null);
    setTempFileName(file.name);

    // 대용량 파일 경고 (10MB 초과)
    if (file.size > 10 * 1024 * 1024) {
      showToast('10MB를 초과하는 대용량 파일은 브라우저 성능에 지장을 줄 수 있습니다.', 'warning');
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const fileExt = file.name.split('.').pop()?.toLowerCase();

      try {
        if (fileExt === 'json') {
          const json = JSON.parse(text);
          
          if (uploadDomain === 'all') {
            // Full Snapshot 형태 검증
            if (json.orders && json.inquiries && json.reviews && json.inventory && json.sales) {
              setTempFullSnapshot(json);
              setUploadStatus('success');
              showToast('전체 스냅샷 JSON 파싱에 성공했습니다.', 'success');
            } else {
              setUploadStatus('error');
              setUploadError('올바른 Full Snapshot JSON 구조가 아닙니다. orders, inquiries, reviews, inventory, sales 배열이 모두 포함되어야 합니다.');
              onAddLog(`[Data] ${file.name} 전체 스냅샷 분석 실패. 필수 데이터 구조 누락.`, 'error');
            }
          } else {
            // 개별 JSON 또는 배열 형태
            const dataArray = Array.isArray(json) ? json : (json[uploadDomain] || [json]);
            // raw 형태로 key-value 매핑
            const rawItems: Record<string, string>[] = dataArray.map((item: Record<string, unknown>) => {
              const obj: Record<string, string> = {};
              Object.keys(item).forEach(k => {
                obj[k] = String(item[k]);
              });
              return obj;
            });
            setTempParsedData(rawItems);
            setUploadStatus('success');
            showToast(`${uploadDomain.toUpperCase()} JSON 데이터 분석 완료.`, 'success');
          }
        } else if (fileExt === 'csv') {
          if (uploadDomain === 'all') {
            setUploadStatus('error');
            setUploadError('CSV 포맷은 전체 스냅샷(Full Snapshot) 업로드를 지원하지 않습니다. 단일 데이터 도메인을 선택해주세요.');
            return;
          }
          const csvObjects = parseCSVToObjectArray(text);
          if (csvObjects.length === 0) {
            setUploadStatus('error');
            setUploadError('CSV 데이터가 비어있거나 올바른 행이 존재하지 않습니다.');
            onAddLog(`[Data] ${file.name} 파싱 실패. 유효 행 없음.`, 'error');
            return;
          }
          setTempParsedData(csvObjects);
          
          // 필수값 누락 검사하여 warning 부여
          const keys = Object.keys(normalizeRawObject(csvObjects[0]));
          let missingRequired = false;
          if (uploadDomain === 'orders' && (!keys.includes('orderNo') || !keys.includes('orderDate') || !keys.includes('productName'))) missingRequired = true;
          if (uploadDomain === 'inquiries' && (!keys.includes('inquiryDate') || !keys.includes('title') || !keys.includes('content'))) missingRequired = true;
          if (uploadDomain === 'reviews' && (!keys.includes('reviewDate') || !keys.includes('productName') || !keys.includes('rating'))) missingRequired = true;
          if (uploadDomain === 'inventory' && (!keys.includes('productName') || !keys.includes('stock'))) missingRequired = true;
          if (uploadDomain === 'sales' && (!keys.includes('date') || !keys.includes('totalSales'))) missingRequired = true;

          setUploadStatus(missingRequired ? 'warning' : 'success');
          if (missingRequired) {
            showToast('필수 필드 일부가 누락된 것으로 의심됩니다. Mapping Rules 탭을 검토해 주세요.', 'warning');
          } else {
            showToast('CSV 데이터 파싱 및 자동 필드 매핑이 완료되었습니다.', 'success');
          }
        } else {
          setUploadStatus('error');
          setUploadError('지원하지 않는 파일 형식입니다. .json 및 .csv 파일만 허용됩니다.');
          onAddLog(`[Data] ${file.name} 확장자 분석 실패.`, 'error');
        }
      } catch (err: unknown) {
        setUploadStatus('error');
        const errMsg = err instanceof Error ? err.message : String(err);
        setUploadError(`파싱 에러: ${errMsg}`);
        onAddLog(`[Data] ${file.name} 데이터 해석 실패. JSON/CSV 규격을 확인해 주세요.`, 'error');
      }
    };

    reader.onerror = () => {
      setUploadStatus('error');
      setUploadError('파일을 읽어오는 중 브라우저 오류가 발생했습니다.');
    };

    reader.readAsText(file);
  };

  // 4. 파싱된 원본 저장 로직 (Save Imported Data)
  const handleSaveImported = () => {
    let newSnapshot: OperationsDataSnapshot;
    let rowCount: number;
    
    if (tempFullSnapshot) {
      newSnapshot = {
        ...tempFullSnapshot,
        id: `snapshot-${Date.now()}`,
        sourceType: 'json',
        importedAt: new Date().toISOString()
      };
      rowCount = newSnapshot.orders.length + newSnapshot.inquiries.length + newSnapshot.reviews.length + newSnapshot.inventory.length + newSnapshot.sales.length;
    } else if (tempParsedData) {
      const targetDomain = uploadDomain as DataDomain;
      newSnapshot = buildOperationsSnapshot(targetDomain, tempParsedData, activeOperationsData);
      newSnapshot.sourceType = tempFileName.endsWith('.csv') ? 'csv' : 'json';
      rowCount = tempParsedData.length;
    } else {
      showToast('저장할 임포트 데이터가 존재하지 않습니다.', 'error');
      return;
    }

    // 부모 상태 및 로컬 스토리지 브릿지 저장
    setActiveOperationsData(newSnapshot);
    localStorage.setItem('godo.data.activeSnapshot', JSON.stringify(newSnapshot));
    localStorage.setItem('godo.data.lastSavedAt', new Date().toISOString());

    // 이력 추가
    const newHistoryItem: ImportHistoryItem = {
      id: `history-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      fileName: tempFileName,
      domain: uploadDomain,
      sourceType: tempFileName.endsWith('.csv') ? 'csv' : 'json',
      rowCount,
      status: uploadStatus === 'warning' ? 'warning' : 'success',
      qualityScore: newSnapshot.qualityReport?.qualityScore ?? 100
    };

    const updatedHistory = [newHistoryItem, ...importHistory];
    setImportHistory(updatedHistory);
    localStorage.setItem('godo.data.importHistory', JSON.stringify(updatedHistory));

    // 로그 전령
    onAddLog(`[Data] ${tempFileName} (${rowCount}건) 데이터를 성공적으로 표준화 적재 완료했습니다.`, 'success');
    if (newSnapshot.qualityReport?.privacyMaskedCount && newSnapshot.qualityReport.privacyMaskedCount > 0) {
      onAddLog(`[Data] 적재 과정에서 고객 식별정보(PII) ${newSnapshot.qualityReport.privacyMaskedCount}건이 마스킹 처리되었습니다.`, 'info');
    }
    
    showToast('임포트 데이터가 쇼핑몰 로컬 데이터 센터에 적용되었습니다.', 'success');

    // 리셋 후 프리뷰 탭으로 전환하여 데이터 직접 대조하게 유도
    setTempParsedData(null);
    setTempFullSnapshot(null);
    setUploadStatus('idle');
    if (uploadDomain !== 'all') {
      setPreviewFilter(uploadDomain);
    }
    setActiveSubTab('preview');
  };

  // 5. 파싱 임시 데이터 폐기 (Discard)
  const handleDiscard = () => {
    setTempParsedData(null);
    setTempFullSnapshot(null);
    setUploadStatus('idle');
    setUploadError(null);
    setTempFileName('');
    showToast('업로드 대기 중이던 정보가 지워졌습니다.', 'info');
  };

  // 6. 데모 기본값 복원 (Reset to Demo Data)
  const handleResetDemo = () => {
    if (!confirm('현재 저장된 데이터를 초기 데모 표준 스펙으로 덮어씌우시겠습니까?')) return;
    
    setActiveOperationsData(defaultOperationsData);
    localStorage.setItem('godo.data.activeSnapshot', JSON.stringify(defaultOperationsData));
    localStorage.setItem('godo.data.lastSavedAt', new Date().toISOString());
    
    onAddLog('[Data] 사용자가 로컬 데이터를 Demo 기본 스냅샷으로 복원했습니다.', 'warning');
    showToast('데모 스냅샷 데이터로 복원되었습니다.', 'success');
    setActiveSubTab('overview');
  };

  // 7. Mapping Rules 계산 (Read-only 결과 도출)
  const mappingRules = useMemo(() => {
    const rules = {
      orders: [
        { orig: '주문번호', std: 'orderNo', desc: '고도몰 원본 주문번호', required: true, status: 'mapped' },
        { orig: '주문일자 / 주문일', std: 'orderDate', desc: '주문 등록 시각 (YYYY-MM-DD)', required: true, status: 'mapped' },
        { orig: '주문자 / 고객명', std: 'customerName', desc: '주문자 성함 (PII 마스킹 대상)', required: true, status: 'mapped' },
        { orig: '상품명', std: 'productName', desc: '결제 대상 상품명', required: true, status: 'mapped' },
        { orig: '옵션명', std: 'optionName', desc: '상품 세부 옵션 규격', required: false, status: 'optional' },
        { orig: '수량', std: 'quantity', desc: '구매 수량 (숫자 형식)', required: true, status: 'mapped' },
        { orig: '결제상태', std: 'paymentStatus', desc: '입금대기, 결제완료 등', required: false, status: 'mapped' },
        { orig: '배송상태', std: 'deliveryStatus', desc: '배송대기, 배송중, 배송완료 등', required: false, status: 'mapped' },
        { orig: '송장번호', std: 'invoiceNo', desc: '배송 추적 송장 코드', required: false, status: 'mapped' },
        { orig: '금액 / 결제금액', std: 'amount', desc: '실제 결제액 (숫자 형식)', required: true, status: 'mapped' }
      ],
      inquiries: [
        { orig: '문의일 / 문의일자', std: 'inquiryDate', desc: '문의 작성 시각 (YYYY-MM-DD)', required: true, status: 'mapped' },
        { orig: '분류 / 카테고리', std: 'category', desc: '배송/교환/환불/상품 문의 등', required: false, status: 'mapped' },
        { orig: '고객명 / 작성자', std: 'customerName', desc: '문의 작성자 성함 (PII 마스킹)', required: true, status: 'mapped' },
        { orig: '제목', std: 'title', desc: '문의 요약 헤드라인', required: true, status: 'mapped' },
        { orig: '내용', std: 'content', desc: '문의 상세 본문 (PII 연락처 자동 가림)', required: true, status: 'mapped' },
        { orig: '상태', std: 'status', desc: '미답변, 답변완료', required: false, status: 'mapped' }
      ],
      reviews: [
        { orig: '리뷰일 / 작성일', std: 'reviewDate', desc: '리뷰 생성 시각 (YYYY-MM-DD)', required: true, status: 'mapped' },
        { orig: '상품명', std: 'productName', desc: '리뷰 대상 상품 타이틀', required: true, status: 'mapped' },
        { orig: '평점', std: 'rating', desc: '1~5점 만족도 등급', required: true, status: 'mapped' },
        { orig: '내용 / 리뷰내용', std: 'content', desc: '고객 포토/텍스트 본문', required: false, status: 'mapped' }
      ],
      inventory: [
        { orig: '상품명', std: 'productName', desc: '재고 감시 대상 상품명', required: true, status: 'mapped' },
        { orig: '옵션명', std: 'optionName', desc: '상품 세부 옵션', required: false, status: 'optional' },
        { orig: '재고', std: 'stock', desc: '현재 창고 적재 수량', required: true, status: 'mapped' },
        { orig: '안전재고', std: 'safetyStock', desc: '품절 경보 발령 기준 한계 수치', required: false, status: 'mapped' }
      ],
      sales: [
        { orig: '날짜', std: 'date', desc: '매출 분석 대상 날짜 (YYYY-MM-DD)', required: true, status: 'mapped' },
        { orig: '매출 / 총매출', std: 'totalSales', desc: '일일 합산 매출액', required: true, status: 'mapped' },
        { orig: '주문수', std: 'orderCount', desc: '일일 결제 완료 주문 건수', required: false, status: 'mapped' },
        { orig: '전환율', std: 'conversionRate', desc: '방문 대비 결제 전환 비율 (%)', required: false, status: 'mapped' },
        { orig: '인기상품', std: 'topProducts', desc: '인기 판매 상위 옵션 콤마 분류 리스트', required: false, status: 'mapped' }
      ]
    };
    return rules;
  }, []);

  // 8. Quality Score 라벨 평가
  const qualityScoreLevel = (score: number) => {
    if (score >= 90) return { label: 'GOOD', class: 'score-good' };
    if (score >= 70) return { label: 'WARNING', class: 'score-warning' };
    return { label: 'NEEDS REVIEW', class: 'score-bad' };
  };

  return (
    <div className="data-panel-container">
      {/* A. 타이틀 및 요약 헤더 */}
      <div className="data-header-section">
        <div className="data-title-wrapper">
          <h2 className="data-main-title">🛰️ GODO DATA CONNECTOR</h2>
          <span className="data-subtitle">
            쇼핑몰 운영 데이터를 수집하고 AI 운영 파이프라인에 주입하기 전, 무결성 검증 및 개인정보 가림을 제공하는 안전 적재 레이어입니다.
          </span>
        </div>

        <div className="data-metrics-row">
          <div className="data-metric-box active-source">
            <span className="data-metric-lbl">데이터 소스</span>
            <span className="data-metric-val">{stats.sourceType}</span>
          </div>
          <div className="data-metric-box">
            <span className="data-metric-lbl">주문 건수</span>
            <span className="data-metric-val">{stats.ordersCount}건</span>
          </div>
          <div className="data-metric-box">
            <span className="data-metric-lbl">CS 문의</span>
            <span className="data-metric-val">{stats.inquiriesCount}건</span>
          </div>
          <div className="data-metric-box">
            <span className="data-metric-lbl">리뷰 건수</span>
            <span className="data-metric-val">{stats.reviewsCount}건</span>
          </div>
          <div className="data-metric-box">
            <span className="data-metric-lbl">재고 항목</span>
            <span className="data-metric-val">{stats.inventoryCount}개</span>
          </div>
          <div className="data-metric-box">
            <span className="data-metric-lbl">매출 기간</span>
            <span className="data-metric-val" style={{ fontSize: '0.75rem', marginTop: '0.45rem' }}>
              {stats.salesPeriod}
            </span>
          </div>
          <div className="data-metric-box quality-score-box">
            <span className="data-metric-lbl">데이터 품질 점수</span>
            <span className={`data-metric-val ${qualityScoreLevel(stats.qualityScore).class}`}>
              {stats.qualityScore}점 ({qualityScoreLevel(stats.qualityScore).label})
            </span>
          </div>
          <div className="data-metric-box">
            <span className="data-metric-lbl">개인정보 마스킹</span>
            <span className="data-metric-val" style={{ color: '#00ff88' }}>
              {stats.privacyMaskedCount}건 감지 보호
            </span>
          </div>
        </div>
      </div>

      {/* B. 데이터 탭바 */}
      <div className="data-tab-bar">
        <button className={`data-tab-btn ${activeSubTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveSubTab('overview')}>
          📊 Overview
        </button>
        <button className={`data-tab-btn ${activeSubTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveSubTab('upload')}>
          📥 Upload Center
        </button>
        <button className={`data-tab-btn ${activeSubTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveSubTab('preview')}>
          🔍 Data Preview
        </button>
        <button className={`data-tab-btn ${activeSubTab === 'mapping' ? 'active' : ''}`} onClick={() => setActiveSubTab('mapping')}>
          🧭 Mapping Rules
        </button>
        <button className={`data-tab-btn ${activeSubTab === 'quality' ? 'active' : ''}`} onClick={() => setActiveSubTab('quality')}>
          🛡️ Quality Check
        </button>
        <button className={`data-tab-btn ${activeSubTab === 'privacy' ? 'active' : ''}`} onClick={() => setActiveSubTab('privacy')}>
          🔒 Privacy Masking
        </button>
        <button className={`data-tab-btn ${activeSubTab === 'history' ? 'active' : ''}`} onClick={() => setActiveSubTab('history')}>
          📜 Import History
        </button>
      </div>

      {/* C. 메인 렌더링 카드 */}
      <div className="data-content-body">

        {/* 1) Overview */}
        {activeSubTab === 'overview' && (
          <div className="overview-grid">
            <div className="overview-left">
              <div className="overview-card">
                <h3>🌐 전역 데이터 소스 현황</h3>
                <div className="status-indicator-block">
                  <span className="status-label">현재 가동 소스: </span>
                  <span className="status-value-highlight">{stats.sourceType}</span>
                </div>
                <p className="status-desc">
                  쇼핑몰 어드민 데이터 브릿지가 연결되었습니다. 현재 데이터는 브라우저 보안 샌드박스 내부(LocalStorage)에 정형화 보관되어 있으며, 외부 전송 없이 자율 처리에 즉시 참조됩니다.
                </p>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn secondary" onClick={handleResetDemo}>
                    🔄 Reset to Demo Data
                  </button>
                </div>
              </div>

              <div className="overview-card">
                <h3>⚙️ AI Workflow 연동 상태</h3>
                <div className="workflow-status-indicator">
                  <div className="wf-row">
                    <span>Workflow Engine 연결 상태</span>
                    <span className="wf-val ready">연결됨</span>
                  </div>
                  <div className="wf-row">
                    <span>데이터 소스 주입 상태</span>
                    <span className="wf-val ready">실시간 반영 중</span>
                  </div>
                  <div className="wf-row" style={{ border: 'none' }}>
                    <span>일일 요약 확장 모듈</span>
                    <span className="wf-val ready">호환성 가동 중 (Calendar 연동 준비 완료)</span>
                  </div>
                </div>
                <p className="status-desc" style={{ fontStyle: 'italic', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  * Info: 현재 activeOperationsData가 START OPERATION에 반영되어 일일 에이전트 자동화 실행 및 요약 리포트 작성 시 실시간 활용됩니다.
                </p>
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--line-subtle)', paddingTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '0.74rem', color: 'var(--accent-primary)' }}>📅 날짜별 요약 준비 완료</h4>
                  <p className="status-desc" style={{ fontSize: '0.72rem', margin: '0 0 10px 0' }}>
                    CALENDAR 탭에서 현재 데이터셋의 일자별 운영 요약을 확인할 수 있습니다.
                  </p>
                  <button type="button" className="btn primary" style={{ width: '100%' }} onClick={() => {
                    let recentDate = activeOperationsData.importedAt?.split('T')[0] || new Date().toISOString().split('T')[0];
                    const dates: string[] = [];
                    activeOperationsData.orders.forEach(o => { if (o.orderDate) dates.push(o.orderDate.split(' ')[0]); });
                    activeOperationsData.inquiries.forEach(i => { if (i.inquiryDate) dates.push(i.inquiryDate.split(' ')[0]); });
                    activeOperationsData.reviews.forEach(r => { if (r.reviewDate) dates.push(r.reviewDate.split(' ')[0]); });
                    activeOperationsData.sales.forEach(s => { if (s.date) dates.push(s.date); });
                    if (dates.length > 0) {
                      dates.sort();
                      recentDate = dates[dates.length - 1];
                    }
                    setLastSelectedDate(recentDate);
                    setActiveTab('calendar');
                    onAddLog(`[Data] 캘린더 화면으로 이동하여 최신 데이터 날짜(${recentDate}) 요약을 열람합니다.`, 'info');
                  }}>
                    View in Calendar
                  </button>
                </div>
              </div>
            </div>

            <div className="overview-right">
              <div className="overview-card">
                <h3>📌 일일 현황 요약 (Daily Summary)</h3>
                <div className="overview-metrics-grid">
                  <div className="overview-sub-metric">
                    <span className="ov-lbl">오늘 주문</span>
                    <span className="ov-val">{activeOperationsData.orders.length}건</span>
                  </div>
                  <div className="overview-sub-metric">
                    <span className="ov-lbl">미답변 문의</span>
                    <span className="ov-val danger">
                      {activeOperationsData.inquiries.filter(i => i.status !== '답변완료').length}건
                    </span>
                  </div>
                  <div className="overview-sub-metric">
                    <span className="ov-lbl">재고 위험 상품</span>
                    <span className="ov-val warning">
                      {activeOperationsData.inventory.filter(i => i.status !== 'ok').length}개
                    </span>
                  </div>
                  <div className="overview-sub-metric">
                    <span className="ov-lbl">송장 누락</span>
                    <span className="ov-val danger">
                      {activeOperationsData.orders.filter(o => o.riskFlags.includes('invoice_missing')).length}건
                    </span>
                  </div>
                  <div className="overview-sub-metric">
                    <span className="ov-lbl">부정 평점 리뷰</span>
                    <span className="ov-val warning">
                      {activeOperationsData.reviews.filter(r => r.rating <= 2).length}건
                    </span>
                  </div>
                  <div className="overview-sub-metric">
                    <span className="ov-lbl">데이터 품질 점수</span>
                    <span className="ov-val success">{stats.qualityScore}점</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2) Upload Center */}
        {activeSubTab === 'upload' && (
          <div className="upload-grid-layout">
            <aside className="upload-sidebar">
              <h3 className="upload-sidebar-title">적재 설정</h3>
              <div className="form-group">
                <label>데이터 도메인 유형</label>
                <select value={uploadDomain} onChange={(e) => setUploadDomain(e.target.value as DataDomain | 'all')}>
                  <option value="orders">주문 데이터 (Orders)</option>
                  <option value="inquiries">CS 고객 문의 (Inquiries)</option>
                  <option value="reviews">리뷰 데이터 (Reviews)</option>
                  <option value="inventory">안전 재고 수준 (Inventory)</option>
                  <option value="sales">일일 매출 요약 (Sales)</option>
                  <option value="all">Full Snapshot (.json 전용)</option>
                </select>
              </div>

              <div className="form-group">
                <label>파일 드롭 및 선택</label>
                <div
                  className={`dropzone-container ${dragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="dropzone-icon">📁</span>
                  <span className="dropzone-text">JSON 또는 CSV 파일을 마우스 드래그 혹은 클릭해서 등록하세요.</span>
                  <button type="button" className="select-file-btn">
                    파일 선택
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileSelect}
                    className="file-input-hidden"
                  />
                </div>
              </div>

              <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: '1.4' }}>
                * 지원 파일: <strong>.json, .csv</strong> <span className="excel-badge">EXCEL 지원예정</span><br />
                * 주의: 원본 고객 데이터는 외부 서버로 전송되지 않으며 오직 브라우저 내부 메모리에서만 안전하게 파싱 및 마스킹 처리됩니다.
              </div>
            </aside>

            <main className="upload-main-pane">
              {uploadStatus === 'idle' && (
                <div className="empty-data-message">
                  왼쪽 가이드에 따라 적재할 쇼핑몰 원본 파일 데이터를 업로드해 주세요.
                </div>
              )}

              {uploadStatus === 'parsing' && (
                <div className="empty-data-message">
                  ⏳ 파일을 불러와 유효성 분석 및 한국어 컬럼 매핑을 대조 중입니다...
                </div>
              )}

              {uploadStatus === 'error' && (
                <div className="error-box">
                  <strong>❌ 파싱 실패</strong>
                  <span>{uploadError}</span>
                  <button type="button" className="btn secondary" style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }} onClick={handleDiscard}>
                    취소 후 다시 시도
                  </button>
                </div>
              )}

              {(uploadStatus === 'success' || uploadStatus === 'warning') && (
                <div className="upload-success-result">
                  <div className="result-card">
                    <h4 className="result-title">
                      {uploadStatus === 'warning' ? '⚠️ 데이터 분석 완료 (경고 포함)' : '✨ 데이터 분석 및 표준화 성공'}
                    </h4>
                    <div className="result-meta-list">
                      <span>• 업로드 파일: <strong>{tempFileName}</strong></span>
                      <span>• 임포트 도메인: <strong>{uploadDomain.toUpperCase()}</strong></span>
                      {tempFullSnapshot ? (
                        <span>• 전체 행 개수: <strong>주문 {tempFullSnapshot.orders.length}건 / CS {tempFullSnapshot.inquiries.length}건 / 리뷰 {tempFullSnapshot.reviews.length}건 등</strong></span>
                      ) : (
                        <span>• 감지된 행 개수: <strong>{tempParsedData?.length}행</strong></span>
                      )}
                      <span>• 상태: <strong style={{ color: uploadStatus === 'warning' ? '#ffb300' : '#00ff88' }}>{uploadStatus.toUpperCase()}</strong></span>
                    </div>

                    {uploadStatus === 'warning' && (
                      <div className="warning-box" style={{ marginTop: '0.75rem' }}>
                        <span>⚠️ 필수 필드가 일부 누락되어 파싱 경고가 떴습니다. Preview와 Mapping Rules 탭을 검사해 주세요.</span>
                      </div>
                    )}
                  </div>

                  <div className="result-actions">
                    <button type="button" className="btn primary" onClick={handleSaveImported}>
                      💾 Save Imported Data (로컬 데이터 적용)
                    </button>
                    <button type="button" className="btn secondary" onClick={handleDiscard}>
                      🗑️ Discard
                    </button>
                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {/* 3) Data Preview */}
        {activeSubTab === 'preview' && (
          <div className="preview-pane-wrapper">
            <div className="preview-filter-bar">
              <div className="preview-tabs">
                {(['orders', 'inquiries', 'reviews', 'inventory', 'sales'] as DataDomain[]).map((d) => (
                  <button
                    key={d}
                    className={`p-tab-btn ${previewFilter === d ? 'active' : ''}`}
                    onClick={() => setPreviewFilter(d)}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="table-stats-info">
                총 데이터 수: <strong>{
                  previewFilter === 'orders' ? activeOperationsData.orders.length :
                  previewFilter === 'inquiries' ? activeOperationsData.inquiries.length :
                  previewFilter === 'reviews' ? activeOperationsData.reviews.length :
                  previewFilter === 'inventory' ? activeOperationsData.inventory.length :
                  activeOperationsData.sales.length
                }건</strong> (최대 100행 출력)
              </div>
            </div>

            <div className="preview-table-scroller">
              <table className="preview-table">
                {previewFilter === 'orders' && (
                  <>
                    <thead>
                      <tr>
                        <th>주문번호</th>
                        <th>주문자명(마스킹)</th>
                        <th>주문일자</th>
                        <th>상품명</th>
                        <th>옵션명</th>
                        <th>수량</th>
                        <th>금액</th>
                        <th>상태</th>
                        <th>위험 플래그</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOperationsData.orders.slice(0, 100).map((o) => (
                        <tr key={o.id} className={o.riskFlags.length > 0 ? 'warning-row' : ''}>
                          <td className="bold-cell">{o.orderNo}</td>
                          <td>{o.customerNameMasked}</td>
                          <td>{o.orderDate}</td>
                          <td>{o.productName}</td>
                          <td>{o.optionName}</td>
                          <td>{o.quantity}</td>
                          <td>{o.amount.toLocaleString()}원</td>
                          <td>{o.paymentStatus} | {o.deliveryStatus}</td>
                          <td>
                            {o.riskFlags.map(f => (
                              <span key={f} className={`flag-badge ${f === 'delivery_delayed' ? 'danger' : ''}`}>{f}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {previewFilter === 'inquiries' && (
                  <>
                    <thead>
                      <tr>
                        <th>문의일</th>
                        <th>고객명(마스킹)</th>
                        <th>분류</th>
                        <th>제목</th>
                        <th>상태</th>
                        <th>우선순위</th>
                        <th>감정</th>
                        <th>위험 플래그</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOperationsData.inquiries.slice(0, 100).map((i) => (
                        <tr key={i.id} className={i.riskFlags.length > 0 ? 'warning-row' : ''}>
                          <td>{i.inquiryDate}</td>
                          <td>{i.customerNameMasked}</td>
                          <td><span className="flag-badge success">{i.category}</span></td>
                          <td className="bold-cell" title={i.content}>{i.title}</td>
                          <td>{i.status}</td>
                          <td>{i.priority}</td>
                          <td>{i.sentiment}</td>
                          <td>
                            {i.riskFlags.map(f => (
                              <span key={f} className="flag-badge danger">{f}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {previewFilter === 'reviews' && (
                  <>
                    <thead>
                      <tr>
                        <th>작성일</th>
                        <th>상품명</th>
                        <th>평점</th>
                        <th>리뷰 본문</th>
                        <th>감정</th>
                        <th>답변 필요</th>
                        <th>위험 플래그</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOperationsData.reviews.slice(0, 100).map((r) => (
                        <tr key={r.id} className={r.riskFlags.length > 0 ? 'warning-row' : ''}>
                          <td>{r.reviewDate}</td>
                          <td className="bold-cell">{r.productName}</td>
                          <td style={{ color: r.rating <= 2 ? '#ff4d4d' : '#00ff88', fontWeight: 600 }}>{r.rating} / 5</td>
                          <td>{r.content}</td>
                          <td>{r.sentiment}</td>
                          <td>{r.needsReply ? '필요 (Yes)' : '불필요 (No)'}</td>
                          <td>
                            {r.riskFlags.map(f => (
                              <span key={f} className="flag-badge danger">{f}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {previewFilter === 'inventory' && (
                  <>
                    <thead>
                      <tr>
                        <th>상품명</th>
                        <th>옵션명</th>
                        <th>현재고</th>
                        <th>안전재고</th>
                        <th>위험수준</th>
                        <th>위험 플래그</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOperationsData.inventory.slice(0, 100).map((iv) => (
                        <tr key={iv.id} className={iv.status !== 'ok' ? (iv.status === 'danger' ? 'error-row' : 'warning-row') : ''}>
                          <td className="bold-cell">{iv.productName}</td>
                          <td>{iv.optionName}</td>
                          <td style={{ fontWeight: 700 }}>{iv.stock}개</td>
                          <td>{iv.safetyStock}개</td>
                          <td>
                            <span className={`flag-badge ${iv.status === 'danger' ? 'danger' : (iv.status === 'warning' ? '' : 'success')}`}>
                              {iv.status.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            {iv.riskFlags.map(f => (
                              <span key={f} className="flag-badge danger">{f}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {previewFilter === 'sales' && (
                  <>
                    <thead>
                      <tr>
                        <th>날짜</th>
                        <th>일매출</th>
                        <th>주문 건수</th>
                        <th>결제 전환율</th>
                        <th>인기 카테고리/상품</th>
                        <th>메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOperationsData.sales.slice(0, 100).map((s) => (
                        <tr key={s.date}>
                          <td className="bold-cell">{s.date}</td>
                          <td style={{ fontWeight: 700, color: '#00ff88' }}>{s.totalSales.toLocaleString()}원</td>
                          <td>{s.orderCount}건</td>
                          <td>{s.conversionRate}%</td>
                          <td>{s.topProducts.join(', ')}</td>
                          <td>{s.memo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>

            <div className="preview-footer-action-bar">
              <button type="button" className="btn secondary" onClick={handleResetDemo}>
                🔄 Reset to Demo Data
              </button>
            </div>
          </div>
        )}

        {/* 4) Mapping Rules */}
        {activeSubTab === 'mapping' && (
          <div className="mapping-rules-wrapper">
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#00ff88' }}>🧭 E-Commerce 표준화 자동 매핑 가이드라인</h3>
            <div className="mapping-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>분류</th>
                    <th>한국어 원본 컬럼명 (대조)</th>
                    <th>표준 키 필드 (Standard Key)</th>
                    <th>설명 및 규격</th>
                    <th>필수 여부</th>
                    <th>매핑 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(mappingRules).flatMap(([domain, list]) => 
                    list.map((r, i) => (
                      <tr key={`${domain}-${i}`}>
                        <td className="bold-cell">{domain.toUpperCase()}</td>
                        <td style={{ color: '#00ff88' }}>{r.orig}</td>
                        <td className="mono-cell">{r.std}</td>
                        <td>{r.desc}</td>
                        <td>{r.required ? <span style={{ color: '#ff4d4d' }}>REQUIRED</span> : 'OPTIONAL'}</td>
                        <td>
                          <span className={`mapping-status-pill ${r.status}`}>
                            {r.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5) Quality Check */}
        {activeSubTab === 'quality' && (
          <div className="quality-check-wrapper">
            <h3 style={{ margin: '0', fontSize: '0.9rem', color: '#00ff88' }}>🛡️ 데이터 무결성 및 적재 품질 점검 결과</h3>
            <div className="quality-report-grid">
              <div className="quality-stat-card good">
                <span className="q-card-lbl">총 행 개수</span>
                <span className="q-card-val success">
                  {activeOperationsData.qualityReport?.totalRows ?? 0}행
                </span>
              </div>
              <div className="quality-stat-card good">
                <span className="q-card-lbl">무결성 통과 행</span>
                <span className="q-card-val success">
                  {activeOperationsData.qualityReport?.validRows ?? 0}행
                </span>
              </div>
              <div className="quality-stat-card warn">
                <span className="q-card-lbl">누락 데이터 의심</span>
                <span className="q-card-val warn">
                  {activeOperationsData.qualityReport?.warningRows ?? 0}건
                </span>
              </div>
              <div className="quality-stat-card err">
                <span className="q-card-lbl">파싱 실패/에러 행</span>
                <span className="q-card-val err">
                  {activeOperationsData.qualityReport?.errorRows ?? 0}행
                </span>
              </div>
            </div>

            <div className="quality-feedback-list-card">
              <h4 className="feedback-section-title">📝 품질 가이드라인 피드백</h4>
              <div className="feedback-items-scroller">
                {activeOperationsData.qualityReport?.notes && activeOperationsData.qualityReport.notes.length > 0 ? (
                  activeOperationsData.qualityReport.notes.map((note, index) => (
                    <span key={index} className="feedback-bullet">{note}</span>
                  ))
                ) : (
                  <span className="feedback-bullet">모든 데이터 무결성 검증을 완벽하게 통과했습니다.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 6) Privacy Masking */}
        {activeSubTab === 'privacy' && (
          <div className="privacy-masking-wrapper">
            <div className="overview-card">
              <h3>🔒 개인 식별 정보(PII) 마스킹 집계</h3>
              <div className="workflow-status-indicator" style={{ marginTop: '1rem' }}>
                <div className="wf-row">
                  <span>마스킹된 고객명 수</span>
                  <span className="wf-val ready">{activeOperationsData.qualityReport?.privacyMaskedCount ?? 0}건</span>
                </div>
                <div className="wf-row">
                  <span>연락처 암호화 마스킹</span>
                  <span className="wf-val ready">자동 활성화 (100%)</span>
                </div>
                <div className="wf-row">
                  <span>이메일 주소 패턴 마스킹</span>
                  <span className="wf-val ready">자동 활성화 (100%)</span>
                </div>
                <div className="wf-row" style={{ border: 'none' }}>
                  <span>상세 주소 마스킹</span>
                  <span className="wf-val ready">자동 활성화 (100%)</span>
                </div>
              </div>
            </div>

            <div className="privacy-comparison-card">
              <h4>🛡️ PII 보안 전처리 대조표</h4>
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>데이터 타입</th>
                    <th>원본 데이터 상태</th>
                    <th>표시 및 저장 상태</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="bold-cell">고객 이름</td>
                    <td className="protected">보호됨 (차단)</td>
                    <td className="masked">홍*동 (마스킹)</td>
                  </tr>
                  <tr>
                    <td className="bold-cell">휴대폰 번호</td>
                    <td className="protected">보호됨 (차단)</td>
                    <td className="masked">***-****-**** (마스킹)</td>
                  </tr>
                  <tr>
                    <td className="bold-cell">이메일 주소</td>
                    <td className="protected">보호됨 (차단)</td>
                    <td className="masked">ab***@test.com (마스킹)</td>
                  </tr>
                  <tr>
                    <td className="bold-cell">주소 정보</td>
                    <td className="protected">보호됨 (차단)</td>
                    <td className="masked">서울시 강남구 *** *** (마스킹)</td>
                  </tr>
                </tbody>
              </table>
              <span className="input-helper-text" style={{ fontSize: '0.65rem', display: 'block', marginTop: '0.85rem', color: '#64748b' }}>
                * 보안 정책: 본 시스템은 Activity Log나 Preview 화면, 데이터베이스 저장 시 개인 식별이 가능한 원본 정보를 완벽하게 제거하며 어떠한 로그에도 영구 노출되지 않습니다.
              </span>
            </div>
          </div>
        )}

        {/* 7) Import History */}
        {activeSubTab === 'history' && (
          <div className="history-pane-wrapper">
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#00ff88' }}>📜 쇼핑몰 데이터 적재 로그 (Import History)</h3>
            <div className="history-table-scroller">
              {importHistory.length === 0 ? (
                <div className="empty-data-message">이전 데이터 적재 이력이 비어 있습니다.</div>
              ) : (
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>등록 시각</th>
                      <th>파일명</th>
                      <th>도메인</th>
                      <th>데이터 유형</th>
                      <th>행 수</th>
                      <th>품질 점수</th>
                      <th>적재 상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map((item) => (
                      <tr key={item.id}>
                        <td className="mono-cell">{item.timestamp}</td>
                        <td className="bold-cell">{item.fileName}</td>
                        <td>{item.domain.toUpperCase()}</td>
                        <td>{item.sourceType.toUpperCase()}</td>
                        <td>{item.rowCount}행</td>
                        <td style={{ fontWeight: 700, color: item.qualityScore >= 90 ? '#00ff88' : '#ffb300' }}>
                          {item.qualityScore}점
                        </td>
                        <td>
                          <span className={`history-status-pill ${item.status}`}>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Toast Notification Container */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

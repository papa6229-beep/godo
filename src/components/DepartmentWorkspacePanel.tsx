import React, { useState, useEffect, useMemo, useRef } from 'react';
import './DepartmentWorkspacePanel.css';
import {
  fetchAdminProducts,
  fetchRevenue,
  fetchCatalog,
  type AdminProductsResult,
  type RevenueResult,
  type CatalogLookupResult
} from '../services/departmentDataService';
import { ProductTeamDashboard } from './ProductTeamDashboard';
import { CsTeamDashboard } from './CsTeamDashboard';
import { MarketingAnalysisDashboard } from './MarketingAnalysisDashboard';
import { loadDeptChatLog, saveDeptChatLog, type DeptChatMessage } from '../services/departmentChatMemory';
import { chatWithTeam } from '../services/departmentChatService';
import { buildProductTeamChatFacts } from '../services/productTeamChatFacts';
import { buildDepartmentFactsBundleFromUniverse, type DepartmentFactsBundle } from '../services/departmentFactsRouting';
import { buildDepartmentChatContext, toChatTeam } from '../services/departmentChatFacts';
import { buildMarketingChatContext } from '../services/marketingTeamChatFacts';
import { runMarketingChartRequest, type MarketingChatChartArtifact } from '../services/marketingChatChartSpec';
import { runMarketingAnalyticsQueryBridge } from '../services/marketingAnalyticsQueryBridge';
import { buildMarketingIntelligenceResponseWithLlm } from '../services/marketingLlmPlannerAdapter';
import { buildMarketingScopeInsightResponse } from '../services/marketingScopeInsightEngine';
import { createMarketingAnalysisMemoryEntry, saveMarketingAnalysisMemoryEntry, findSimilarMarketingAnalysisMemories } from '../services/marketingAnalysisMemory';
import { callMarketingPlannerLlm } from '../services/departmentChatService';
import { runCsDraftRequest } from '../services/csDraftRuntime';

// ────────────────────────────────────────────────────────────────────────────
// 부서 업무 관장 (Department Workspace) — 1차 뼈대(shell)
//
// 역할: 쇼핑몰 연동 탭이 "데이터를 끌어오는 배관실"이라면, 이 탭은 운영자가
// 끌어온 데이터를 팀별로 보고·선택·질문·명령하는 "업무 공간"이다.
//
// ⚠️ 이번 단계는 빈 사무실(화면 뼈대)만 만든다.
//   - 실제 데이터/표/필터/목록 출력 없음 (placeholder만)
//   - 실제 AI/LLM/API 호출 없음 (우측 채팅은 미리보기 응답만)
//
// 다음 단계 데이터 연결 계획(구조만 팀 단위로 분리해 둠):
//   상품관리팀 → Products REAL READ
//   CS팀       → Inquiries / Reviews
//   마케팅팀    → Sales / Products / Campaign
//   총괄팀      → 모든 팀 요약 + Approval Queue
// ────────────────────────────────────────────────────────────────────────────

type TeamId = 'hq' | 'product' | 'cs' | 'marketing';

interface TeamConfig {
  id: TeamId;
  emoji: string;
  name: string;
  roleSummary: string;
  lead: string;
  members: string[];
  mission: string;
  dashboardTitle: string;
  dashboardDesc: string;
  chatTitle: string;
  chatPlaceholder: string;
  // 다음 단계에서 연결할 데이터 출처 (현재는 안내 문구로만 노출)
  futureDataNote: string;
}

const TEAMS: TeamConfig[] = [
  {
    id: 'hq',
    emoji: '🏛️',
    name: '총괄팀',
    roleSummary: '부서별 업무 상태와 승인 대기 항목을 조율',
    lead: '총괄 매니저 AI',
    members: ['전체 부서'],
    mission: '부서별 업무 상태와 승인 대기 항목을 조율합니다.',
    dashboardTitle: '총괄팀 대시보드',
    dashboardDesc: '전체 부서의 업무 상태, 위험 알림, 승인 대기 항목을 이곳에서 확인할 예정입니다.',
    chatTitle: '총괄팀에게 지시하기',
    chatPlaceholder: '예: 오늘 위험한 업무만 요약해줘',
    futureDataNote: '다음 단계 연결 예정: 모든 팀 요약 + Approval Queue'
  },
  {
    id: 'product',
    emoji: '🏷️',
    name: '상품관리팀',
    roleSummary: '상품·재고·노출상태·판매상태 점검',
    lead: '상품 관리 AI',
    members: ['주문 확인 AI', '재고 감시 AI'],
    mission: '상품, 재고, 노출상태, 판매상태를 점검합니다.',
    dashboardTitle: '상품관리팀 대시보드',
    dashboardDesc: '상품 목록, 카테고리, 재고, 품절, 노출상태, 판매상태를 이곳에서 확인할 예정입니다.',
    chatTitle: '상품관리팀에게 지시하기',
    chatPlaceholder: '예: 미결제 주문만 보여줘',
    futureDataNote: '연결됨: Products REAL READ · Orders READ v0 (관리자 주문)'
  },
  {
    id: 'cs',
    emoji: '💬',
    name: 'CS팀',
    roleSummary: '문의·리뷰·배송 이슈 확인',
    lead: 'CS 상담 AI',
    members: ['배송 추적 AI', '리뷰 답글 AI'],
    mission: '문의, 리뷰, 배송 이슈를 확인합니다.',
    dashboardTitle: 'CS팀 대시보드',
    dashboardDesc: '고객 문의, 리뷰, 답변 대기, 불만 이슈를 이곳에서 확인할 예정입니다.',
    chatTitle: 'CS팀에게 지시하기',
    chatPlaceholder: '예: 답변 대기 문의만 정리해줘',
    futureDataNote: '다음 단계 연결 예정: Inquiries / Reviews 데이터'
  },
  {
    id: 'marketing',
    emoji: '📊',
    name: '마케팅팀',
    roleSummary: '판매 흐름·캠페인 후보 점검',
    lead: '마케팅 기획 AI',
    members: ['매출 분석 AI'],
    mission: '판매 흐름과 캠페인 후보를 점검합니다.',
    dashboardTitle: '마케팅팀 대시보드',
    dashboardDesc: '판매 현황, 인기 상품, 캠페인 후보, 매출 흐름을 이곳에서 확인할 예정입니다.',
    chatTitle: '마케팅팀에게 지시하기',
    chatPlaceholder: '예: 인기 상품 기준으로 캠페인 후보를 뽑아줘',
    futureDataNote: '다음 단계 연결 예정: Sales / Products / Campaign 데이터'
  }
];

// 중앙 대시보드 placeholder 카드 (실제 수치 아님 — 미연결 상태 명시)
const PLACEHOLDER_CARDS = [
  { key: 'todo', label: '오늘 확인할 항목', icon: '📋' },
  { key: 'warning', label: '주의가 필요한 항목', icon: '⚠️' },
  { key: 'recent', label: '최근 업데이트', icon: '🔄' },
  { key: 'pending', label: '대기 중인 요청', icon: '⏳' }
];

type ChatMessage = DeptChatMessage;


export const DepartmentWorkspacePanel: React.FC = () => {
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>('hq');
  // 팀별 채팅 기록 — localStorage에서 복원(탭 이동/새로고침 유지, 팀별 분리)
  const [chatLog, setChatLog] = useState<Record<TeamId, ChatMessage[]>>(() => loadDeptChatLog());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // 마케팅 chartSpec artifact(비영속 — localStorage 미저장). 다음 작업의 중앙 smart chart가 읽어갈 payload.
  const [marketingChartArtifact, setMarketingChartArtifact] = useState<MarketingChatChartArtifact | null>(null);
  const [marketingMemoryHintCount, setMarketingMemoryHintCount] = useState(0);

  useEffect(() => {
    saveDeptChatLog(chatLog);
  }, [chatLog]);

  // 상품관리팀 대시보드 데이터 (Products 13개 + orders-revenue?includeSynthetic=true)
  const [productData, setProductData] = useState<{
    products: AdminProductsResult | null;
    revenue: RevenueResult | null;
    catalog: CatalogLookupResult | null;
    loading: boolean;
    loaded: boolean;
  }>({ products: null, revenue: null, catalog: null, loading: false, loaded: false });

  // Commerce Universe 공용 데이터 로드 — 모든 부서 채팅이 공유(상품 대시보드 + facts bundle).
  // includeUniverseAux: customers/reviews/inquiries(safe, PII 없음).
  // includeCsFakeContacts: CS 응대 시뮬레이션용 fake contact — bundle이 csTeam에만 격리 배치.
  const loadProductTeamData = async () => {
    setProductData((prev) => ({ ...prev, loading: true }));
    const [products, revenue, catalog] = await Promise.all([
      fetchAdminProducts(),
      fetchRevenue(true, 'commerce_universe_v1', { includeUniverseAux: true, includeCsFakeContacts: true }),
      fetchCatalog()
    ]);
    setProductData({ products, revenue, catalog, loading: false, loaded: true });
  };

  // 팀 선택 — 어느 팀이든 처음 선택하면 공용 데이터 1회 로드(부서별 facts bundle 재료).
  const handleSelectTeam = (id: TeamId) => {
    setSelectedTeamId(id);
    if (!productData.loaded && !productData.loading) {
      void loadProductTeamData();
    }
  };

  // goodsNo → 상품명 (CS 문의/리뷰 detail에서 상품명 표시용; PII 아님).
  const goodsNameMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const o of productData.revenue?.orders || []) {
      for (const l of o.lines) if (l.goodsNo && l.goodsName && !m[l.goodsNo]) m[l.goodsNo] = l.goodsName;
    }
    return m;
  }, [productData.revenue]);

  // DepartmentFactsBundle — orders + universeAux로 부서별 슬라이스 생성(역할 경계 유지).
  // fake contact는 buildDepartmentFactsBundleFromUniverse가 csTeam.fakeContacts에만 배치.
  const departmentFactsBundle = useMemo<DepartmentFactsBundle | null>(() => {
    const rev = productData.revenue;
    if (!rev || !rev.orders.length) return null;
    return buildDepartmentFactsBundleFromUniverse({
      orders: rev.orders,
      customers: rev.universeAux?.customers,
      reviews: rev.universeAux?.reviews,
      inquiries: rev.universeAux?.inquiries,
      contactsForCsOnly: rev.universeAux?.csOnlyFakeContacts,
      catalog: productData.catalog ?? undefined,
      source: { dataKind: 'synthetic', syntheticSource: rev.syntheticSource }
    });
  }, [productData.revenue, productData.catalog]);

  const team = TEAMS.find((t) => t.id === selectedTeamId) as TeamConfig;
  const messages = chatLog[selectedTeamId];

  // 채팅 자동 스크롤 — 새 메시지/작성중 상태 변경 시 최하단으로(답변 높이 반영 후 rAF로 한 번 더).
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatLogRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [messages, sending, selectedTeamId]);

  // 가상 소스 표기(배지/요약용). 기본 Commerce Universe.
  const synSourceLabel = (): string => {
    const src = productData.revenue?.syntheticSource;
    if (src === 'commerce_universe_v1') return 'Commerce Universe';
    if (src === 'godoRaw') return 'godoRaw';
    if (src === 'legacy') return 'legacy';
    return 'synthetic';
  };

  // 상품관리팀 매출/재고 데이터를 AI 참고용 요약으로 변환 (로드된 경우에만)
  const buildProductContextNote = (): string | undefined => {
    const s = productData.revenue?.summary;
    if (!s) return undefined;
    return (
      `상품관리팀 매출 요약(실 ${s.realOrderCount}건 + ${synSourceLabel()} 가상 ${s.syntheticOrderCount}건): ` +
      `상품매출 ${s.productRevenueByLines.toLocaleString()}원, 배송비 ${s.deliveryFeeTotal.toLocaleString()}원, ` +
      `총주문금액 ${s.totalAmount.toLocaleString()}원, 결제완료 ${s.paidOrderCount} / 미결제 ${s.unpaidOrderCount} / ` +
      `구매확정 ${s.confirmedOrderCount} / 취소 ${s.canceledOrderCount}. ` +
      `재고추적 ${s.syntheticTrackedProductCount}종, 순판매 ${s.syntheticTotalNetSoldQuantity}개. ` +
      `(실 고도몰 상품 + ${synSourceLabel()} synthetic 매출/재고 기준)`
    );
  };

  // 우측 명령 전송 — 선택된 팀의 AI 팀장(기본 AI 경유)에게 실제 질의한다.
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const teamId = selectedTeamId;
    setChatLog((prev) => ({ ...prev, [teamId]: [...prev[teamId], { role: 'user', text }] }));
    setInput('');
    setSending(true);
    // 각 팀은 자기 facts만 본다(역할 경계). 숫자는 코드가 계산한 facts만 근거.
    let opts: { contextNote?: string; answerGuidance?: string } | undefined;
    if (teamId === 'product') {
      // 상품팀: 기존 grounding facts(기간 파싱 등)를 우선, 미로드 시 bundle/요약 fallback.
      const facts = buildProductTeamChatFacts(text, productData.revenue, productData.catalog ?? undefined);
      if (facts) {
        opts = { contextNote: facts.facts.join('\n'), answerGuidance: facts.answerGuidance };
      } else {
        const ctx = buildDepartmentChatContext('product', departmentFactsBundle);
        opts = ctx ?? { contextNote: buildProductContextNote() };
      }
    } else if (teamId === 'marketing') {
      const rev = productData.revenue;
      if (rev?.orders?.length) {
        // -1순위: Analytics Query Bridge — 공통 AnalyticsQuery로 먼저 해석(지원 조합만 처리, 나머지 null→기존 경로).
        //   기존 broken compiler/scope가 선점하지 못하게 앞단에 둔다. wrong data 반환 없음(null이면 fallback).
        const bridge = await runMarketingAnalyticsQueryBridge({ message: text, orders: rev.orders, products: productData.products?.products, callLlm: callMarketingPlannerLlm });
        if (bridge && bridge.handled && bridge.reply) {
          setChatLog((prev) => ({ ...prev, [teamId]: [...prev[teamId], { role: 'system', text: bridge.reply }] }));
          setMarketingChartArtifact(bridge.suppressChart ? null : (bridge.artifact ?? null));
          try {
            const hints = findSimilarMarketingAnalysisMemories({ question: text, limit: 5 });
            setMarketingMemoryHintCount(hints.length);
            saveMarketingAnalysisMemoryEntry(createMarketingAnalysisMemoryEntry({ question: text, artifact: bridge.artifact ?? null, resultType: 'calculated', plannerSource: 'marketingIntelligencePlanner' }));
          } catch { /* ignore safely */ }
          setSending(false);
          return;
        }
        // 0순위: Scope Insight Engine(질문→분석 범위→insight pack). 깊은 보조 분석 + 안정 chartSpec.
        const scopeInsight = buildMarketingScopeInsightResponse({ message: text, orders: rev.orders, products: productData.products?.products, reviews: rev.universeAux?.reviews, inquiries: rev.universeAux?.inquiries });
        if (scopeInsight.handled && scopeInsight.reply) {
          setChatLog((prev) => ({ ...prev, [teamId]: [...prev[teamId], { role: 'system', text: scopeInsight.reply }] }));
          // 차트 억제 요청("그래프 보여주지 마")이면 이전 그래프를 비우고 답변 텍스트만 표시.
          setMarketingChartArtifact(scopeInsight.suppressChart ? null : (scopeInsight.artifact ?? null));
          try {
            const hints = findSimilarMarketingAnalysisMemories({ question: text, limit: 5 });
            setMarketingMemoryHintCount(hints.length);
            saveMarketingAnalysisMemoryEntry(createMarketingAnalysisMemoryEntry({ question: text, artifact: scopeInsight.artifact, resultType: 'calculated', plannerSource: 'marketingIntelligencePlanner' }));
          } catch { /* ignore safely */ }
          setSending(false);
          return;
        }
        // 1순위(scope 미처리): Intelligence Planner(deterministic 우선, 빈약하면 LLM planner 보강 — 숫자는 코드가 계산).
        const intel = await buildMarketingIntelligenceResponseWithLlm({ message: text, orders: rev.orders, products: productData.products?.products, reviews: rev.universeAux?.reviews, inquiries: rev.universeAux?.inquiries, callPlannerLlm: callMarketingPlannerLlm });
        if (intel.handled && intel.reply && intel.artifact) {
          setChatLog((prev) => ({ ...prev, [teamId]: [...prev[teamId], { role: 'system', text: intel.reply as string }] }));
          setMarketingChartArtifact(intel.artifact);
          // 비PII 분석 메모리 저장 + 최근 유사 분석 힌트 수(저장 실패가 앱을 깨면 안 됨).
          try {
            const hints = findSimilarMarketingAnalysisMemories({ question: text, plan: intel.plan, limit: 5 });
            setMarketingMemoryHintCount(hints.length);
            saveMarketingAnalysisMemoryEntry(createMarketingAnalysisMemoryEntry({ question: text, plan: intel.plan, artifact: intel.artifact, resultType: intel.result?.narrative.answerType }));
          } catch { /* ignore safely */ }
          setSending(false);
          return;
        }
        // 1순위(planner 미처리): 기존 fixed-intent chartSpec bridge가 코드로 답하고 artifact 보관.
        const chart = runMarketingChartRequest({ message: text, orders: rev.orders, products: productData.products?.products });
        if (chart.handled) {
          setChatLog((prev) => ({ ...prev, [teamId]: [...prev[teamId], { role: 'system', text: chart.reply }] }));
          setMarketingChartArtifact(chart.artifact ?? null);
          try {
            const hints = findSimilarMarketingAnalysisMemories({ question: text, limit: 5 });
            setMarketingMemoryHintCount(hints.length);
            saveMarketingAnalysisMemoryEntry(createMarketingAnalysisMemoryEntry({ question: text, artifact: chart.artifact ?? null, resultType: 'calculated' }));
          } catch { /* ignore safely */ }
          setSending(false);
          return;
        }
      }
      // 2순위(차트 의도 아님): 대시보드와 동일한 buildMarketingAnalysisFacts 기반 context로 LLM 답변.
      const mkt = rev?.orders?.length
        ? buildMarketingChatContext(text, {
            orders: rev.orders,
            products: productData.products?.products,
            reviews: rev.universeAux?.reviews,
            inquiries: rev.universeAux?.inquiries,
            period: { preset: 'all' }
          })
        : null;
      if (mkt) {
        opts = mkt;
      } else {
        const ctx = buildDepartmentChatContext('marketing', departmentFactsBundle);
        opts = ctx ?? {
          answerGuidance:
            '현재 마케팅 분석 facts가 아직 준비되지 않았습니다. 사용자에게 "데이터를 불러오는 중이니 잠시 후 다시 시도하거나 새로고침해 주세요"라고 안내하세요. 숫자를 추측하지 마세요.'
        };
      }
    } else {
      // CS/총괄: DepartmentFactsBundle의 자기 슬라이스만 사용.
      const chatTeam = toChatTeam(teamId);
      // CS: safe inquiry/review detail shortlist를 함께 전달(개별 문의/리뷰 질문 응답용, PII 없음).
      const rev = productData.revenue;
      // CS 답변 초안 요청이면 LLM 없이 composer가 직접 처리(코드가 주도권). 종결형 customerDraft만 출력.
      if (chatTeam === 'cs' && rev?.universeAux?.inquiries?.length && rev.orders?.length) {
        const draft = runCsDraftRequest({ userText: text, inquiries: rev.universeAux.inquiries, orders: rev.orders });
        if (draft.handled) {
          setChatLog((prev) => ({ ...prev, [teamId]: [...prev[teamId], { role: 'system', text: draft.reply }] }));
          setSending(false);
          return;
        }
      }
      // CS 전용: safe inquiry/review + 연결 주문 대조용 orders(RevenueOrderLite, PII 없음). 타 팀엔 미전달.
      const csDetail =
        chatTeam === 'cs' && rev?.universeAux
          ? { inquiries: rev.universeAux.inquiries, reviews: rev.universeAux.reviews, orders: rev.orders, goodsNames: goodsNameMap }
          : undefined;
      const ctx = buildDepartmentChatContext(chatTeam, departmentFactsBundle, csDetail);
      opts = ctx ?? {
        answerGuidance:
          '현재 부서별 facts가 아직 준비되지 않았습니다. 사용자에게 "데이터를 불러오는 중이니 잠시 후 다시 시도하거나 새로고침해 주세요"라고 안내하세요. 숫자를 추측하지 마세요.'
      };
    }
    const res = await chatWithTeam(teamId, text, opts);
    setChatLog((prev) => ({ ...prev, [teamId]: [...prev[teamId], { role: 'system', text: res.text }] }));
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // 상품관리팀 대시보드 — orders-revenue(includeSynthetic=true) 데이터 연결 (디자인 고도화 X)
  const renderProductData = () => {
    const { products, revenue, loading, loaded } = productData;

    if (!loaded && loading) {
      return <div className="dept-data-loading">데이터를 불러오는 중…</div>;
    }
    if (!loaded) {
      return (
        <div className="dept-data-loading">
          <button type="button" className="dept-refresh-btn" onClick={() => void loadProductTeamData()}>
            데이터 불러오기
          </button>
        </div>
      );
    }

    return (
      <ProductTeamDashboard
        products={products}
        revenue={revenue}
        loading={loading}
        onRefresh={() => void loadProductTeamData()}
      />
    );
  };

  // CS팀 처리판 대시보드 — 이미 로드된 revenue(universeAux) 재사용(새 API 호출 없음).
  const renderCsData = () => {
    const { revenue, loading, loaded } = productData;
    if (!loaded && loading) {
      return <div className="dept-data-loading">데이터를 불러오는 중…</div>;
    }
    if (!loaded) {
      return (
        <div className="dept-data-loading">
          <button type="button" className="dept-refresh-btn" onClick={() => void loadProductTeamData()}>
            데이터 불러오기
          </button>
        </div>
      );
    }
    return (
      <CsTeamDashboard
        revenue={revenue}
        goodsNames={goodsNameMap}
        loading={loading}
        onRefresh={() => void loadProductTeamData()}
      />
    );
  };

  // 마케팅 분석팀 대시보드 — 이미 로드된 revenue/products 재사용(새 API 호출 없음). facts는 helper가 계산.
  const renderMarketingData = () => {
    const { products, revenue, loading, loaded } = productData;
    if (!loaded && loading) {
      return <div className="dept-data-loading">데이터를 불러오는 중…</div>;
    }
    if (!loaded) {
      return (
        <div className="dept-data-loading">
          <button type="button" className="dept-refresh-btn" onClick={() => void loadProductTeamData()}>
            데이터 불러오기
          </button>
        </div>
      );
    }
    return (
      <MarketingAnalysisDashboard
        revenue={revenue}
        products={products}
        loading={loading}
        onRefresh={() => void loadProductTeamData()}
        marketingChartArtifact={marketingChartArtifact}
        onClearMarketingChartArtifact={() => setMarketingChartArtifact(null)}
        marketingMemoryHintCount={marketingMemoryHintCount}
      />
    );
  };

  return (
    <div className="dept-workspace">
      {/* ── 좌측: 부서 선택 / 팀 정보 ── */}
      <aside className="dept-col dept-col-left">
        <div className="dept-col-head">
          <h3>부서 선택</h3>
          <p className="dept-col-sub">팀을 선택해 업무 공간을 전환하세요.</p>
        </div>

        <div className="dept-team-list">
          {TEAMS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dept-team-card ${t.id === selectedTeamId ? 'active' : ''}`}
              onClick={() => handleSelectTeam(t.id)}
            >
              <div className="dept-team-card-top">
                <span className="dept-team-emoji">{t.emoji}</span>
                <span className="dept-team-name">{t.name}</span>
              </div>
              <p className="dept-team-role">{t.roleSummary}</p>
              <div className="dept-team-meta">
                <span>팀장: {t.lead}</span>
                <span>팀원 {t.members.length}명</span>
              </div>
            </button>
          ))}
        </div>

        {/* 선택한 팀 상세 정보 */}
        <div className="dept-team-detail">
          <div className="dept-detail-title">
            <span className="dept-team-emoji">{team.emoji}</span>
            <strong>{team.name}</strong>
          </div>
          <dl className="dept-detail-list">
            <div>
              <dt>팀장</dt>
              <dd>{team.lead}</dd>
            </div>
            <div>
              <dt>팀원</dt>
              <dd>{team.members.join(', ')}</dd>
            </div>
            <div>
              <dt>오늘의 미션</dt>
              <dd>{team.mission}</dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* ── 중앙: 팀별 업무 대시보드 ── */}
      <section className={`dept-col dept-col-center ${team.id === 'product' || team.id === 'cs' || team.id === 'marketing' ? 'dept-col-center-dashboard' : ''}`}>
        {team.id === 'product' ? (
          renderProductData()
        ) : team.id === 'cs' ? (
          renderCsData()
        ) : team.id === 'marketing' ? (
          renderMarketingData()
        ) : (
          <>
            <div className="dept-col-head">
              <h2 className="dept-dashboard-title">
                <span className="dept-team-emoji">{team.emoji}</span>
                {team.dashboardTitle}
              </h2>
              <p className="dept-dashboard-desc">{team.dashboardDesc}</p>
            </div>

            <div className="dept-placeholder-banner">
              🚧 이 화면은 아직 데이터가 연결되지 않은 미리보기입니다. 아래 수치는 예시(placeholder)입니다.
            </div>

            <div className="dept-card-grid">
              {PLACEHOLDER_CARDS.map((c) => (
                <div key={c.key} className="dept-stat-card">
                  <div className="dept-stat-head">
                    <span className="dept-stat-icon">{c.icon}</span>
                    <span className="dept-stat-label">{c.label}</span>
                  </div>
                  <div className="dept-stat-value">—</div>
                  <span className="dept-stat-tag">예시 · 미연결</span>
                </div>
              ))}
            </div>

            <div className="dept-future-note">
              <span className="dept-future-icon">🔌</span>
              {team.futureDataNote}
            </div>
          </>
        )}
      </section>

      {/* ── 우측: 팀별 명령 채팅창 (미리보기, 실제 호출 없음) ── */}
      <aside className="dept-col dept-col-right">
        <div className="dept-col-head">
          <h3>{team.chatTitle}</h3>
          <p className="dept-col-sub">선택한 팀의 AI 팀장에게 업무를 지시하거나 질문할 수 있습니다.</p>
        </div>

        {/* dev/smoke marker — 마케팅 chartSpec artifact(비영속). 중앙 그래프 렌더는 다음 작업. JSON/PII 미노출. */}
        {team.id === 'marketing' && marketingChartArtifact && (
          <div
            className="marketing-chart-artifact"
            data-marketing-chart-intent={marketingChartArtifact.intent}
            data-marketing-chart-available={String(marketingChartArtifact.chartSpec.available)}
            data-marketing-chart-type={marketingChartArtifact.chartSpec.chartType}
            hidden
          />
        )}

        <div className="dept-chat-log" ref={chatLogRef}>
          {messages.length === 0 ? (
            <div className="dept-chat-empty">
              <p>아직 지시한 내용이 없습니다.</p>
              <p className="dept-chat-empty-hint">{team.chatPlaceholder}</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`dept-chat-msg ${m.role}`}>
                {m.text}
              </div>
            ))
          )}
          {sending && <div className="dept-chat-msg system">작성 중…</div>}
        </div>

        <div className="dept-chat-input-row">
          <textarea
            className="dept-chat-input"
            value={input}
            placeholder={team.chatPlaceholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button
            type="button"
            className="dept-chat-send"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
          >
            {sending ? '전송 중…' : '지시 전송'}
          </button>
        </div>
        <p className="dept-chat-disclaimer">
          ※ 분석·정리·초안까지만 제공하며, 실제 발송·수정·캠페인 실행은 승인 전 하지 않습니다.
        </p>
      </aside>
    </div>
  );
};

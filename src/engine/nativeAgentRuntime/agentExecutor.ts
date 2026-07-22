import type { AgentJob, AgentResult, AgentArtifact, AgentResultStatus, DepartmentId } from './types';
import { isUnanswered } from '../../services/inquiryStatusContract';
import type { OperationsDataSnapshot } from '../../types/dataConnector';
import type { EngineProvider } from '../../types/engine';
import { generateCSDrafts } from '../csDraftGenerator';

export async function executeAgentJob(
  job: AgentJob,
  activeSnapshot: OperationsDataSnapshot,
  engineProviders: EngineProvider[]
): Promise<AgentResult> {
  const currentTime = new Date().toISOString();
  const runId = job.runId;
  const agentId = job.assignedAgentId;
  const deptId = job.departmentId;

  let status: AgentResultStatus = 'success';
  let summary = '';
  const findings: string[] = [];
  const recommendations: string[] = [];
  const handoffTargets: DepartmentId[] = [];
  const artifacts: AgentArtifact[] = [];
  const riskFlags: string[] = [];
  let approvalRequired = false;

  // 1. 상품 데이터 분석 AI (product_analyst)
  if (agentId === 'product_analyst') {
    const productsCount = activeSnapshot.orders.length;
    findings.push(`현재 수집된 주문 데이터 기준 총 ${productsCount}건의 주문 내역 검수 완료.`);
    
    // 비정상 주문 패턴 감지 시뮬레이션
    const addressIssues = activeSnapshot.orders.filter(o => o.riskFlags && o.riskFlags.includes('주소 미기입'));
    if (addressIssues.length > 0) {
      findings.push(`주소지 입력 불완전 오류가 감지된 주문 ${addressIssues.length}건 존재.`);
      recommendations.push('주소 미기입 주문자에게 유선 및 문자 안내를 통한 정보 보완을 요청해야 합니다.');
      riskFlags.push('주소_오류_감지');
    }

    // 어제 대비 판매량 급증 상품 분석
    const productSalesMap: Record<string, number> = {};
    activeSnapshot.orders.forEach(o => {
      productSalesMap[o.productName] = (productSalesMap[o.productName] || 0) + o.quantity;
    });

    const topSelling = Object.entries(productSalesMap).sort((a, b) => b[1] - a[1])[0];
    if (topSelling) {
      findings.push(`단기 판매량 최고 기여 상품: [${topSelling[0]}] (총 ${topSelling[1]}개 판매)`);
      recommendations.push(`판매량이 높은 [${topSelling[0]}]을 중심으로 재고 수급 상황을 재확인하십시오.`);
    }

    summary = '쇼핑몰 주문 데이터 무결성 검수 및 판매 추이 정량 분석 완료. 일부 주소 오기입 건 확인.';
    handoffTargets.push('marketing');

    // Artifact 생성
    artifacts.push({
      id: `art-prod-analyst-${runId}`,
      runId,
      agentId,
      departmentId: deptId,
      type: 'inventory_report',
      title: '일일 판매량 분석 및 주문 무결성 요약',
      body: `검수 대상 주문 수: ${productsCount}건\n오류 주문 수: ${addressIssues.length}건\n최다 판매 상품: ${topSelling ? topSelling[0] : '없음'}`,
      approvalRequired: false,
      createdAt: currentTime
    });
  }

  // 2. 재고/판매상태 감시 AI (inventory_monitor)
  else if (agentId === 'inventory_monitor') {
    const lowStockItems = activeSnapshot.inventory.filter(item => item.stock <= item.safetyStock);
    
    if (lowStockItems.length > 0) {
      lowStockItems.forEach(item => {
        findings.push(`[${item.productName} - ${item.optionName}] 실재고 ${item.stock}개 (안전재고 ${item.safetyStock}개 미달).`);
        recommendations.push(`[${item.productName}]의 안전재고 부족에 대비해 추가 발주 제안서를 즉시 작성합니다.`);
      });
      riskFlags.push('안전재고_미달');
      handoffTargets.push('marketing'); // 재고 부족 정보 마케팅팀에 handoff
      approvalRequired = true;

      // 발주 제안서 Artifact 생성
      artifacts.push({
        id: `art-inv-mon-proposal-${runId}`,
        runId,
        agentId,
        departmentId: deptId,
        type: 'approval_proposal',
        title: '안전재고 미달 품목 추가 긴급 발주 제안서',
        body: `안전재고 미달 품목 요약:\n` + lowStockItems.map(item => `- ${item.productName}(옵션: ${item.optionName}): 현재 재고 ${item.stock}개 / 안전재고 ${item.safetyStock}개`).join('\n') + `\n\n조치 사항: 도매 대리점 발주 처리를 위한 승인을 요청합니다.`,
        approvalRequired: true,
        createdAt: currentTime
      });
    } else {
      findings.push('모든 활성 상품의 재고 수량이 안전재고 이상을 유지하고 있습니다.');
    }

    summary = lowStockItems.length > 0
      ? `안전재고 미달 품목 ${lowStockItems.length}건 감지. 긴급 발주 승인 요청 생성.`
      : '안전재고 수준 양호. 경보 대상 품목 없음.';
  }

  // 3. 문의 분석 AI (inquiry_analyst)
  else if (agentId === 'inquiry_analyst') {
    try {
      const drafts = await generateCSDrafts(activeSnapshot, engineProviders);
      const unansweredCount = activeSnapshot.inquiries.filter(i => isUnanswered(i.status)).length;

      findings.push(`미답변 1:1 고객 문의 분석 결과: 총 ${unansweredCount}건 발견.`);
      
      if (drafts.length > 0) {
        drafts.forEach((draft, idx) => {
          findings.push(`[문의 ${idx + 1}] 카테고리: ${draft.category} / 제목: ${draft.title}`);
          findings.push(`[초안 작성 완료] 고객명: ${draft.customerNameMasked} (PII 필터링 적용됨)`);
          
          artifacts.push({
            id: `art-cs-draft-${draft.inquiryId}-${runId}`,
            runId,
            agentId,
            departmentId: deptId,
            type: 'cs_reply_draft',
            title: `[답변 초안] ${draft.title}`,
            body: draft.draftReply,
            data: {
              inquiryId: draft.inquiryId,
              customerNameMasked: draft.customerNameMasked,
              category: draft.category,
              fallbackUsed: draft.fallbackUsed,
              modelId: draft.modelId
            },
            approvalRequired: true,
            createdAt: currentTime
          });
        });
        
        recommendations.push('작성된 답변 초안들을 검토하여 승인 큐(Approval Queue)에서 반영 처리를 승인해 주십시오.');
        approvalRequired = true;
      } else {
        findings.push('처리 대기 중인 신규 미답변 1:1 문의가 존재하지 않습니다.');
      }
      
      summary = drafts.length > 0
        ? `미답변 CS ${drafts.length}건에 대한 답변 초안 생성 완료 (개인정보 비식별 마스킹 적용).`
        : '처리할 미답변 고객 문의가 없습니다.';
      
      handoffTargets.push('marketing'); // 특정 상품 클레임 등 마케팅과 조율할 내용 handoff 가능성

    } catch (err: unknown) {
      status = 'failed';
      summary = `CS 답변 초안 생성 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 4. 리뷰/이슈 감지 AI (review_detector)
  else if (agentId === 'review_detector') {
    const lowRatingReviews = activeSnapshot.reviews.filter(r => r.rating <= 2);
    
    if (lowRatingReviews.length > 0) {
      lowRatingReviews.forEach(r => {
        findings.push(`부정 리뷰 감지: [${r.productName}] 별점 ${r.rating}점 - "${r.content}"`);
        recommendations.push(`[${r.productName}]의 제품 상태 또는 배송 상태 점검 및 고객 사과 답변 승인 필요.`);
        
        if (r.content.includes('누액') || r.content.includes('파손') || r.content.includes('터짐')) {
          riskFlags.push('패키지_훼손_의심');
        }
      });
      
      handoffTargets.push('marketing'); // 부정 리뷰 품목 마케팅 캠페인 자제 handoff
      approvalRequired = true;

      // 부정 리뷰 대응 건에 대한 승인 제안 Artifact 생성
      artifacts.push({
        id: `art-rev-det-proposal-${runId}`,
        runId,
        agentId,
        departmentId: deptId,
        type: 'approval_proposal',
        title: '부정 리뷰 긴급 고객 대응 및 사과 초안 제안',
        body: `부정 리뷰 발견 및 조치 건의:\n` + lowRatingReviews.map(r => `- ${r.productName}(별점: ${r.rating}점): "${r.content}"`).join('\n') + `\n\n조치 사항: 사과 답변 발송 및 필요 시 개별 환불 프로세스 가동 승인을 제안합니다.`,
        approvalRequired: true,
        createdAt: currentTime
      });
    } else {
      findings.push('새로 등록된 리뷰 중 별점 2점 이하의 불만족 평가는 없습니다.');
    }

    summary = lowRatingReviews.length > 0
      ? `별점 2점 이하의 부정 리뷰 ${lowRatingReviews.length}건 감지. 비즈니스 리스크 공유.`
      : '신규 리뷰 여론 상태 양호. 경보 발생 건수 없음.';
  }

  // 5. 시장/트렌드 리서치 AI (trend_researcher)
  else if (agentId === 'trend_researcher') {
    findings.push('시장 조사 단계: [경고] 외부 검색 도구 미연동 상태로 내부 데이터 기반 분석만 수행.');
    
    // 내부 구매 데이터를 활용한 선호 분석
    const productFrequency: Record<string, number> = {};
    activeSnapshot.orders.forEach(o => {
      productFrequency[o.productName] = (productFrequency[o.productName] || 0) + 1;
    });

    const items = Object.entries(productFrequency).sort((a, b) => b[1] - a[1]);
    if (items.length > 0) {
      findings.push(`내부 구매 선호 데이터 분석 결과, 최다 구매 유도 품목은 [${items[0][0]}]입니다.`);
      recommendations.push(`재구매 주기에 접어든 VIP 고객 세그먼트를 추출하고 [${items[0][0]}] 관련 연계 쿠폰 발송 기획을 권장합니다.`);
    }

    summary = '내부 구매 이력 기반 트렌드 분석 완료. (외부 검색 생략)';
    handoffTargets.push('marketing');

    artifacts.push({
      id: `art-trend-res-${runId}`,
      runId,
      agentId,
      departmentId: deptId,
      type: 'handoff_note',
      title: '트렌드 분석 및 고객 세그먼트 전달 노트',
      body: `내부 분석 인기 상품: ${items.length > 0 ? items[0][0] : '없음'}\n[참고] 외부 검색 연동이 제한되어 내부 주문 내역 및 재구매 빈도 데이터만을 기반으로 요약되었습니다.`,
      approvalRequired: false,
      createdAt: currentTime
    });
  }

  // 6. 콘텐츠/캠페인 기획 AI (campaign_planner)
  else if (agentId === 'campaign_planner') {
    findings.push('이탈 방지용 신규 재구매 타겟 캠페인 기안 완성.');
    recommendations.push('재구매 촉진을 위한 타겟 10% 쿠폰 발행 및 A/B 테스트 푸시 문안 검토 및 승인 필요.');
    
    approvalRequired = true;
    summary = '고객 이탈 방지용 웰컴백 캠페인 기획안 초안 수립 완료. 승인 대기.';

    // 캠페인 기획안 Artifact
    artifacts.push({
      id: `art-camp-plan-${runId}`,
      runId,
      agentId,
      departmentId: deptId,
      type: 'marketing_plan',
      title: '이탈 고객 방지 10% 웰컴백 할인 쿠폰 발행안',
      body: `[캠페인 세그먼트]: 최근 30일 이내 미구매 고객 대상\n[혜택]: 전 품목 적용 가능한 10% 할인 쿠폰\n[푸시 문구 초안]: "고객님, 오랜만에 찾아주신 감사의 마음을 담아 특별한 10% 할인 웰컴백 쿠폰을 드립니다. 놓치지 마세요!"\n\n승인 시 대상 고객군에게 쿠폰 마스터 번호가 동적 발행됩니다.`,
      approvalRequired: true,
      createdAt: currentTime
    });
  }

  return {
    id: `res-${agentId}-${runId}`,
    runId,
    jobId: job.id,
    agentId,
    departmentId: deptId,
    status,
    summary,
    findings,
    recommendations,
    handoffTargets,
    artifacts,
    riskFlags,
    approvalRequired,
    createdAt: currentTime
  };
}

// 고도몰5 Open API Capability Registry (정적 API 지도)
//
// 출처: docs/godomall5_openAPI_spec_v1.0_20250616 (기준) + enamoo_openAPI_spec_v1.0_20221231 (참고)
//   - PDF 본문은 CID 임베디드 폰트라 한글 설명이 텍스트로 추출되지 않았다(영문 필드/엔드포인트/
//     코드값은 정상 추출). 따라서 한글 API명은 엔드포인트 의미 + 기존 구현 + 코드표로 확정했다.
//   - 독해 로그: docs/GODOMALL_OPENAPI_FULL_SPEC_READING_LOG_V1.md
//   - 요약 문서: docs/GODOMALL_OPENAPI_CAPABILITY_REGISTRY_V1.md
//
// 성격: 이 파일은 "무엇을 호출할 수 있고, 무엇이 구현됐고, 어느 부서가 쓰고, 위험도는 무엇인가"의
//       단일 진실(SoT) 정적 지도다. 실제 호출/실행 로직은 포함하지 않는다(WRITE route 미생성).
//
// 보안 불변식:
//   - 모든 고도몰 호출은 서버 route에서만. 키는 서버 환경변수 전용.
//   - WRITE API는 전부 writeLocked=true + requiresApproval=true (실행 route 미생성).
//   - piiRisk='high' API는 프론트 직접 호출 금지(서버 마스킹 경유).

export type GodomallApiDomain =
  | 'common'
  | 'product'
  | 'order'
  | 'board'
  | 'code'
  | 'naverpay'
  | 'legacy_reference';

export type GodomallApiAccessMode = 'read' | 'write' | 'mixed';

export type GodomallApiImplementationStatus =
  | 'done'
  | 'partial'
  | 'mock_only'
  | 'not_started'
  | 'write_locked'
  | 'deprecated'
  | 'reference_only';

export type GodomallDepartmentOwner =
  | 'hq'
  | 'product'
  | 'order'
  | 'delivery'
  | 'cs'
  | 'review'
  | 'marketing'
  | 'stock'
  | 'finance';

export type GodomallPiiRisk = 'none' | 'low' | 'medium' | 'high';

export type GodomallBusinessPriority = 'p0' | 'p1' | 'p2' | 'p3';

export type GodomallApiCapability = {
  id: string;
  domain: GodomallApiDomain;
  nameKo: string;
  specSource: 'godomall5_20250616' | 'enamoo_20221231' | 'derived';
  specSection: string;
  specPageRange?: string;
  method: 'POST';
  transport: 'xml';
  realPath?: string;
  sandboxPath?: string;
  accessMode: GodomallApiAccessMode;
  implementationStatus: GodomallApiImplementationStatus;
  currentRoutes?: string[];
  currentSharedFiles?: string[];
  usedByDepartments: GodomallDepartmentOwner[];
  requiresApproval: boolean;
  writeLocked: boolean;
  piiRisk: GodomallPiiRisk;
  rateLimitSensitive: boolean;
  businessPriority: GodomallBusinessPriority;
  nextAction: string;
  notes?: string;
};

// 프론트 직접 호출 금지 표준 문구(piiRisk high 공통 주석에 포함).
const FRONT_DIRECT_CALL_BANNED = '프론트 직접 호출 금지 — 서버 route + PII 마스킹 경유.';

export const GODOMALL_API_CAPABILITIES: GodomallApiCapability[] = [
  // ── 상품(product) ──────────────────────────────────────────────────────────
  {
    id: 'goods_search',
    domain: 'product',
    nameKo: '상품조회 API',
    specSource: 'godomall5_20250616',
    specSection: '3.1',
    specPageRange: '17-24',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Search.php',
    sandboxPath: '/goods/Goods_Search.php',
    accessMode: 'read',
    implementationStatus: 'done',
    currentRoutes: ['api/godomall/products.ts'],
    currentSharedFiles: ['api/_shared/godomallMapper.ts', 'api/_shared/godomallResource.ts'],
    usedByDepartments: ['product', 'marketing', 'stock'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'low',
    rateLimitSensitive: true,
    businessPriority: 'p0',
    nextAction: '유지. 상품 13개 REAL READ 동작 중. 100개 초과 시 페이징 보강.',
    notes: 'Request: goodsNm/goodsNo/goodsCd/cateCd/searchDateType/startDate/endDate/page/size. mapGoodsToProducts→StandardProduct.'
  },
  {
    id: 'category_search',
    domain: 'product',
    nameKo: '상품 카테고리조회 API',
    specSource: 'godomall5_20250616',
    specSection: '3.2',
    specPageRange: '25',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Category_Search.php',
    sandboxPath: '/goods/Category_Search.php',
    accessMode: 'read',
    implementationStatus: 'not_started',
    usedByDepartments: ['product', 'marketing'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p1',
    nextAction: 'cateCd→cateNm 라벨 매핑 READ 구현. 현재 RevenueOrder 카테고리는 코드만 → 한글명 보강.',
    notes: 'Request: cateCd. Response: cateCd/cateNm/cateDisplayFl/cateDisplayMobileFl.'
  },
  {
    id: 'brand_search',
    domain: 'product',
    nameKo: '상품 브랜드조회 API',
    specSource: 'godomall5_20250616',
    specSection: '3.3',
    specPageRange: '26',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Brand_Search.php',
    sandboxPath: '/goods/Brand_Search.php',
    accessMode: 'read',
    implementationStatus: 'not_started',
    usedByDepartments: ['product', 'marketing'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p2',
    nextAction: '브랜드 라벨 필요 시 READ 구현.'
  },
  {
    id: 'goods_add_search',
    domain: 'product',
    nameKo: '추가상품조회 API',
    specSource: 'godomall5_20250616',
    specSection: '3.8',
    specPageRange: '47',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Add_Search.php',
    sandboxPath: '/goods/Goods_Add_Search.php',
    accessMode: 'read',
    implementationStatus: 'not_started',
    usedByDepartments: ['product'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'low',
    rateLimitSensitive: true,
    businessPriority: 'p2',
    nextAction: '추가상품 매출 분리 필요 시 READ 구현.',
    notes: 'Request: scmNo/addGoodsNo/goodsNm/brandCd/page/size.'
  },
  {
    id: 'goods_stock',
    domain: 'product',
    nameKo: '상품재고변경 API',
    specSource: 'godomall5_20250616',
    specSection: '3.5',
    specPageRange: '28',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Stock.php',
    sandboxPath: '/goods/Goods_Stock.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['product', 'stock'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p2',
    nextAction: 'Approval Queue 준비 후 Phase 6. 현재 실행 route 미생성.',
    notes: 'data_url>goodsNo/optionFl/totalStock/stockOptionData. 재고는 가상(synthetic)만 다룸 — 실재고 Write 금지.'
  },
  {
    id: 'goods_insert',
    domain: 'product',
    nameKo: '상품등록 API',
    specSource: 'godomall5_20250616',
    specSection: '3.6',
    specPageRange: '29-37',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Insert.php',
    sandboxPath: '/goods/Goods_Insert.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['product'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'low',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'goods_update',
    domain: 'product',
    nameKo: '상품수정 API',
    specSource: 'godomall5_20250616',
    specSection: '3.7',
    specPageRange: '38-46',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Update.php',
    sandboxPath: '/goods/Goods_Update.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['product'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'low',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '상품 오류 수정 초안 → Approval Queue. 실행은 Phase 8. route 미생성.'
  },
  {
    id: 'goods_delete',
    domain: 'product',
    nameKo: '상품삭제 API',
    specSource: 'godomall5_20250616',
    specSection: '3.4',
    specPageRange: '27',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Delete.php',
    sandboxPath: '/goods/Goods_Delete.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['product'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'goods_totally_delete',
    domain: 'product',
    nameKo: '상품완전삭제 API',
    specSource: 'godomall5_20250616',
    specSection: '3.9',
    specPageRange: '48',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Totally_Delete.php',
    sandboxPath: '/goods/Goods_Totally_Delete.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['product'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '위험. 범위 밖. 실행 route 미생성.'
  },
  {
    id: 'goods_soldout_status',
    domain: 'product',
    nameKo: '상품 품절상태변경 API',
    specSource: 'godomall5_20250616',
    specSection: '3.10',
    specPageRange: '49',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Soldout_Status.php',
    sandboxPath: '/goods/Goods_Soldout_Status.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['product', 'stock'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p2',
    nextAction: '품절 처리 초안 → Approval. 실행은 Phase 8. route 미생성.',
    notes: 'Request: goodsNo/soldoutFl(y=품절,n=해제)/data_url.'
  },

  // ── 주문(order) ────────────────────────────────────────────────────────────
  {
    id: 'order_search',
    domain: 'order',
    nameKo: '주문조회 API',
    specSource: 'godomall5_20250616',
    specSection: '4.1',
    specPageRange: '50-62',
    method: 'POST',
    transport: 'xml',
    realPath: '/order/Order_Search.php',
    sandboxPath: '/order/Order_Search.php',
    accessMode: 'read',
    implementationStatus: 'partial',
    currentRoutes: ['api/godomall/orders-revenue.ts', 'api/godomall/orders-admin.ts'],
    currentSharedFiles: [
      'api/_shared/godomallRevenue.ts',
      'api/_shared/godomallOrderTypes.ts',
      'api/_shared/godomallOrderCodes.ts',
      'api/_shared/godomallOrderNormalize.ts',
      'api/_shared/syntheticGodomallOrders.ts',
      'api/_shared/orderRawAudit.ts'
    ],
    usedByDepartments: ['order', 'delivery', 'finance', 'marketing'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'high',
    rateLimitSensitive: true,
    businessPriority: 'p0',
    nextAction:
      'core READ + RevenueOrder + raw audit + empty guard 완료. edge case 잠그기: claimData/multi-shipping/partial cancel/return/exchange. 조회기간 최대 30일.',
    notes: `Order_Search real raw audit done. Empty response guard done. RevenueOrder mapper done. Edge cases pending. ${FRONT_DIRECT_CALL_BANNED}`
  },
  {
    id: 'order_status',
    domain: 'order',
    nameKo: '주문상태변경 API',
    specSource: 'godomall5_20250616',
    specSection: '4.2',
    specPageRange: '62-68',
    method: 'POST',
    transport: 'xml',
    realPath: '/order/Order_Status.php',
    sandboxPath: '/order/Order_Status.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['order', 'delivery', 'cs', 'finance'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'high',
    rateLimitSensitive: true,
    businessPriority: 'p1',
    nextAction: '배송/취소/반품/교환/환불 상태변경. Approval Queue 경유. Phase 8. 실행 route 미생성.',
    notes: `Request: orderNo/sno/orderStatus/invoiceNo/invoiceCompanySno/handleReason/refundMethod/refundBankName/refundAccountNumber/refundDepositor. 환불계좌=고PII. ${FRONT_DIRECT_CALL_BANNED}`
  },

  // ── 게시판(board) — CS/리뷰 ─────────────────────────────────────────────────
  {
    id: 'board_inventory',
    domain: 'board',
    nameKo: '게시판 목록조회 API',
    specSource: 'godomall5_20250616',
    specSection: '5.1',
    specPageRange: '68-69',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Board_Inventory.php',
    sandboxPath: '/board/Board_Inventory.php',
    accessMode: 'read',
    implementationStatus: 'not_started',
    usedByDepartments: ['cs', 'review'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p1',
    nextAction: '게시판 종류(bdId) 목록 확보 → Board_List 호출 기반.',
    notes: 'Response: bdId/bdNm/bdKind(default/gallery/event/qa=1:1)/bdSecretFl/bdReplyFl.'
  },
  {
    id: 'board_list',
    domain: 'board',
    nameKo: '게시물 목록조회 API',
    specSource: 'godomall5_20250616',
    specSection: '5.2',
    specPageRange: '69-72',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Board_List.php',
    sandboxPath: '/board/Board_List.php',
    accessMode: 'read',
    implementationStatus: 'not_started',
    usedByDepartments: ['cs', 'review', 'marketing'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'high',
    rateLimitSensitive: true,
    businessPriority: 'p1',
    nextAction:
      'CS/리뷰 READ v0. bdId=goodsqa(상품문의)/goodsreview(상품후기). csTeamChatFacts/reviewTeamChatFacts 데이터 소스. (고도몰5는 Goods_Qna_Search/Goods_Review_Search를 Board로 통합 — 이걸 사용).',
    notes: `Request: bdId/dateType/startDate/endDate/searchField/searchWord/page/size. Response: writerNm/writerMobile/writerEmail/subject/content/isSecret/replyData/memoData. ${FRONT_DIRECT_CALL_BANNED}`
  },
  {
    id: 'board_write',
    domain: 'board',
    nameKo: '게시물 등록 API',
    specSource: 'godomall5_20250616',
    specSection: '5.3',
    specPageRange: '73',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Board_Write.php',
    sandboxPath: '/board/Board_Write.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'medium',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'board_update',
    domain: 'board',
    nameKo: '게시물 수정 API',
    specSource: 'godomall5_20250616',
    specSection: '5.4',
    specPageRange: '74',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Board_Update.php',
    sandboxPath: '/board/Board_Update.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'medium',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'board_delete',
    domain: 'board',
    nameKo: '게시물 삭제 API',
    specSource: 'godomall5_20250616',
    specSection: '5.5',
    specPageRange: '75',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Board_Delete.php',
    sandboxPath: '/board/Board_Delete.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'board_reply',
    domain: 'board',
    nameKo: '게시물 답변 등록 API',
    specSource: 'godomall5_20250616',
    specSection: '5.6',
    specPageRange: '76',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Board_Reply.php',
    sandboxPath: '/board/Board_Reply.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs', 'review'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'medium',
    rateLimitSensitive: true,
    businessPriority: 'p2',
    nextAction: 'CS/리뷰 답변 초안 → Approval Queue → Phase 8 실행. 현재 route 미생성.'
  },
  {
    id: 'memo_write',
    domain: 'board',
    nameKo: '게시물 댓글 등록 API',
    specSource: 'godomall5_20250616',
    specSection: '5.7',
    specPageRange: '77',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Memo_Write.php',
    sandboxPath: '/board/Memo_Write.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'medium',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'memo_update',
    domain: 'board',
    nameKo: '게시물 댓글 수정 API',
    specSource: 'godomall5_20250616',
    specSection: '5.8',
    specPageRange: '78',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Memo_Update.php',
    sandboxPath: '/board/Memo_Update.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'medium',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'memo_delete',
    domain: 'board',
    nameKo: '게시물 댓글 삭제 API',
    specSource: 'godomall5_20250616',
    specSection: '5.9',
    specPageRange: '79',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Memo_Delete.php',
    sandboxPath: '/board/Memo_Delete.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },
  {
    id: 'memo_reply',
    domain: 'board',
    nameKo: '게시물 댓글의 댓글등록 API',
    specSource: 'godomall5_20250616',
    specSection: '5.10',
    specPageRange: '80',
    method: 'POST',
    transport: 'xml',
    realPath: '/board/Memo_Reply.php',
    sandboxPath: '/board/Memo_Reply.php',
    accessMode: 'write',
    implementationStatus: 'write_locked',
    usedByDepartments: ['cs'],
    requiresApproval: true,
    writeLocked: true,
    piiRisk: 'medium',
    rateLimitSensitive: true,
    businessPriority: 'p3',
    nextAction: '범위 밖. 실행 route 미생성.'
  },

  // ── 공통(common) ───────────────────────────────────────────────────────────
  {
    id: 'code_search',
    domain: 'common',
    nameKo: '공통코드조회 API',
    specSource: 'godomall5_20250616',
    specSection: '6.1',
    specPageRange: '81',
    method: 'POST',
    transport: 'xml',
    realPath: '/common/Code_Search.php',
    sandboxPath: '/common/Code_Search.php',
    accessMode: 'read',
    implementationStatus: 'partial',
    currentRoutes: ['api/godomall/read.ts?capability=code_search'],
    currentSharedFiles: ['api/_shared/godomallCodes.ts'],
    usedByDepartments: ['hq', 'product', 'order', 'delivery'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'none',
    rateLimitSensitive: true,
    businessPriority: 'p1',
    nextAction:
      'real READ bridge v0 완료. 통합 READ 게이트웨이(read.ts)로 이전. 다음: 라이브 응답으로 code_type별 실데이터 잠그기 + 하드코딩 코드표(godomallOrderCodes) 비교.',
    notes: 'Code_Search READ v0 migrated to unified READ gateway v1 (api/godomall/read.ts?capability=code_search) due to Vercel Hobby 12-function limit. 향후 모든 고도몰 READ API는 read.ts 게이트웨이로 확장(파일 수 고정). allowlist 13종(§7.2), godomallCodes.CODE_FIELD_MAP.'
  },

  // ── 레거시 참고(legacy_reference, enamoo 2022) — 고도몰5에서 Board로 통합됨 ──
  {
    id: 'legacy_goods_qna_search',
    domain: 'legacy_reference',
    nameKo: '(레거시) 상품 Q&A 조회 API',
    specSource: 'enamoo_20221231',
    specSection: 'enamoo Goods_Qna_Search',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Qna_Search.php',
    accessMode: 'read',
    implementationStatus: 'reference_only',
    usedByDepartments: ['cs'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'medium',
    rateLimitSensitive: false,
    businessPriority: 'p3',
    nextAction: '사용 금지 — 고도몰5에서 board_list(bdId=goodsqa)로 대체됨. board_list 사용.',
    notes: 'enamoo(2022) 구버전. 고도몰5 우선 원칙에 따라 채택하지 않음.'
  },
  {
    id: 'legacy_goods_review_search',
    domain: 'legacy_reference',
    nameKo: '(레거시) 상품 후기 조회 API',
    specSource: 'enamoo_20221231',
    specSection: 'enamoo Goods_Review_Search',
    method: 'POST',
    transport: 'xml',
    realPath: '/goods/Goods_Review_Search.php',
    accessMode: 'read',
    implementationStatus: 'reference_only',
    usedByDepartments: ['review'],
    requiresApproval: false,
    writeLocked: false,
    piiRisk: 'medium',
    rateLimitSensitive: false,
    businessPriority: 'p3',
    nextAction: '사용 금지 — 고도몰5에서 board_list(bdId=goodsreview)로 대체됨. board_list 사용.',
    notes: 'enamoo(2022) 구버전. 고도몰5 우선 원칙에 따라 채택하지 않음.'
  }
];

// ── 조회 헬퍼 ───────────────────────────────────────────────────────────────
export function listGodomallApiCapabilities(): GodomallApiCapability[] {
  return GODOMALL_API_CAPABILITIES;
}

export function getGodomallApiCapability(id: string): GodomallApiCapability | undefined {
  return GODOMALL_API_CAPABILITIES.find((c) => c.id === id);
}

export function listGodomallApisByDomain(domain: GodomallApiDomain): GodomallApiCapability[] {
  return GODOMALL_API_CAPABILITIES.filter((c) => c.domain === domain);
}

export function listGodomallApisByStatus(status: GodomallApiImplementationStatus): GodomallApiCapability[] {
  return GODOMALL_API_CAPABILITIES.filter((c) => c.implementationStatus === status);
}

export function listReadReadyGodomallApis(): GodomallApiCapability[] {
  return GODOMALL_API_CAPABILITIES.filter(
    (c) => c.accessMode === 'read' && (c.implementationStatus === 'done' || c.implementationStatus === 'partial')
  );
}

export function listWriteLockedGodomallApis(): GodomallApiCapability[] {
  return GODOMALL_API_CAPABILITIES.filter((c) => c.writeLocked);
}

export function listGodomallApisByDepartment(department: GodomallDepartmentOwner): GodomallApiCapability[] {
  return GODOMALL_API_CAPABILITIES.filter((c) => c.usedByDepartments.includes(department));
}

// ── 편의 상수 (UI/부서 라우팅 준비용 — 화면 노출은 다음 단계) ────────────────
export const READ_READY_GODOMALL_APIS = listReadReadyGodomallApis();
export const WRITE_LOCKED_GODOMALL_APIS = listWriteLockedGodomallApis();
export const PRODUCT_TEAM_GODOMALL_APIS = listGodomallApisByDepartment('product');
export const CS_TEAM_GODOMALL_APIS = listGodomallApisByDepartment('cs');

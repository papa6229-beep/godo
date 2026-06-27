// CS Draft Composer Runtime Wiring v0 — CS 채팅에서 "답변 초안 요청"을 코드가 직접 처리.
//
// 목적: 답변 초안 요청이 오면 LLM이 자유 생성하지 않고, 코드가
//   (1) draft intent 감지 → (2) 대상 inquiry 선택 → (3) csDraftComposer 실행 →
//   (4) customerDraft 중심 출력(고위험만 운영자 주의 한 줄)을 결정한다.
//
// 원칙: 전부 순수 함수. LLM 호출 없음. PII/fake contact/memberKey 미노출(composer가 보장).

import {
  composeCsDraftFromOrders,
  renderCsDraftForChat,
  normalizeCsTopic,
  type CsDraftInquiry,
  type CsDraftComposerResult
} from './csDraftComposer';
import type { GroundingOrder } from './csInquiryOrderGrounding';

export type CsDraftTargetHint =
  | 'recent_unanswered'
  | 'urgent'
  | 'recent'
  | 'low_rating_review'
  | 'specific_rank'
  | 'unknown';

export interface CsDraftRequestIntent {
  isDraftRequest: boolean;
  targetHint?: CsDraftTargetHint;
  rank?: number;
  topicHint?: string;
}

// SafeInquiryChatItem / SafeSyntheticInquiry 와 구조적 호환(연락처 없음).
export type CsRuntimeInquiry = CsDraftInquiry;

// ── 1) draft intent 감지 ──────────────────────────────────────────────────────
// 초안/답장 작성 동사가 있어야 draft로 본다("미답변 문의 보여줘" 같은 단순 조회는 제외).
const DRAFT_RE = /(답변\s*초안|초안\s*(작성|만들|써|적|뽑)|답장|답신|답변\s*(써|적어|작성|만들|달라|달|줘)|고객에게\s*보낼|보낼\s*(답장|답변|메시지|문구)|문의\s*답변)/;

const KO_ORDINAL: Record<string, number> = { 첫: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5 };

const parseRank = (t: string): number | undefined => {
  const digit = t.match(/(\d+)\s*(순위|번째|번|건째)/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const ko = t.match(/(첫|두|둘|세|셋|네|넷|다섯)\s*번째/);
  if (ko) return KO_ORDINAL[ko[1]];
  if (/첫\s*번째|첫번째/.test(t)) return 1;
  return undefined;
};

const TOPIC_KEYS: Array<{ re: RegExp; key: string }> = [
  { re: /환불/, key: 'refund' },
  { re: /취소/, key: 'cancel' },
  { re: /반품/, key: 'return' },
  { re: /교환/, key: 'exchange' },
  { re: /결제|중복/, key: 'payment' },
  { re: /배송/, key: 'delivery' },
  { re: /상품|제품/, key: 'product' }
];

const detectTopicHint = (t: string): string | undefined => {
  for (const { re, key } of TOPIC_KEYS) if (re.test(t)) return key;
  return undefined;
};

export function detectCsDraftRequestIntent(userText: string): CsDraftRequestIntent {
  const t = (userText || '').trim();
  if (!t || !DRAFT_RE.test(t)) return { isDraftRequest: false };
  const rank = parseRank(t);
  const topicHint = detectTopicHint(t);
  const targetHint: CsDraftTargetHint = /미답변|답변\s*대기/.test(t)
    ? 'recent_unanswered'
    : /긴급/.test(t)
      ? 'urgent'
      : /저\s*평점|낮은\s*평점|부정\s*리뷰/.test(t)
        ? 'low_rating_review'
        : /최근/.test(t)
          ? 'recent'
          : rank
            ? 'specific_rank'
            : 'unknown';
  return { isDraftRequest: true, targetHint, ...(rank ? { rank } : {}), ...(topicHint ? { topicHint } : {}) };
}

// ── 2) 대상 inquiry 선택 ──────────────────────────────────────────────────────
const byCreatedDesc = (a: { createdAt?: string }, b: { createdAt?: string }): number =>
  (b.createdAt || '').localeCompare(a.createdAt || '');
const isUnanswered = (s?: string): boolean => !!s && /unanswered|pending|open|미답변|needs_human/i.test(s);
const isUrgent = (u?: string): boolean => !!u && /high|urgent|긴급/i.test(u);

export interface CsDraftTargetSelection {
  inquiry?: CsRuntimeInquiry;
  sourceListName?: string;
  rank?: number;
  reason: string;
}

export function selectCsDraftTargetInquiry(params: {
  inquiries: CsRuntimeInquiry[];
  intent: CsDraftRequestIntent;
}): CsDraftTargetSelection {
  const all = (params.inquiries || []).filter((q) => q.inquiryId || q.createdAt);
  const intent = params.intent;
  if (!all.length) return { reason: '문의 데이터 없음' };

  const sorted = [...all].sort(byCreatedDesc);
  const unanswered = sorted.filter((q) => isUnanswered(q.status));
  const urgent = sorted.filter((q) => isUrgent(q.urgency));

  // 기준 목록 결정
  let list: CsRuntimeInquiry[];
  let listName: string;
  switch (intent.targetHint) {
    case 'urgent':
      list = urgent; listName = '긴급 문의'; break;
    case 'recent':
      list = sorted; listName = '최근 문의'; break;
    case 'recent_unanswered':
      list = unanswered.length ? unanswered : sorted; listName = '최근 미답변 문의'; break;
    default:
      list = unanswered.length ? unanswered : sorted;
      listName = unanswered.length ? '최근 미답변 문의' : '최근 문의';
  }

  // topicHint 우선(목록 키워드가 명시되지 않았을 때) — 기준 목록 안에서 topic 매칭
  if (intent.topicHint && (intent.targetHint === 'unknown' || intent.targetHint === 'specific_rank')) {
    const matched = list.filter((q) => normalizeCsTopic(q.topic) === intent.topicHint);
    if (matched.length) {
      const idx = intent.rank && intent.rank > 0 ? intent.rank - 1 : 0;
      const inquiry = matched[Math.min(idx, matched.length - 1)];
      return { inquiry, sourceListName: `${listName}(${intent.topicHint})`, rank: intent.rank, reason: `topicHint=${intent.topicHint} 매칭` };
    }
  }

  if (!list.length) return { reason: `${listName} 없음`, sourceListName: listName };

  // rank 지정
  if (intent.rank && intent.rank > 0) {
    if (intent.rank > list.length) return { reason: `${listName} ${intent.rank}순위 없음(총 ${list.length}건)`, sourceListName: listName, rank: intent.rank };
    return { inquiry: list[intent.rank - 1], sourceListName: listName, rank: intent.rank, reason: `${listName} ${intent.rank}순위` };
  }

  return { inquiry: list[0], sourceListName: listName, rank: 1, reason: `${listName} 1순위(기본)` };
}

// ── 3) 런타임 처리(감지 → 선택 → composer → 출력) ────────────────────────────
export interface CsDraftRuntimeResult {
  handled: boolean; // CS draft request로 처리했는가(아니면 일반 채팅 흐름으로)
  reply: string; // 채팅에 그대로 출력할 텍스트
  intent: CsDraftRequestIntent;
  selection?: CsDraftTargetSelection;
  composer?: CsDraftComposerResult; // 내부 메타데이터(기본 출력 X)
}

const NO_TARGET_REPLY = '현재 초안을 만들 수 있는 미답변 문의가 없습니다.';

export function runCsDraftRequest(params: {
  userText: string;
  inquiries: CsRuntimeInquiry[];
  orders: GroundingOrder[];
}): CsDraftRuntimeResult {
  const intent = detectCsDraftRequestIntent(params.userText);
  if (!intent.isDraftRequest) return { handled: false, reply: '', intent };

  const selection = selectCsDraftTargetInquiry({ inquiries: params.inquiries, intent });
  if (!selection.inquiry) {
    return { handled: true, reply: NO_TARGET_REPLY, intent, selection };
  }

  const composer = composeCsDraftFromOrders(selection.inquiry, params.orders || []);
  const reply = renderCsDraftForChat(composer);
  return { handled: true, reply, intent, selection, composer };
}

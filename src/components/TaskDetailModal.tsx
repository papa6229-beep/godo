import React from 'react';
import type { LifecycleTask, ApprovalDecisionKind } from '../services/taskLifecycleContract';
import { userStatusLabel } from '../services/taskLifecycleContract';
import { currentStageLabel, executorDisplayLabel, executorDisplayName } from '../services/taskLifecycleAppAdapter';
import type { TaskFlow } from '../services/taskLifecycleAppAdapter';
import { DEPT_TEAM_META, type DeptTeamId } from '../types/teamMessage';

// ────────────────────────────────────────────────────────────────────────────
// B-use-2 — 업무 상세(읽기 전용)
//
// 업무 카드에서 실제로 눌러 들어오는 상세 화면이다.
// 표시값은 **저장된 lifecycle 정본(LifecycleTask)** 에서만 읽는다.
//   화면용 파생 타입(OperationTask)이나 추측으로 만든 문구를 쓰지 않는다.
//   없는 것은 "아직 없음"으로 명시한다 — 있는 것처럼 채우지 않는다.
//
// 이 화면은 **읽기 전용**이다. 승인·수정 요청·중단 버튼은 기존 카드에 그대로 있고,
// 여기서 같은 행동을 두 번 만들지 않는다(승인 규칙·경로를 건드리지 않기 위함).
// ────────────────────────────────────────────────────────────────────────────

const DECISION_LABEL: Record<ApprovalDecisionKind, string> = {
  approve: '확인 완료',
  request_revision: '수정 요청',
  not_adopted: '이번 결과 사용 안 함',
  stop: '작업 중단',
  return: '수행 불가 반송'
};

const teamName = (id?: DeptTeamId) => (id ? DEPT_TEAM_META[id]?.name ?? id : '');
const when = (iso?: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');

/** actor 의 신원 출처 — 실제 로그인이 아닌 것을 실제처럼 보이게 하지 않는다(B-core-4). */
const identityNote = (src?: string): string => {
  if (src === 'session_login') return '';
  if (src === 'demo_role') return ' (역할 전환기 · 실제 로그인 아님)';
  if (src === 'unlinked') return ' (계정 미연결)';
  return '';
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="tdetail-row">
    <span className="tdetail-row-label">{label}</span>
    <span className="tdetail-row-value">{children}</span>
  </div>
);

export interface TaskDetailModalProps {
  /** 카드가 대표하는 흐름. tracking 이 있으면 요청팀 추적 카드다. */
  flow: TaskFlow;
  onClose: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ flow, onClose }) => {
  const t = flow.task;
  // 협업: 이 카드가 추적용이면 **실제 수행은 자식 업무**에서 일어난다. 둘을 섞지 않는다.
  const worked: LifecycleTask | undefined = flow.tracking;
  const isTracking = !!worked || t.trackingOnly === true;
  const isReviewOnly = t.reviewOnly === true;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 결과·수행자는 실제로 일이 일어난 업무에서 읽는다(추적 카드면 자식).
  const resultOf = worked ?? t;
  const hasResult = !!resultOf.resultSummary || (resultOf.artifactRefs ?? []).length > 0;

  return (
    <div className="tdetail-overlay" onClick={onClose} role="presentation">
      <div
        className="tdetail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="업무 상세"
      >
        <div className="tdetail-head">
          <div>
            <h3 className="tdetail-title">{t.title}</h3>
            <p className="tdetail-sub">
              {userStatusLabel(t.status)}
              {currentStageLabel(t) ? ` · 다음 확인: ${currentStageLabel(t)}` : ''}
              {isReviewOnly ? ' · 확인 요청' : ''}
              {isTracking ? ' · 진행 상황 보기' : ''}
            </p>
          </div>
          <button type="button" className="tdetail-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="tdetail-body">
          {isTracking && (
            <p className="tdetail-notice">
              이 카드는 <strong>다른 팀이 수행하는 일의 진행 상황</strong>입니다. 실제 수행과 결과 제출은 담당 팀 카드에서 이뤄집니다.
            </p>
          )}

          <section className="tdetail-section">
            <h4 className="tdetail-section-title">누가 · 어디서</h4>
            <Row label="지시">
              {t.createdBy.label}
              {t.createdBy.teamId ? ` · ${teamName(t.createdBy.teamId)}` : ''}
              {identityNote(t.createdBy.identitySource)}
            </Row>
            <Row label="담당 팀">{teamName(t.ownerTeamId)}</Row>
            {t.requestingTeamId && t.requestingTeamId !== t.ownerTeamId && (
              <Row label="요청 팀">{teamName(t.requestingTeamId)}</Row>
            )}
            {isReviewOnly ? (
              <Row label="제출">{t.submittedBy ? t.submittedBy.label : '제출자 기록 없음'}</Row>
            ) : (
              <Row label="실제 수행자">
                {worked ? `${teamName(worked.ownerTeamId)} · ${executorDisplayLabel(worked)}` : executorDisplayLabel(t)}
                {resultOf.executorKind === 'unassigned' ? '' : ` (${resultOf.executorKind === 'agent' ? 'AI' : '사람'})`}
              </Row>
            )}
            <Row label="등록">{when(t.createdAt)}</Row>
          </section>

          <section className="tdetail-section">
            <h4 className="tdetail-section-title">제출된 결과</h4>
            {hasResult ? (
              <>
                {resultOf.resultSummary
                  ? <p className="tdetail-result">{resultOf.resultSummary}</p>
                  : <p className="tdetail-empty">글로 쓴 보고는 없습니다.</p>}
                {(resultOf.artifactRefs ?? []).length > 0 ? (
                  <ul className="tdetail-refs">
                    {resultOf.artifactRefs!.map((ref, i) => <li key={i}>{ref}</li>)}
                  </ul>
                ) : (
                  <p className="tdetail-empty">첨부·결과 참조는 없습니다.</p>
                )}
                {resultOf.submittedBy && (
                  <p className="tdetail-meta">제출: {resultOf.submittedBy.label} {when(resultOf.submittedAt)}</p>
                )}
              </>
            ) : (
              <p className="tdetail-empty">아직 제출된 결과가 없습니다.</p>
            )}
          </section>

          <section className="tdetail-section">
            <h4 className="tdetail-section-title">승인 · 수정 요청 · 중단 이력</h4>
            {t.decisions.length > 0 ? (
              <ul className="tdetail-history">
                {t.decisions.map((d, i) => (
                  <li key={i}>
                    <span className="tdetail-hist-kind">{DECISION_LABEL[d.kind] ?? d.kind}</span>
                    <span className="tdetail-hist-who">{d.actorLabel} · {teamName(d.actorTeamId)}</span>
                    <span className="tdetail-hist-at">{when(d.at)}</span>
                    {d.stageLabel && <span className="tdetail-hist-stage">{d.stageLabel}</span>}
                    {d.reason && <span className="tdetail-hist-reason">— {d.reason}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tdetail-empty">아직 결정 기록이 없습니다.</p>
            )}

            {(resultOf.stopRequests ?? []).length > 0 && (
              <>
                <h5 className="tdetail-sub-title">중단 요청</h5>
                <ul className="tdetail-history">
                  {resultOf.stopRequests!.map((s, i) => (
                    <li key={i}>
                      <span className="tdetail-hist-who">{s.requestedBy.label}</span>
                      <span className="tdetail-hist-at">{when(s.requestedAt)}</span>
                      <span className="tdetail-hist-reason">— {s.reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="tdetail-section">
            <h4 className="tdetail-section-title">수행자 변경 이력</h4>
            {resultOf.executorHistory.length > 0 ? (
              <ul className="tdetail-history">
                {resultOf.executorHistory.map((h, i) => (
                  <li key={i}>
                    <span className="tdetail-hist-kind">{h.kind === 'agent' ? 'AI' : h.kind === 'human' ? '사람' : '미정'}</span>
                    <span className="tdetail-hist-who">{h.kind === 'agent' ? executorDisplayName(h.id) : h.byLabel}</span>
                    <span className="tdetail-hist-at">{when(h.at)}</span>
                    {/* B-core-4: 수행자를 따로 정하지 않아 지시한 사람이 그대로 수행자가 된 경우를 구분한다. */}
                    {h.assignedByActorDefault && <span className="tdetail-hist-stage">지시자가 그대로 수행</span>}
                    {h.reason && <span className="tdetail-hist-reason">— {h.reason}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tdetail-empty">수행자가 아직 정해지지 않았습니다.</p>
            )}
          </section>
        </div>

        <div className="tdetail-foot">
          <span className="tdetail-readonly">읽기 전용 — 승인·수정 요청·중단은 업무 카드에서 처리합니다.</span>
          <button type="button" className="ttask-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
};

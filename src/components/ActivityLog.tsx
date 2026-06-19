import React, { useRef, useEffect } from 'react';
import type { LogEntry } from '../types';
import './ActivityLog.css';

interface ActivityLogProps {
  logs: LogEntry[];
  onClearLogs?: () => void;
}

const formatLogTextForOperator = (text: string, agentName?: string): string => {
  // 1. 핵심 결재 및 승인 액션 한글 변환
  if (text.includes('cs_reply_draft 승인 카드가 대기열에 추가') || text.includes('cs_reply_draft 승인 카드가 대기열')) {
    return '💬 AI가 생성한 CS 답변 초안이 최종 검토 및 승인을 위해 대기열에 적재되었습니다.';
  }
  if (text.includes('cs_reply_draft 승인됨') || text.includes('CS 답변 초안 승인됨')) {
    return '✓ 운영자가 고객 문의 답변 초안을 최종 승인(Approve)하였습니다.';
  }
  if (text.includes('cs_reply_draft 거절됨') || text.includes('CS 답변 초안 거절됨')) {
    return '✗ 운영자가 고객 문의 답변 초안을 반려(Reject)하였습니다.';
  }
  if (text.includes('승인 카드가 대기열에 추가되었습니다')) {
    const title = text.replace('[Engine] ', '').replace(' 승인 카드가 대기열에 추가되었습니다. (approval queued)', '').replace(' (approval queued)', '');
    return `🔑 "${title}" 작업에 대한 운영자 결재 승인 요청이 큐에 도달하였습니다.`;
  }
  if (text.includes('작업이 운영자 승인을 통과했습니다')) {
    const title = text.match(/"([^"]+)"/)?.[1] || '기획 제안';
    return `✓ 운영자가 "${title}" 조치안을 승인하여 정상 발효 처리되었습니다.`;
  }
  if (text.includes('작업이 운영자에 의해 반려')) {
    const title = text.match(/"([^"]+)"/)?.[1] || '기획 제안';
    return `✗ 운영자가 "${title}" 조치안을 반려(거절) 처리하였습니다.`;
  }

  // 2. 작업 배정 및 매뉴얼 참조 한글 변환
  if (text.includes('->') && agentName === 'Router') {
    const parts = text.split(' -> ');
    const taskTitle = parts[0];
    const targetAgent = parts[1] || '담당 AI';
    return `🤖 작업 라우터가 "${taskTitle}" 업무를 ${targetAgent} 에이전트에게 전달 배정했습니다.`;
  }
  if (text.includes('RAG 시스템이 지식 저장소에서')) {
    const docName = text.match(/"([^"]+)"/)?.[1] || '규정집';
    return `🧠 AI 직원이 정확한 처리를 위해 업무 매뉴얼에서 "${docName}" 규정을 참조하였습니다.`;
  }
  if (text.includes('지식 참조 시뮬레이션') || text.includes('기준으로 참조되었습니다')) {
    const docName = text.match(/"([^"]+)"/)?.[1] || '데이터 스냅샷';
    return `🧠 AI 직원이 최신 업무 스냅샷 "${docName}"을 대조 분석했습니다.`;
  }

  // 3. CS 연산 흐름 한글 변환
  if (text.includes('미답변 문의') && text.includes('분석 시작')) {
    const countMatch = text.match(/미답변 문의 (\d+)건/);
    const count = countMatch ? countMatch[1] : '일부';
    return `💬 CS AI 에이전트가 처리되지 않은 미답변 고객 문의 ${count}건에 대한 분석을 개시했습니다.`;
  }
  if (text.includes('CS 답변 초안') && text.includes('생성 완료')) {
    return '✨ CS AI 에이전트가 고객별 매뉴얼 규정에 입각한 정중한 답변 초안 생성을 완수했습니다.';
  }
  if (text.includes('CS 답변 초안은 템플릿으로 대체 생성')) {
    return '⚠️ 로컬 LLM 접속이 원활하지 않아 표준 가이드라인 템플릿 대체 답변으로 보조 적용되었습니다.';
  }

  // 4. 일반적인 정제 규칙
  let cleanText = text;
  cleanText = cleanText.replace(/\[Engine\]\s*/g, 'AI 분석: ');
  cleanText = cleanText.replace(/\[Safety\]\s*/g, '보안 가드: ');
  cleanText = cleanText.replace(/\[LLM\]\s*/g, 'AI 추론: ');
  cleanText = cleanText.replace(/\[Data\]\s*/g, '데이터 로드: ');
  cleanText = cleanText.replace(/\[Fallback\]\s*/g, '대체 조치: ');
  cleanText = cleanText.replace(/\[Approval\]\s*/g, '결재: ');
  
  return cleanText;
};

export const ActivityLog: React.FC<ActivityLogProps> = ({ logs, onClearLogs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  return (
    <div className="activity-log">
      <div className="log-header">
        <div className="log-header-left">
          <span className="log-dot red"></span>
          <span className="log-dot yellow"></span>
          <span className="log-dot green"></span>
          <h2 className="log-title">📋 AI 운영 기록 (Operation Activity Logs)</h2>
        </div>
        {onClearLogs && (
          <button className="clear-log-btn" onClick={onClearLogs}>
            기록 초기화
          </button>
        )}
      </div>

      <div className="log-terminal">
        {logs.length === 0 ? (
          <div className="log-line system-type">
            <span className="log-time">[SYSTEM]</span>
            <span className="log-text">기록된 운영 이력이 없습니다. 운영을 개시하면 AI 직원들의 활동 기록이 쌓입니다.</span>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`log-line ${log.type}-type`}>
              <span className="log-time">[{log.timestamp}]</span>
              <span className="log-text">{formatLogTextForOperator(log.text, log.agentName)}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};


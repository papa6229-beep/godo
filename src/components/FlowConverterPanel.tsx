import React, { useState } from 'react';
import './FlowConverterPanel.css';

// 단순형 변환기(정본) — 고도 디자인팀 작업창 안에서 **정본 화면을 그대로** 연다.
//
// 화면·기능은 정본(`tools/detail-page-converter/app/static/index.html`)의 것이다:
// 엑셀 업로드 · 상품 목록 · 변환 · 캡션 손수정 · 자동 문구 채우기(API 키) ·
// 초록/노랑/빨강 판정 · 미리보기 · HTML 저장 · 지난 회차 · 일괄 zip.
// 고도가 축소판을 다시 만들지 않는다 — 여기서는 담기만 한다.
//
// 주소는 같은 배포의 `/flow` 다(서버는 `api/flow.py` 가 정본 앱을 그대로 띄운다).
// 같은 출처라 CORS·혼합 콘텐츠 문제가 없고 로컬 주소에 기대지 않는다.

export const FLOW_PATH = '/flow';

export const FlowConverterPanel: React.FC = () => {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="fcp">
      <div className="fcp-bar">
        <span className="fcp-bar-title">단순형 변환기 · 정본 화면</span>
        <span className="fcp-bar-note">엑셀을 올리고 상품을 골라 변환합니다. 변환 규칙·검수 신호등은 정본 그대로입니다.</span>
        <button type="button" className="fcp-bar-btn" onClick={() => setReloadKey((n) => n + 1)}>새로고침</button>
        <a className="fcp-bar-btn" href={FLOW_PATH} target="_blank" rel="noreferrer">새 탭에서 열기</a>
      </div>
      {import.meta.env.DEV ? (
        // 로컬 dev(순수 vite)에는 파이썬 함수가 없어 `/flow` 가 고도 화면으로 되돌아온다.
        // 고도 안에 고도가 겹쳐 보이는 혼란을 만들지 않고 사실만 적는다.
        <div className="fcp-dev">이 화면은 배포본(Vercel)에서 열립니다. 로컬 개발 서버에는 변환기 서버가 없습니다.</div>
      ) : (
        <iframe key={reloadKey} className="fcp-frame" src={FLOW_PATH} title="단순형 변환기(정본)" />
      )}
    </div>
  );
};

export default FlowConverterPanel;

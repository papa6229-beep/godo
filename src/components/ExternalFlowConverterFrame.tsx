import React, { useCallback, useEffect, useState } from 'react';
import './ExternalFlowConverterFrame.css';

// 단순형 정본 변환기 — 이 파일은 "담기만" 한다.
//
// 변환 규칙·HTML 출력·초록/노랑/빨강 손검수 판정은 전부 외부 정본 앱(별도 Python 서버)의 것이다.
// 정본: papa6229-beep/detail-page-converter — 사용자가 `실행.bat`(또는 `python start.py`)으로 직접 띄운다.
// 여기서는 그 화면을 고도 작업창 안에 그대로 보여줄 뿐, 어떤 판정도 다시 해석하지 않는다.
//
// 서버에 CORS 설정을 요구하지 않기 위해 도달 확인은 `mode: 'no-cors'` 로만 한다(본문을 읽지 않는다).
// 프록시·서버리스 함수·환경변수를 추가하지 않는다.
export const FLOW_CONVERTER_ORIGIN = 'http://127.0.0.1:8000';

const PROBE_TIMEOUT_MS = 2500;

type Reach = 'checking' | 'ready' | 'offline';

const probeConverter = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // 응답 내용은 보지 않는다. "닿는가"만 본다. 꺼져 있으면 여기서 예외가 난다.
    await fetch(FLOW_CONVERTER_ORIGIN, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
};

export const ExternalFlowConverterFrame: React.FC = () => {
  const [reach, setReach] = useState<Reach>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void probeConverter().then((ok) => { if (!cancelled) setReach(ok ? 'ready' : 'offline'); });
    return () => { cancelled = true; };
  }, [attempt]);

  // '찾는 중'으로 되돌리는 것은 버튼을 누른 그 자리에서 한다(효과 안에서 다시 렌더시키지 않는다).
  const recheck = useCallback(() => { setReach('checking'); setAttempt((n) => n + 1); }, []);

  if (reach === 'ready') {
    return (
      <iframe
        className="efc-frame"
        // attempt 를 key 로 두면 [다시 확인] 이 프레임까지 새로 띄운다.
        key={attempt}
        src={FLOW_CONVERTER_ORIGIN}
        title="단순형 변환기(정본)"
      />
    );
  }

  return (
    <div className="efc-notice">
      <div className="efc-notice-card">
        {reach === 'checking' ? (
          <>
            <div className="efc-notice-icon">⏳</div>
            <h3 className="efc-notice-title">단순형 변환기를 찾는 중입니다…</h3>
            <p className="efc-notice-desc">{FLOW_CONVERTER_ORIGIN} 응답을 기다리고 있습니다.</p>
          </>
        ) : (
          <>
            <div className="efc-notice-icon">🔌</div>
            <h3 className="efc-notice-title">단순형 변환기를 먼저 실행해 주세요</h3>
            <p className="efc-notice-desc">
              변환기 폴더의 <b>실행.bat</b>(맥은 <b>./실행.sh</b>)을 켜면 <b>{FLOW_CONVERTER_ORIGIN}</b> 에서 뜹니다.
              켜져 있다면 아래 [다시 확인]을 눌러 주세요.
            </p>
            <p className="efc-notice-sub">
              변환기는 이 컴퓨터 안에서만 도는 프로그램이라, 고도 화면도 같은 컴퓨터에서 열어야 보입니다.
            </p>
            <button type="button" className="efc-notice-retry" onClick={recheck}>다시 확인</button>
          </>
        )}
      </div>
    </div>
  );
};

export default ExternalFlowConverterFrame;

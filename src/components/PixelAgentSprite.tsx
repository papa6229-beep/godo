import React from 'react';
import type { Agent } from '../types';
import './PixelAgentSprite.css';

interface PixelAgentSpriteProps {
  agent: Agent;
  x: number;
  y: number;
  frame: number;
  directionRow: number; // 사용하지 않고 자체 IDLE_DIRECTIONS를 영구 사용
  status: 'idle' | 'walking' | 'working' | 'thinking' | 'done';
  speech: string | null;
  moveDuration: number; 
  onClick: () => void;
}

export const SPRITE_DEBUG = {
  frameWidth: 48,
  frameHeight: 96,
  frameCount: 6,
  scale: 0.78, 
  directionRows: {
    down: 0,
    left: 1,
    right: 2,
    up: 4
  }
};

// 에이전트별 영구 고정 시선 방향 Y행 매핑 (0 = 정면, 1 = 좌측, 2 = 우측, 4 = 후면)
// 렌더러 수준에서 강제 적용하여 회전이나 그에 따른 깜빡임/사라짐 현상을 물리적으로 완전 방지합니다.
// const IDLE_DIRECTIONS: Record<string, number> = {
//   manager: 0,   // 정면 (Down)
//   cs: 2,        // 우측 (Right)
//   order: 4,     // 후면 (Up)
//   delivery: 1,  // 좌측 (Left)
//   review: 0,    // 정면 (Down)
//   marketing: 2, // 우측 (Right)
//   product: 1,   // 좌측 (Left)
//   stock: 4,     // 후면 (Up)
//   finance: 0    // 정면 (Down)
// };

export const PixelAgentSprite: React.FC<PixelAgentSpriteProps> = ({
  agent,
  x,
  y,
  frame,
  directionRow,
  status,
  speech,
  moveDuration,
  onClick
}) => {
  const getAgColor = (s: string) => {
    if (s === 'working') return '#00ff66';
    if (s === 'thinking') return '#ffd24a';
    return 'transparent';
  };

  const agColor = getAgColor(status);
  const scale = SPRITE_DEBUG.scale;

  const shellStyle = {
    left: `${x}%`,
    top: `${y}%`,
    '--move-duration': `${moveDuration}s`,
    '--agent-z': Math.floor(y * 10),
    '--ag': agColor
  } as React.CSSProperties;

  const wrapStyle = {
    '--sprite-scale': scale
  } as React.CSSProperties;

  const frameStyle = {
    backgroundImage: `url(${agent.spriteUrl})`,
    backgroundPosition: `${-(frame * SPRITE_DEBUG.frameWidth)}px ${-(directionRow * SPRITE_DEBUG.frameHeight)}px`
  } as React.CSSProperties;

  return (
    <div className={`office-agent-shell ${status}`} style={shellStyle} onClick={onClick}>
      {/* 1. 말풍선 (z-index 100) */}
      {speech && <div className="agent-speech-bubble">{speech}</div>}

      {/* 2. 네온/옐로우 링 이펙트 (z-index 1) */}
      {(status === 'working' || status === 'thinking') && (
        <div className="agent-glow-ring" />
      )}

      {/* 3. 캐릭터 스프라이트 래퍼 (z-index 10) */}
      <div className="sprite-wrap" style={wrapStyle}>
        <div className="character-frame" style={frameStyle} />
      </div>

      {/* 4. 이름표 (z-index 70) */}
      <div className="agent-name-tag">{agent.name.split(' ')[0]}</div>
    </div>
  );
};

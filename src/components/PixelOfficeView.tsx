import React, { useState, useEffect, useRef } from 'react';
import type { Agent } from '../types';
import { PixelAgentSprite } from './PixelAgentSprite';
import './PixelOfficeView.css';

interface PixelOfficeViewProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
}

interface AgentRunState {
  id: string;
  x: number;
  y: number;
  directionRow: number; // Y행 (에이전트 고유 방향으로 영구 고정)
  status: 'idle' | 'walking' | 'working' | 'thinking' | 'done';
  speech: string | null;
  frameIndex: number;
  lastMovedTime: number; 
  moveDuration: number; 
}

// 오피스 부서별 주요 웨이포인트 정의
// 말풍선이 상단 경계 밖으로 넘치지 않도록 Y축 최소 시작점을 32%로 아래로 내림
const OFFICE_WAYPOINTS = [
  { name: 'ceo-room', x: 13, y: 32 },
  { name: 'meeting-room', x: 48, y: 34 },
  { name: 'dev-zone', x: 47, y: 55 },
  { name: 'cs-zone', x: 18, y: 38 },
  { name: 'marketing-zone', x: 76, y: 33 },
  { name: 'inventory-zone', x: 84, y: 48 },
  { name: 'review-zone', x: 28, y: 70 },
  { name: 'lounge', x: 17, y: 78 },
  { name: 'library', x: 82, y: 76 },
  { name: 'coffee-zone', x: 68, y: 44 }
];

// 에이전트별 기본 대기 시선 방향 Y행 고정 매핑
// 회전 시 점멸/사라짐 현상을 완전히 방지하기 위해, 캐릭터는 평생 이 지정된 시선 방향 한 가지만 유지합니다.
// const IDLE_DIRECTIONS: Record<string, number> = {
//   manager: 0,   // 정면
//   cs: 2,        // 우측
//   order: 4,     // 후면
//   delivery: 1,  // 좌측
//   review: 0,    // 정면
//   marketing: 2, // 우측
//   product: 1,   // 좌측
//   stock: 4,     // 후면
//   finance: 0    // 정면
// };

const WALK_SEQUENCE = [0, 1, 2, 3, 4, 5];

// 맵 경계 clamp (말풍선 헤드룸 확보를 위해 MIN_Y를 32로 조정)
const MIN_X = 8;
const MAX_X = 92;
const MIN_Y = 32; 
const MAX_Y = 85; 

export const PixelOfficeView: React.FC<PixelOfficeViewProps> = ({ agents, onSelectAgent }) => {
  const [runStates, setRunStates] = useState<Record<string, AgentRunState>>({});
  
  const globalFrameRef = useRef(0);
  const animationFrameIdRef = useRef<number | null>(null);
  
  const runStatesRef = useRef<Record<string, AgentRunState>>({});
  const lastActiveIdsRef = useRef<string[]>([]); 
  
  const agentsRef = useRef<Agent[]>(agents);
  
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  // 1. 초기 상태 세팅 (모두 대기 시 주문, 재고 캐릭터처럼 Y축 4행 뒷모습으로 시작)
  useEffect(() => {
    const initialStates: Record<string, AgentRunState> = {};
    const now = Date.now();

    agentsRef.current.forEach((agent) => {
      const startX = Math.max(MIN_X, Math.min(MAX_X, agent.initialX ?? 50));
      const startY = Math.max(MIN_Y, Math.min(MAX_Y, agent.initialY ?? 50));

      initialStates[agent.id] = {
        id: agent.id,
        x: startX,
        y: startY,
        directionRow: 4, // 대기 상태이므로 4행(후면)
        status: 'idle',
        speech: null,
        frameIndex: 1, 
        lastMovedTime: now - Math.random() * 8000, 
        moveDuration: 1.1
      };
    });
    setRunStates(initialStates);
    runStatesRef.current = initialStates;
  }, []);

  // 2. 외부 에이전트 시뮬레이션 상태 동기화
  useEffect(() => {
    setRunStates((prev) => {
      const next = { ...prev };
      let changed = false;

      agentsRef.current.forEach((agent) => {
        const current = next[agent.id];
        if (!current) return;

        if (agent.status === 'working' && current.status !== 'working') {
          next[agent.id] = {
            ...current,
            status: 'working',
            directionRow: 4, // 제자리 작동은 후면(주문, 재고 모션)인 4행으로 통일
            speech: agent.bubbleText ?? '열심히 분석 중입니다!'
          };
          changed = true;
        } else if (agent.status === 'completed' && current.status !== 'done') {
          next[agent.id] = {
            ...current,
            status: 'done',
            directionRow: 4, // 제자리 작동은 후면(주문, 재고 모션)인 4행으로 통일
            speech: '작업을 완수했습니다! 🎉'
          };
          changed = true;

          setTimeout(() => {
            setRunStates((latest) => {
              if (latest[agent.id]?.status === 'done') {
                return {
                  ...latest,
                  [agent.id]: {
                    ...latest[agent.id],
                    status: 'idle',
                    speech: null
                  }
                };
              }
              return latest;
            });
          }, 2000);
        } else if (agent.status === 'idle' && (current.status === 'working' || current.status === 'done')) {
          next[agent.id] = {
            ...current,
            status: 'idle',
            speech: null
          };
          changed = true;
        }
      });

      if (changed) {
        runStatesRef.current = next;
        return next;
      }
      return prev;
    });
  }, [agents]);

  // 3. requestAnimationFrame 기반 스프라이트 틱
  // 제자리에 있을 때는 주문/재고처럼 뒷모습(Y=4)에 걷기 프레임을 느리게 재생하여 제자리 머리/손 꼼지락거림을 구현하고,
  // 이동할 때는 마케팅/CS처럼 우측 방향(Y=2)으로 걷기 프레임을 재생하도록 일원화
  useEffect(() => {
    const tick = () => {
      globalFrameRef.current++;

      setRunStates((prev) => {
        const next = { ...prev };
        let changed = false;

        Object.keys(next).forEach((id) => {
          const char = next[id];
          
          if (char.status === 'idle' || char.status === 'working' || char.status === 'thinking' || char.status === 'done') {
            // 제자리 대기/작업: Y=4 (후면), 프레임 꼬물거림은 나누기 8로 약간 느리게
            const nextFrame = WALK_SEQUENCE[Math.floor(globalFrameRef.current / 8) % WALK_SEQUENCE.length];
            if (char.frameIndex !== nextFrame || char.directionRow !== 4) {
              next[id] = {
                ...char,
                frameIndex: nextFrame, 
                directionRow: 4
              };
              changed = true;
            }
          } else if (char.status === 'walking') {
            // 이동 중: Y=2 (우측), 프레임 루프는 나누기 5로 빠르게
            const nextFrame = WALK_SEQUENCE[Math.floor(globalFrameRef.current / 5) % WALK_SEQUENCE.length];
            if (char.frameIndex !== nextFrame || char.directionRow !== 2) {
              next[id] = { 
                ...char, 
                frameIndex: nextFrame,
                directionRow: 2
              };
              changed = true;
            }
          }
        });

        if (changed) {
          runStatesRef.current = next;
          return next;
        }
        return prev;
      });

      animationFrameIdRef.current = requestAnimationFrame(tick);
    };

    animationFrameIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, []);

  // 4. 겹침 방지 충돌 회피 알고리즘을 유지한 자율 웨이포인트 이동 (회전 로직 제외)
  useEffect(() => {
    const triggerMove = () => {
      const now = Date.now();
      const ids = Object.keys(runStatesRef.current);
      if (ids.length === 0) return;

      const idleCandidates = ids.filter(id => runStatesRef.current[id].status === 'idle');
      if (idleCandidates.length === 0) return;

      const starvedCandidates = idleCandidates.filter(id => (now - runStatesRef.current[id].lastMovedTime) > 15000);

      let chosenIds: string[] = [];

      // 한 번에 최대 1명만 이동하여 오피스의 분주함을 방지하고 정숙함 확보
      if (starvedCandidates.length > 0) {
        chosenIds = starvedCandidates.slice(0, 1);
      } else {
        const freshCandidates = idleCandidates.filter(id => !lastActiveIdsRef.current.includes(id));
        const finalPool = freshCandidates.length > 0 ? freshCandidates : idleCandidates;
        
        // 50% 확률로 단 1명만 이동하도록 제어
        if (Math.random() > 0.5) {
          const shuffled = [...finalPool].sort(() => Math.random() - 0.5);
          chosenIds = shuffled.slice(0, 1);
        }
      }

      if (chosenIds.length > 0) {
        lastActiveIdsRef.current = [...chosenIds];
      }

      chosenIds.forEach((targetId) => {
        const char = runStatesRef.current[targetId];
        if (!char) return;

        const validWaypoints = OFFICE_WAYPOINTS.filter(wp => {
          const distance = Math.sqrt(Math.pow(wp.x - char.x, 2) + Math.pow(wp.y - char.y, 2));
          return distance >= 10;
        });

        const targetWp = validWaypoints.length > 0
          ? validWaypoints[Math.floor(Math.random() * validWaypoints.length)]
          : OFFICE_WAYPOINTS[Math.floor(Math.random() * OFFICE_WAYPOINTS.length)];

        // 충돌 방지 6% 거리 연산
        let targetX = char.x;
        let targetY = char.y;
        let attempts = 0;

        while (attempts < 15) {
          const offsetX = (Math.random() * 12) - 6; 
          const offsetY = (Math.random() * 10) - 5; 
          
          const testX = Math.max(MIN_X, Math.min(MAX_X, targetWp.x + offsetX));
          const testY = Math.max(MIN_Y, Math.min(MAX_Y, targetWp.y + offsetY));

          let tooClose = false;
          
          for (const otherId of ids) {
            if (otherId === targetId) continue;
            const otherChar = runStatesRef.current[otherId];
            if (!otherChar) continue;

            const dist = Math.sqrt(Math.pow(testX - otherChar.x, 2) + Math.pow(testY - otherChar.y, 2));
            if (dist < 6) { 
              tooClose = true;
              break;
            }
          }

          if (!tooClose) {
            targetX = testX;
            targetY = testY;
            break; 
          }
          attempts++;
        }

        if (targetX === char.x && targetY === char.y) {
          targetX = Math.max(MIN_X, Math.min(MAX_X, targetWp.x + (Math.random() * 14 - 7)));
          targetY = Math.max(MIN_Y, Math.min(MAX_Y, targetWp.y + (Math.random() * 12 - 6)));
        }

        const dx = targetX - char.x;
        const dy = targetY - char.y;
        const distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));

        const duration = Math.min(1.8, Math.max(0.8, distance / 18));

        setRunStates((prev) => {
          const next = { ...prev };
          next[targetId] = {
            ...next[targetId],
            x: targetX,
            y: targetY,
            directionRow: 2, // 이동할 때는 마케팅/CS처럼 Y행 2(우측)로 강제 고정
            status: 'walking',
            moveDuration: duration,
            lastMovedTime: now
          };
          runStatesRef.current = next;
          return next;
        });

        // 이동 완료 후 연출
        setTimeout(() => {
          const postStatus = Math.random() > 0.5 ? 'working' : 'thinking';
          const original = agentsRef.current.find(a => a.id === targetId);
          const postSpeech = postStatus === 'working' ? '작업 재개! ⚙️' : '아이디어 연산 중.. 🤔';

          setRunStates((prev) => {
            const next = { ...prev };
            if (next[targetId] && next[targetId].status === 'walking') {
              next[targetId] = {
                ...next[targetId],
                status: postStatus,
                speech: postSpeech,
                directionRow: 4 // 이동 완료 후 대기/작업 시 Y행 4(후면)로 강제 원복
              };
            }
            runStatesRef.current = next;
            return next;
          });

          const postDuration = (Math.random() * 1000) + 500;
          setTimeout(() => {
            setRunStates((prev) => {
              const next = { ...prev };
              if (next[targetId] && (next[targetId].status === 'working' || next[targetId].status === 'thinking')) {
                const externalStatus = original?.status ?? 'idle';
                if (externalStatus === 'idle') {
                  next[targetId] = {
                    ...next[targetId],
                    status: 'idle',
                    speech: null,
                    directionRow: 4 // 제자리 대기는 4행 후면 모션 고정
                  };
                }
              }
              runStatesRef.current = next;
              return next;
            });
          }, postDuration);

        }, duration * 1000);
      });
    };

    // 캐릭터의 무작위 이동 간격을 기존 1.6초에서 4.5초로 변경하여 정신없이 움직이는 것을 완화
    const interval = setInterval(triggerMove, 4500); 

    return () => {
      clearInterval(interval);
    };
  }, []);

  // 5. 자율 3.5초~6초 무작위 말풍선 팝업
  useEffect(() => {
    const runSpeechSim = () => {
      const ids = Object.keys(runStatesRef.current);
      if (ids.length === 0) return;

      const idleCandidates = ids.filter(id => runStatesRef.current[id].status === 'idle' && !runStatesRef.current[id].speech);
      if (idleCandidates.length > 0) {
        const randomId = idleCandidates[Math.floor(Math.random() * idleCandidates.length)];
        const originalAgent = agentsRef.current.find((a) => a.id === randomId);

        if (originalAgent) {
          setRunStates((prev) => {
            const next = { ...prev };
            next[randomId] = {
              ...next[randomId],
              speech: originalAgent.bubbleText ?? '대기 중...'
            };
            runStatesRef.current = next;
            return next;
          });

          const bubbleTime = (Math.random() * 1500) + 2500;
          setTimeout(() => {
            setRunStates((prev) => {
              const next = { ...prev };
              if (next[randomId] && next[randomId].speech === originalAgent.bubbleText) {
                next[randomId] = {
                  ...next[randomId],
                  speech: null
                };
              }
              runStatesRef.current = next;
              return next;
            });
          }, bubbleTime);
        }
      }

      const nextSpeechDelay = (Math.random() * 2500) + 3500;
      speechTimeoutRef.current = setTimeout(runSpeechSim, nextSpeechDelay);
    };

    const speechTimeoutRef = { current: setTimeout(runSpeechSim, 5000) };

    return () => {
      clearTimeout(speechTimeoutRef.current);
    };
  }, []); 

  return (
    <div className="pixel-office-viewport">
      <div className="office-map-frame">
        {/* 사무실 지도 */}
        <img src="/assets/map.jpeg" alt="Pixel Office Map" className="office-map-image" />
        
        {/* 네온 필터 가림막 */}
        <div className="pixel-office-overlay"></div>

        {/* 에이전트 캐릭터 노드 렌더링 */}
        {Object.values(runStates).map((char) => {
          const originalAgent = agents.find((a) => a.id === char.id);
          if (!originalAgent) return null;

          return (
            <PixelAgentSprite
              key={char.id}
              agent={originalAgent}
              x={char.x}
              y={char.y}
              frame={char.frameIndex}
              directionRow={char.directionRow}
              status={char.status}
              speech={char.speech}
              moveDuration={char.moveDuration}
              onClick={() => onSelectAgent(originalAgent)}
            />
          );
        })}
      </div>
    </div>
  );
};

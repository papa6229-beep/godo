import React, { useState, useRef, useEffect } from 'react';
import type { Agent } from '../types';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import type { ControlChatMessage, ControlTaskCandidate } from '../types/controlChat';
import { processControlChat } from '../services/controlChatService';
import './ChatConsole.css';

function generateMessageId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
}

interface ChatConsoleProps {
  activeOperationsData: OperationsDataSnapshot;
  tasks: OperationTask[];
  approvalQueue: ApprovalItem[];
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
  onAddTask: (title: string, agentId: string) => void;
  onStartSimulation: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  agents: Agent[];
  onUpdateAgents: (items: Agent[]) => void;
  isLarge?: boolean;
  isSimulating?: boolean;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  activeOperationsData,
  tasks,
  approvalQueue,
  onAddLog,
  onAddTask,
  onStartSimulation,
  onApprove,
  onReject,
  agents,
  onUpdateAgents,
  isLarge = false,
  isSimulating = false
}) => {
  const [messages, setMessages] = useState<ControlChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Godo AI Operating Center에 오신 것을 환영합니다. 원하시는 운영 지시를 입력하거나 아래 추천 명령 템플릿을 선택하십시오. 로컬 Gemma AI가 안전 감시 레이어와 함께 상시 대기 중입니다.',
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour12: false })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 3D 파티클 네트워크 (Three.js) 초기화 및 구동
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    let animationId: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any;
    let resizeHandler: () => void;

    const initThree = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const THREE = (window as any).THREE;
      if (!THREE) {
        setTimeout(initThree, 100);
        return;
      }

      const rect = canvasEl.getBoundingClientRect();
      const width = rect.width || canvasEl.clientWidth || 300;
      const height = rect.height || canvasEl.clientHeight || 220;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
      camera.position.z = 150;

      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        alpha: true,
        antialias: true
      });
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      interface BrainPoint {
        x: number;
        y: number;
        z: number;
        distanceTo: (other: BrainPoint) => number;
      }
      const points: BrainPoint[] = [];
      const networkGroup = new THREE.Group();

      const brainParticleCount = 55;
      const rxBase = 44.8;
      const ryBase = 39.2;
      const rzBase = 53.2;

      for (let i = 0; i < brainParticleCount; i++) {
        const yCoord = 1.0 - (i / (brainParticleCount - 1)) * 2.0; 
        const radiusAtY = Math.sqrt(1.0 - yCoord * yCoord);

        const goldenAngle = Math.PI * (3.0 - Math.sqrt(5.0));
        const theta = i * goldenAngle;
        const phi = Math.acos(yCoord);

        const gyri = Math.sin(theta * 4.0) * Math.cos(phi * 4.0) * 4.2;
        const rx = rxBase + gyri;
        const ry = ryBase + gyri;
        const rz = rzBase + gyri;

        let x = rx * radiusAtY * Math.cos(theta);
        let y = ry * yCoord;
        const z = rz * radiusAtY * Math.sin(theta);

        if (y < 0) {
          y *= 0.82;
        }

        const absX = Math.abs(x);
        if (absX < 9.5) {
          y -= (9.5 - absX) * 0.75;
        }
        x += (x > 0 ? 5.2 : -5.2);

        points.push(new THREE.Vector3(x, y, z));
      }

      const stemCount = 8;
      for (let i = 0; i < stemCount; i++) {
        const stemY = -28 - (i * 3.92);
        const angle = (i * 1.5) + (Math.random() * 0.5);
        const stemRadius = 5.88 * (1.0 - (i * 0.06));
        const stemX = Math.cos(angle) * stemRadius;
        const stemZ = -8.4 + Math.sin(angle) * stemRadius;

        points.push(new THREE.Vector3(stemX, stemY, stemZ));
      }

      const totalPointsCount = points.length;

      const pointGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(totalPointsCount * 3);
      for (let i = 0; i < totalPointsCount; i++) {
        positions[i * 3] = points[i].x;
        positions[i * 3 + 1] = points[i].y;
        positions[i * 3 + 2] = points[i].z;
      }
      pointGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const pointMat = new THREE.PointsMaterial({
        color: 0x00ff88,
        size: 2.2,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true
      });
      const pointCloud = new THREE.Points(pointGeo, pointMat);
      networkGroup.add(pointCloud);

      const linePositions: number[] = [];
      const neighborsCount = 4; 

      for (let i = 0; i < totalPointsCount; i++) {
        const distances = [];
        for (let j = 0; j < totalPointsCount; j++) {
          if (i === j) continue;
          
          let dist = points[i].distanceTo(points[j]);
          
          if (points[i].x * points[j].x < 0 && dist > 25) {
            dist += 45; 
          }
          
          distances.push({ index: j, dist: dist });
        }
        
        distances.sort((a, b) => a.dist - b.dist);
        
        for (let k = 0; k < neighborsCount; k++) {
          const neighborIndex = distances[k].index;
          if (i < neighborIndex) {
            linePositions.push(points[i].x, points[i].y, points[i].z);
            linePositions.push(points[neighborIndex].x, points[neighborIndex].y, points[neighborIndex].z);
          }
        }
      }

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x1D9E75,
        transparent: true,
        opacity: 0.28
      });
      const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
      networkGroup.add(lineSegments);

      networkGroup.rotation.x = 0.25; 
      scene.add(networkGroup);

      interface DynamicParticle {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mesh: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        velocity: any;
        life: number;
        decay: number;
      }
      const dynamicParticles: DynamicParticle[] = [];

      const animate = () => {
        networkGroup.rotation.y += 0.0022;

        if (Math.random() < 0.07 && dynamicParticles.length < 12) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          const r = Math.random() * 18;
          
          const px = r * Math.sin(phi) * Math.cos(theta);
          const py = r * Math.sin(phi) * Math.sin(theta);
          const pz = r * Math.cos(phi);

          const geom = new THREE.SphereGeometry(0.7, 3, 3);
          const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.01
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(px, py, pz);

          const speed = 0.15 + Math.random() * 0.2;
          const dir = new THREE.Vector3(px, py, pz).normalize();
          const velocity = dir.multiplyScalar(speed);

          networkGroup.add(mesh);

          dynamicParticles.push({
            mesh: mesh,
            velocity: velocity,
            life: 1.0,
            decay: 0.015 + Math.random() * 0.02
          });
        }

        for (let i = dynamicParticles.length - 1; i >= 0; i--) {
          const dp = dynamicParticles[i];
          dp.mesh.position.add(dp.velocity);
          dp.life -= dp.decay;

          if (dp.life > 0.7) {
            dp.mesh.material.opacity = (1.0 - dp.life) * 3.3;
          } else if (dp.life < 0.45) {
            dp.mesh.material.opacity = (dp.life / 0.45);
          } else {
            dp.mesh.material.opacity = 1.0;
          }

          if (dp.life <= 0) {
            networkGroup.remove(dp.mesh);
            dp.mesh.geometry.dispose();
            dp.mesh.material.dispose();
            dynamicParticles.splice(i, 1);
          }
        }

        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };

      animate();

      resizeHandler = () => {
        if (!canvasEl) return;
        const r = canvasEl.getBoundingClientRect();
        const w = r.width || canvasEl.clientWidth || 300;
        const h = r.height || canvasEl.clientHeight || 220;

        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };

      window.addEventListener('resize', resizeHandler);
    };

    initThree();

    return () => {
      cancelAnimationFrame(animationId);
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
      if (renderer) {
        renderer.dispose();
      }
    };
  }, []);

  const templates = isSimulating
    ? [
        '승인 대기 중인 작업 있어?',
        '미답변 문의부터 보여줘.',
        '재고 위험 상품 알려줘.',
        '다 확인했으니 전부 승인해.'
      ]
    : [
        '오늘의 운영 시작해줘.',
        '오늘 뭐부터 확인하면 돼?',
        '현재 연결 상태 알려줘.'
      ];

  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskAgent, setQuickTaskAgent] = useState(agents[0]?.id || 'cs');

  const handleQuickTaskAdd = () => {
    if (!quickTaskTitle.trim()) return;
    onAddTask(quickTaskTitle, quickTaskAgent);
    
    // 에이전트 이름 가져오기
    const selectedAgent = agents.find(a => a.id === quickTaskAgent);
    const agentName = selectedAgent ? selectedAgent.name : 'AI 에이전트';
    
    onAddLog(`[Quick Add] [${quickTaskTitle}] 작업이 ${agentName}에게 배정되었습니다.`, 'success');
    setQuickTaskTitle('');
  };

  function getFormattedTime() {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isTyping) return;

    // 사용자 메시지 추가
    const userMsg: ControlChatMessage = {
      id: generateMessageId('msg-user'),
      role: 'user',
      content: text,
      createdAt: getFormattedTime()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await processControlChat(
        text,
        activeOperationsData,
        tasks,
        approvalQueue
      );

      const aiMsg: ControlChatMessage = {
        id: generateMessageId('msg-ai'),
        role: response.role || 'assistant',
        content: response.content || '',
        intent: response.intent,
        taskCandidate: response.taskCandidate,
        delegationResult: response.delegationResult,
        actionPlan: response.actionPlan,
        actionTriggered: response.actionTriggered,
        createdAt: response.createdAt || getFormattedTime()
      };

      setMessages((prev) => [...prev, aiMsg]);

      // 의도에 따른 시스템 액션 실시간 트리거 및 기록 연동 (LEVEL 2 & 3 & 4)
      if (response.actionTriggered) {
        const act = response.actionTriggered;
        
        if (act.type === 'start_operation') {
          onStartSimulation();
          onAddLog('운영자가 채팅 명령을 통해 오늘의 전체 자동 운영을 구동시켰습니다.', 'success', 'CEO');
        } else if (act.type === 'approve_all') {
          const pendingWaiting = approvalQueue.filter(a => a.status === 'waiting');
          pendingWaiting.forEach(item => {
            onApprove(item.id);
          });
          onAddLog(`운영자가 채팅 명령을 통해 모든 대기 작업(${pendingWaiting.length}건)을 일괄 승인했습니다.`, 'success', 'CEO');
        } else if (act.type === 'approve_item' && act.targetId) {
          onApprove(act.targetId);
          onAddLog(`운영자가 채팅 명령을 통해 대기 작업(ID: ${act.targetId})을 승인했습니다.`, 'success', 'CEO');
        } else if (act.type === 'reject_all') {
          const pendingWaiting = approvalQueue.filter(a => a.status === 'waiting');
          pendingWaiting.forEach(item => {
            onReject(item.id);
          });
          onAddLog(`운영자가 채팅 명령을 통해 모든 대기 작업(${pendingWaiting.length}건)을 반려(거절)했습니다.`, 'error', 'CEO');
        } else if (act.type === 'reject_item' && act.targetId) {
          onReject(act.targetId);
          onAddLog(`운영자가 채팅 명령을 통해 대기 작업(ID: ${act.targetId})을 반려(거절)했습니다.`, 'error', 'CEO');
        } else if (act.type === 'update_agent_name' && act.targetId && act.payload?.newName) {
          const newName = act.payload.newName as string;
          const updated = agents.map(a => 
            a.id === act.targetId 
              ? { ...a, name: newName, bubbleText: `이름이 '${newName}'(으)로 갱신되었습니다! ✨` } 
              : a
          );
          onUpdateAgents(updated);
          onAddLog(`운영자가 [${act.targetId}] AI 직원의 이름을 "${act.payload.newName}"(으)로 변경했습니다.`, 'success', 'SYSTEM');
        }
      }

      // 민감 작업 요청 로깅 (LEVEL 4)
      if (response.actionPlan) {
        const plan = response.actionPlan;
        if (plan.executionStatus === 'api_not_connected') {
          onAddLog(`운영자가 [${plan.title}] 실행을 요청했으나, 외부 고도몰 API 미연동으로 보류 및 실행 대기 이력으로 저장되었습니다.`, 'warning', 'SYSTEM');
        }
      }

    } catch {
      const errorMsg: ControlChatMessage = {
        id: generateMessageId('msg-error'),
        role: 'system',
        content: '로컬 AI가 잠시 응답하지 않습니다. LM Studio가 켜져 있는지 확인해 주세요.',
        createdAt: getFormattedTime()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleAddCandidateTask = (candidate: ControlTaskCandidate) => {
    onAddTask(candidate.title, candidate.agentId);
    onAddLog(`[Control Chat] 작업 후보 [${candidate.title}]가 Today's Tasks에 추가되었습니다.`, 'success');
    
    const noticeMsg: ControlChatMessage = {
      id: generateMessageId('msg-notice'),
      role: 'system',
      content: `✓ [${candidate.title}] 작업 후보가 오른쪽 Today's Tasks에 정식 배정되었습니다. AI 에이전트의 실행 결과를 확인해 주세요.`,
      createdAt: getFormattedTime()
    };
    setMessages((prev) => [...prev, noticeMsg]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputValue);
    }
  };

  const getIntentBadge = (intent: string) => {
    switch (intent) {
      case 'start_operation':
        return <span className="intent-badge instruction">⚙ 운영 시작</span>;
      case 'approval_command':
        return <span className="intent-badge approval-q">✓ 승인 명령</span>;
      case 'settings_change_request':
        return <span className="intent-badge info-q">⚙ 설정 변경</span>;
      case 'sensitive_action_request':
        return <span className="intent-badge unsafe">⚠ 실행 제한</span>;
      case 'confirmed_action_request':
        return <span className="intent-badge unsafe">⚠ 외부 요청</span>;
      case 'agent_delegation_request':
        return <span className="intent-badge instruction">⚡ AI 위임</span>;
      case 'operation_question':
        return <span className="intent-badge info-q">📊 운영 질문</span>;
      default:
        return null;
    }
  };

  return (
    <div className={`chat-console ${isLarge ? 'large-console' : ''}`}>
      <div className="chat-header">
        <span className="terminal-dot green"></span>
        <div className="chat-header-text-group" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="chat-header-title">OPERATIONAL CONTROL CHAT</span>
          <span className="chat-header-subtitle" style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #a0aec0)' }}>
            총괄 매니저 콘솔 | 운영 지시, 승인, 에이전트 호출을 이곳에서 처리합니다.
          </span>
        </div>
      </div>

      <div className="chat-3d-container">
        <canvas ref={canvasRef} className="chat-3d-canvas" />
      </div>

      <div className="chat-messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role === 'user' ? 'user' : (msg.role === 'system' ? 'system' : 'agent')}`}>
            <div className="message-meta">
              <span className="message-sender">
                {msg.role === 'user' ? '운영자' : (msg.role === 'system' ? 'GODO AI HQ' : '총괄 매니저 AI')}
              </span>
              {msg.intent && getIntentBadge(msg.intent)}
              <span className="message-time">[{msg.createdAt}]</span>
            </div>
            <div className="message-body">
              {msg.content}
              
              {/* 에이전트 지시로 생성된 작업 후보 추가 버튼 */}
              {msg.role === 'assistant' && msg.taskCandidate && (
                <div className="chat-candidate-action-card">
                  <div className="candidate-details">
                    <span className="candidate-title">💡 작업 후보: <strong>{msg.taskCandidate.title}</strong></span>
                    <span className="candidate-meta">
                      담당: {msg.taskCandidate.agentId === 'cs_agent' ? 'CS 상담 AI' : 
                             msg.taskCandidate.agentId === 'review_agent' ? '리뷰 AI' : 
                             msg.taskCandidate.agentId === 'inventory_agent' ? '재고 AI' : 
                             msg.taskCandidate.agentId === 'marketing_agent' ? '마케팅 AI' : '에이전트'} | 
                      위험도: <strong className={msg.taskCandidate.riskLevel}>{msg.taskCandidate.riskLevel.toUpperCase()}</strong>
                    </span>
                  </div>
                  <button 
                    type="button" 
                    className="btn primary candidate-add-btn"
                    onClick={() => handleAddCandidateTask(msg.taskCandidate!)}
                  >
                    Today's Tasks에 작업 추가하기
                  </button>
                </div>
              )}

              {/* 액션 플랜 렌더링 카드 (LEVEL 4) */}
              {msg.role === 'assistant' && msg.actionPlan && (
                <div className="chat-candidate-action-card" style={{ borderColor: 'rgba(255, 77, 77, 0.25)' }}>
                  <div className="candidate-details">
                    <span className="candidate-title">📋 {msg.actionPlan.title}</span>
                    <span className="candidate-meta">
                      위험도: <strong className={`${msg.actionPlan.riskLevel} risk-strong-danger`}>{msg.actionPlan.riskLevel.toUpperCase()}</strong> |
                      상태: <strong className="status-strong-warning">
                        {msg.actionPlan.executionStatus === 'missing_required_fields' ? '필수 조건 부족' : 'API 미연동 보류'}
                      </strong>
                    </span>
                    <div style={{ marginTop: '5px', fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '4px' }}>
                      <strong>수집된 조건:</strong>
                      <ul style={{ margin: '3px 0', paddingLeft: '15px' }}>
                        {Object.entries(msg.actionPlan.collectedFields).map(([k, v]) => (
                          <li key={k}>{k}: {String(v)}</li>
                        ))}
                      </ul>
                      {msg.actionPlan.missingFields.length > 0 && (
                        <div className="missing-fields-strong" style={{ marginTop: '3px' }}>
                          <strong>누락된 필수 항목:</strong> {msg.actionPlan.missingFields.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="chat-message agent typing">
            <div className="message-meta">
              <span className="message-sender">AI 에이전트 팀</span>
              <span className="message-time">[{getFormattedTime()}]</span>
            </div>
            <div className="message-body">
              <span className="dot-pulse-1">.</span>
              <span className="dot-pulse-2">.</span>
              <span className="dot-pulse-3">.</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 가로형 퀵 태스크 추가 바 (Quick Task Add Bar) */}
      <div className="chat-quick-task-bar">
        <span className="quick-bar-label">⚡ Quick Task Add</span>
        <input 
          type="text" 
          value={quickTaskTitle}
          onChange={(e) => setQuickTaskTitle(e.target.value)}
          placeholder="예: 리뷰 답글 초안 만들어줘"
          className="quick-bar-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleQuickTaskAdd();
          }}
        />
        <select 
          value={quickTaskAgent}
          onChange={(e) => setQuickTaskAgent(e.target.value)}
          className="quick-bar-select"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.emoji} {agent.name.split(' ')[0]}
            </option>
          ))}
        </select>
        <button 
          type="button" 
          onClick={handleQuickTaskAdd}
          className="quick-bar-btn"
        >
          ADD
        </button>
      </div>

      <div className="chat-templates">
        {templates.map((tpl, i) => (
          <button key={i} className="template-btn" onClick={() => handleSend(tpl)}>
            💡 {tpl}
          </button>
        ))}
      </div>

      <div className="chat-input-form">
        <span className="chat-prompt-symbol">&gt;</span>
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="총괄 매니저 AI에게 운영 지시를 입력하세요. 예: 오늘의 운영 시작해줘."
          className="chat-input-textarea"
          rows={1}
        />
        <button 
          type="button" 
          onClick={() => handleSend(inputValue)} 
          className="chat-send-btn"
          disabled={!inputValue.trim() || isTyping}
        >
          SEND
        </button>
      </div>
    </div>
  );
};

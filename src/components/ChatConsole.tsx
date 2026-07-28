import React, { useState, useRef, useEffect } from 'react';
import type { Agent } from '../types';
import type { OperationsDataSnapshot } from '../types/dataConnector';
import type { OperationTask } from '../types/task';
import type { ApprovalItem } from '../types/approval';
import type { ControlChatMessage, ControlTaskCandidate } from '../types/controlChat';
import { processControlChat } from '../services/controlChatService';
import { teamOfAgent } from '../services/taskLifecycleAppAdapter';
import { VIEWER_ROLES } from '../services/sessionRole';

// 업무를 받을 팀(총괄 자신은 지시 대상이 아니다).
const TARGET_TEAMS = VIEWER_ROLES.filter((r) => r.id !== 'hq');
import { getGlobalBrainSelection, providerLabel, isBrainConnected } from '../services/aiBrainSettings';
import { loadHqMessages, saveHqMessages } from '../services/repositories/chatMemoryRepository';
import { answerCommerceQuestion } from '../services/commerceDataQueryEngine';
import { understandCommerceQuery } from '../services/marketingAnalyticsQueryCompilerLlm';
import { resolveRealOrdersDisplay, realOrdersPhrase, type RevenueScreenState } from '../services/revenueScreenState';
import { callMarketingPlannerLlm } from '../services/departmentChatService';
import { MarketingChartSpecPanel } from './MarketingAnalysisDashboard';
import type { MarketingChatChartArtifact } from '../services/marketingChatChartSpec';
import type { RevenueResult } from '../services/departmentDataService';
import './ChatConsole.css';

function generateMessageId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
}

interface ChatConsoleProps {
  activeOperationsData: OperationsDataSnapshot;
  tasks: OperationTask[];
  approvalQueue: ApprovalItem[];
  onAddLog: (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'agent', agentName?: string) => void;
  /** RC-2 D-1.2: 업무는 **팀에게** 보낸다(수행 방식은 담당 팀장이 고른다). 두 번째 인자는 팀 id. */
  onAddTask: (title: string, targetTeamId: string) => void;
  onStartSimulation: () => void;
  onApprove: (id: string) => void;
  agents: Agent[];
  onUpdateAgents: (items: Agent[]) => void;
  isLarge?: boolean;
  isSimulating?: boolean;
  // 있으면 하단 Quick Task Add 바를 이 슬롯으로 대체(오늘의 운영: 팀 지시+파일 바).
  quickBarSlot?: React.ReactNode;
  // 있으면 통계/그래프 질문을 부서 채팅과 동일한 Commerce Query 엔진으로 답한다(오늘의 운영 HQ 채팅).
  /**
   * Local migration: 얇은 복사본 대신 **매출 응답 전체**를 받는다.
   *   `undefined` = 이 prop 을 쓰지 않는 기존 화면(오늘의 운영 전용 통계 기능 미사용).
   *   `null`      = 오늘의 운영에서 **아직 불러오는 중**.
   *   객체        = 요청 완료(성공·0건·연결 실패가 slice 상태로 구분돼 있다).
   */
  revenue?: RevenueResult | null;
  /** 위 응답의 공통 판정 결과(`screenStateFromRevenue`). 화면이 규칙을 다시 만들지 않는다. */
  revenueScreenState?: RevenueScreenState | null;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  activeOperationsData,
  tasks,
  approvalQueue,
  onAddLog,
  onAddTask,
  onStartSimulation,
  onApprove,
  agents,
  onUpdateAgents,
  isLarge = false,
  isSimulating = false,
  quickBarSlot,
  revenue,
  revenueScreenState
}) => {
  // 커머스 질의 결과 차트(오늘의 운영 HQ 채팅). 비영속.
  const [commerceChart, setCommerceChart] = useState<MarketingChatChartArtifact | null>(null);
  // 탭 이동/새로고침 후에도 유지되도록 localStorage에서 복원 (없으면 환영 메시지)
  const [messages, setMessages] = useState<ControlChatMessage[]>(() => loadHqMessages());
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
    let retryTimer: number | undefined; // THREE 로딩 대기 재시도 타이머(정리 대상)
    let cancelled = false;              // 언마운트 후 구동 방지

    const initThree = () => {
      if (cancelled) return; // 언마운트되었으면 씬/루프/리스너 생성 안 함(누수 방지)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const THREE = (window as any).THREE;
      if (!THREE) {
        retryTimer = window.setTimeout(initThree, 100); // id 추적 → cleanup에서 제거
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
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer); // 재시도 타이머 정리(핵심 누수 차단)
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
  const [quickTaskTeam, setQuickTaskTeam] = useState<string>(TARGET_TEAMS[0].id);

  const handleQuickTaskAdd = () => {
    if (!quickTaskTitle.trim()) return;
    onAddTask(quickTaskTitle, quickTaskTeam);

    const team = TARGET_TEAMS.find(t => t.id === quickTaskTeam);
    onAddLog(`[Quick Add] [${quickTaskTitle}] 업무를 ${team ? team.label : quickTaskTeam}에게 전달했습니다. 수행 방식은 담당 팀장이 정합니다.`, 'success');
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

  // HQ 채팅 기록 영속화 (탭 이동/새로고침 유지). 최근 메시지만 저장.
  useEffect(() => {
    saveHqMessages(messages);
  }, [messages]);

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

    // ── 주문 통계 질문 처리 ──────────────────────────────────────────────────
    // Local migration: 이전에는 `commerceData.orders.length` 로만 분기해서, 0건이거나
    //   연결 실패면 **안내 없이** activeOperationsData 관제 채팅으로 내려갔다. 그래서
    //   '실제 0건' · '주문 연결 실패' · '아직 미로딩' 이 사용자에게 구분되지 않았다.
    //   이제 통계 질문이면 출처 상태를 그대로 답하고, 관제 숫자로 조용히 대체하지 않는다.
    //   질문 분류는 기존 `understandCommerceQuery` 를 재사용한다(키워드 목록을 새로 만들지 않는다).
    if (revenue !== undefined) {
      const orders = revenue?.orders ?? [];
      if (orders.length > 0) {
        try {
          const eng = await answerCommerceQuestion(
            text,
            { orders, reviews: revenue?.universeAux?.reviews as never, inquiries: revenue?.universeAux?.inquiries as never },
            { callLlm: callMarketingPlannerLlm, team: 'hq' }
          );
          if (eng && eng.handled) {
            const aiMsg: ControlChatMessage = {
              id: generateMessageId('msg-ai'), role: 'assistant', content: eng.reply, createdAt: getFormattedTime()
            };
            setMessages((prev) => [...prev, aiMsg]);
            setCommerceChart(eng.suppressChart ? null : (eng.artifact ?? null));
            setIsTyping(false);
            return;
          }
        } catch { /* 커머스 질의 실패 시 기존 콘솔 경로로 폴백 */ }
      } else {
        // 쓸 주문이 없다. **통계 질문일 때만** 출처 상태를 답한다.
        //   통계와 무관한 지시·승인·에이전트 질문은 기존 processControlChat 경로 그대로.
        const plan = await understandCommerceQuery(text, { callLlm: callMarketingPlannerLlm, team: 'hq' });
        if (plan) {
          const reply = revenue === null
            ? '주문 통계를 아직 불러오는 중입니다. 잠시 후 다시 물어봐 주세요.'
            : revenueScreenState?.usable
              // 시험 주문이 살아 있으면 사용을 막지 않는다(엔진이 답하지 못한 경우만 여기 온다).
              ? '지금 쓸 수 있는 주문 자료로는 이 질문에 답할 수 없습니다. 질문을 조금 더 구체적으로 적어 주세요.'
              : realOrdersPhrase(resolveRealOrdersDisplay(revenue.realOrdersStatus, revenue.summary?.realOrderCount)) === '실제 주문 연결 안 됨'
                ? '주문 통계가 연결되지 않아 답할 수 없습니다. 지금 화면의 다른 운영 숫자를 주문 통계로 대신 쓰지 않습니다.'
                : '실제 주문이 0건입니다(연결 실패가 아닙니다). 집계할 주문 자료가 아직 없습니다.';
          setMessages((prev) => [...prev, {
            id: generateMessageId('msg-ai'), role: 'assistant', content: reply, createdAt: getFormattedTime()
          }]);
          setCommerceChart(null);
          setIsTyping(false);
          return;
        }
      }
    }

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
          onAddLog('운영자가 채팅 명령으로 시험 운영(검증 시나리오)을 시작했습니다. 결과는 시험 자료입니다.', 'success', 'CEO');
        } else if (act.type === 'approve_all') {
          const pendingWaiting = approvalQueue.filter(a => a.status === 'waiting');
          pendingWaiting.forEach(item => {
            onApprove(item.id);
          });
          onAddLog(`운영자가 채팅 명령을 통해 모든 대기 작업(${pendingWaiting.length}건)을 일괄 승인했습니다.`, 'success', 'CEO');
        } else if (act.type === 'approve_item' && act.targetId) {
          onApprove(act.targetId);
          onAddLog(`운영자가 채팅 명령을 통해 대기 작업(ID: ${act.targetId})을 승인했습니다.`, 'success', 'CEO');
        } else if (act.type === 'reject_all' || act.type === 'reject_item') {
          // B-use-5 교정: **사유 없는 미채택을 실행하지 않는다.**
          //   채팅 명령에는 사용자가 쓴 한 문장 사유가 없다. 임의 기본 문구를 지어내지 않고,
          //   승인 상세에서 사유를 적도록 안내만 한다(승인 경로는 그대로 둔다).
          const waitingCount = approvalQueue.filter(a => a.status === 'waiting').length;
          onAddLog(
            `승인하지 않으려면 이유가 한 문장 필요합니다. 채팅 명령으로는 미채택 처리하지 않습니다. `
            + `승인 대기 ${waitingCount}건은 승인 상세 화면에서 "승인하지 않음"을 눌러 이유를 적어 주세요.`,
            'info', 'CEO'
          );
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
    // AI 지목은 **추천**일 뿐이므로 담당 팀으로만 보낸다(직접 배정 금지).
    onAddTask(candidate.title, teamOfAgent(candidate.agentId) ?? 'hq');
    onAddLog(`[Control Chat] 작업 후보 [${candidate.title}]를 담당 팀장에게 전달했습니다.`, 'success');
    
    const noticeMsg: ControlChatMessage = {
      id: generateMessageId('msg-notice'),
      role: 'system',
      content: `✓ [${candidate.title}] 업무를 담당 팀장에게 전달했습니다. 수행 방식(AI 배정 / 직접 처리)은 담당 팀장이 정합니다.`,
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
          {/* Local migration: 새 패널을 만들지 않고 기존 부제 자리에 **주문 통계 출처 상태**만 짧게 붙인다.
              문구는 정본(screenStateFromRevenue · resolveRealOrdersDisplay · realOrdersPhrase)에서 온다.
              내부 오류 원문·URL·키·응답 전문은 표시하지 않는다.
              이 prop 을 쓰지 않는 기존 화면(revenue === undefined)에서는 아무것도 그리지 않는다. */}
          {revenue !== undefined && (() => {
            const notLoaded = revenue === null;
            const real = notLoaded ? null : resolveRealOrdersDisplay(revenue.realOrdersStatus, revenue.summary?.realOrderCount);
            const usable = !!revenueScreenState?.usable;
            const label = notLoaded
              ? '주문 통계: 불러오는 중'
              : usable
                // 사용 가능 — 정본 사용자 라벨을 그대로 쓴다.
                //   실제 주문만 실패하고 시험 데이터가 살아 있으면 두 가지를 함께 보여 준다.
                ? `주문 통계: ${revenueScreenState?.userLabel ?? '연결 안 됨'}`
                  + (revenueScreenState?.realOrdersNotice ? ' · 실제 주문 연결 안 됨' : '')
                : real?.kind === 'known'
                  ? `주문 통계: ${realOrdersPhrase(real)}`
                  : '주문 통계: 연결 안 됨';
            const warn = notLoaded ? false : (!usable || !!revenueScreenState?.realOrdersNotice);
            return (
              <span
                className="chat-header-source"
                style={{ fontSize: '0.68rem', fontWeight: 700, color: warn ? 'var(--warning, #fbbf24)' : 'var(--text-secondary, #a0aec0)' }}
              >
                {label}
              </span>
            );
          })()}
        </div>
        {(() => {
          const b = getGlobalBrainSelection();
          const label = b.label || providerLabel(b.providerId);
          const usable = isBrainConnected(b.providerId);
          return (
            <span
              className="chat-header-ai"
              style={{ marginLeft: 'auto', fontSize: '0.68rem', color: usable ? 'var(--accent-primary, #31d6c4)' : 'var(--warning, #fbbf24)', fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              {usable ? `사용 중인 AI: ${label}` : `기본 AI: ${label} · 연결 키 필요`}
            </span>
          );
        })()}
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

      {/* 커머스 질의 결과 그래프(오늘의 운영 HQ 채팅) */}
      {commerceChart && (
        <div className="chat-commerce-chart">
          <MarketingChartSpecPanel artifact={commerceChart} onClear={() => setCommerceChart(null)} />
        </div>
      )}

      {/* 하단 바 — 슬롯이 있으면 그것으로 대체(오늘의 운영: 팀 지시+파일), 없으면 Quick Task Add */}
      {quickBarSlot !== undefined ? quickBarSlot : (
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
          value={quickTaskTeam}
          onChange={(e) => setQuickTaskTeam(e.target.value)}
          className="quick-bar-select"
        >
          {TARGET_TEAMS.map((team) => (
            <option key={team.id} value={team.id}>
              {team.emoji} {team.short}
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
      )}

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

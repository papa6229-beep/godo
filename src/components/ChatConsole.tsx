import React, { useState, useRef, useEffect } from 'react';
import './ChatConsole.css';

interface Message {
  sender: 'user' | 'system' | 'agent';
  senderName: string;
  text: string;
  timestamp: string;
}

export const ChatConsole: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'system',
      senderName: 'GODO AI HQ',
      text: 'Godo AI Operating Center에 오신 것을 환영합니다. 원하시는 운영 지시를 입력하거나 아래 추천 명령 템플릿을 선택하십시오.',
      timestamp: getFormattedTime()
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
    let renderer: any;
    let resizeHandler: () => void;

    const initThree = () => {
      const THREE = (window as any).THREE;
      if (!THREE) {
        // Three.js 라이브러리가 로드되기 전이면 100ms 대기 후 재시도
        setTimeout(initThree, 100);
        return;
      }

      const rect = canvasEl.getBoundingClientRect();
      const width = rect.width || canvasEl.clientWidth || 300;
      const height = rect.height || canvasEl.clientHeight || 220;

      // 1. Scene & Camera
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
      camera.position.z = 150;

      // 2. Renderer (투명 배경)
      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        alpha: true,
        antialias: true
      });
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // 3. 사람 뇌(Brain) 모양의 입체 좌표 생성 (피보나치 분포 적용하여 뭉침 및 끊김 해결)
      const points: any[] = [];
      const networkGroup = new THREE.Group();

      // 뇌 반구 피질부 점들 생성
      const brainParticleCount = 55;
      const rxBase = 44.8;
      const ryBase = 39.2;
      const rzBase = 53.2;

      for (let i = 0; i < brainParticleCount; i++) {
        // 피보나치 구체 분포(Fibonacci Sphere)로 구 표면에 고르게 분산 배치
        const yCoord = 1.0 - (i / (brainParticleCount - 1)) * 2.0; 
        const radiusAtY = Math.sqrt(1.0 - yCoord * yCoord);

        const goldenAngle = Math.PI * (3.0 - Math.sqrt(5.0));
        const theta = i * goldenAngle;
        const phi = Math.acos(yCoord);

        // 뇌 표면의 주름(gyri)을 표현하는 삼각함수 왜곡
        const gyri = Math.sin(theta * 4.0) * Math.cos(phi * 4.0) * 4.2;
        const rx = rxBase + gyri;
        const ry = ryBase + gyri;
        const rz = rzBase + gyri;

        let x = rx * radiusAtY * Math.cos(theta);
        let y = ry * yCoord;
        let z = rz * radiusAtY * Math.sin(theta);

        // 상부는 둥글게, 하부는 약간 편평하게
        if (y < 0) {
          y *= 0.82;
        }

        // 뇌 좌우 반구 분리 및 중앙 틈새(fissure) 구현
        const absX = Math.abs(x);
        if (absX < 9.5) {
          // 중앙 틈새 근처는 안쪽으로 함몰
          y -= (9.5 - absX) * 0.75;
        }
        // 좌반구, 우반구 분리를 위해 벌려줌
        x += (x > 0 ? 5.2 : -5.2);

        points.push(new THREE.Vector3(x, y, z));
      }

      // 뇌간(Brainstem) 점들 추가 (척수/아래로 뻗어나가는 부분도 1.4배 스케일업)
      const stemCount = 8;
      for (let i = 0; i < stemCount; i++) {
        const stemY = -28 - (i * 3.92); // 아래로 연장
        const angle = (i * 1.5) + (Math.random() * 0.5); // 고르게 회전
        const stemRadius = 5.88 * (1.0 - (i * 0.06)); // 내려갈수록 조금 가늘어짐
        const stemX = Math.cos(angle) * stemRadius;
        const stemZ = -8.4 + Math.sin(angle) * stemRadius; // 약간 뒤쪽 척수 앵커

        points.push(new THREE.Vector3(stemX, stemY, stemZ));
      }

      const totalPointsCount = points.length;

      // 4. 고정 뇌 피질망 점(Particles) 메시 생성
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

      // 5. 연결선(Line segments) 생성
      // 뭉치 사이가 끊기지 않고 고르게 얽히도록 K-이웃 연결 개수를 4개로 확대
      const linePositions: number[] = [];
      const neighborsCount = 4; 

      for (let i = 0; i < totalPointsCount; i++) {
        const distances = [];
        for (let j = 0; j < totalPointsCount; j++) {
          if (i === j) continue;
          
          let dist = points[i].distanceTo(points[j]);
          
          // 좌우 반구 사이의 깊은 틈새(fissure)를 침범해서 결속 모양이 뭉개지지 않도록
          // X축 부호가 다르고 거리가 먼 경우에는 결속 거리 가중치 패널티 부과 (패널티를 45로 조절하여 끊김 완화)
          if (points[i].x * points[j].x < 0 && dist > 25) {
            dist += 45; 
          }
          
          distances.push({ index: j, dist: dist });
        }
        
        // 가장 가까운 순서로 정렬
        distances.sort((a, b) => a.dist - b.dist);
        
        // 가장 가까운 4개 이웃에 대해 연결선 연결
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

      // 전체 뇌 그룹을 앞쪽으로 15도 정도 눕혀서 입체 형태가 잘 보이게 조절
      networkGroup.rotation.x = 0.25; 
      scene.add(networkGroup);

      // 6. 내부 동적 브라운 파티클 (뇌 신경망 전령 신호) 관리 배열
      interface DynamicParticle {
        mesh: any;
        velocity: any;
        life: number;
        decay: number;
      }
      const dynamicParticles: DynamicParticle[] = [];

      // 7. 애니메이션 루프
      const animate = () => {
        // 지구 자전 방향(서->동, 즉 3D에서는 왼쪽->오른쪽, rotation.y 양수값)
        // 속도는 기존 0.0018 대비 약 20% 빠른 0.0022로 조정
        networkGroup.rotation.y += 0.0022;

        // 뇌 내부 신경 신호 파티클 생성 및 페이드 효과 연산
        // 매 프레임 약 7% 확률로 최대 12개 제한으로 스폰
        if (Math.random() < 0.07 && dynamicParticles.length < 12) {
          // 뇌 내부 볼륨 내 무작위 스폰
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos((Math.random() * 2) - 1);
          const r = Math.random() * 18; // 뇌의 중심핵 부근
          
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

          // 중심에서 바깥쪽으로 향하는 속도 벡터 설정
          const speed = 0.15 + Math.random() * 0.2;
          const dir = new THREE.Vector3(px, py, pz).normalize();
          const velocity = dir.multiplyScalar(speed);

          networkGroup.add(mesh); // 자전 회전을 공유하기 위해 뇌 그룹에 추가

          dynamicParticles.push({
            mesh: mesh,
            velocity: velocity,
            life: 1.0,
            decay: 0.015 + Math.random() * 0.02
          });
        }

        // 내부 파티클 프레임 업데이트
        for (let i = dynamicParticles.length - 1; i >= 0; i--) {
          const dp = dynamicParticles[i];
          dp.mesh.position.add(dp.velocity);
          dp.life -= dp.decay;

          // 부드러운 페이드 인 / 페이드 아웃 구현
          if (dp.life > 0.7) {
            dp.mesh.material.opacity = (1.0 - dp.life) * 3.3; // 서서히 나타남
          } else if (dp.life < 0.45) {
            dp.mesh.material.opacity = (dp.life / 0.45); // 서서히 사라짐
          } else {
            dp.mesh.material.opacity = 1.0;
          }

          // 수명이 다한 신호 파티클 메모리 및 씬 해제
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

      // 리사이즈 핸들러
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

  const templates = [
    '오늘 신규 주문과 미답변 문의를 확인해줘.',
    '리뷰 답글 초안을 만들어줘.',
    '품절 위험 상품을 알려줘.'
  ];

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

  const handleSend = (text: string) => {
    if (!text.trim()) return;

    // 사용자 메시지 추가
    const userMsg: Message = {
      sender: 'user',
      senderName: '운영자',
      text: text,
      timestamp: getFormattedTime()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // AI 답변 더미 응답 매칭
    setTimeout(() => {
      let replyText = '';
      let senderName = '총괄 매니저 AI';

      if (text.includes('신규 주문') || text.includes('미답변 문의')) {
        replyText = '예, 알겠습니다. 총괄 매니저가 즉시 각 에이전트에 지시합니다. [주문 확인 AI]가 오늘 유입된 신규 주문 12건의 주소지와 결제 상태를 대조 중이며, [CS 상담 AI]가 미답변 문의 7건에 대한 개인정보 필터링 및 답변 초안 작성을 시작했습니다.';
      } else if (text.includes('리뷰 답글')) {
        senderName = '리뷰 답글 AI';
        replyText = '최근 등록된 구매 리뷰 5건을 분석했습니다. 이 중 긍정적인 평가 4건에는 감사의 인사를, 포토 리뷰 1건에는 배송 감사 적립금 안내를 포함한 답글을 준비했습니다. 대시보드의 리뷰 탭에서 승인 시 자동 등록됩니다.';
      } else if (text.includes('품절 위험')) {
        senderName = '재고 감시 AI';
        replyText = '현재 재고 상태를 진단했습니다. 인기 상품인 "센서티브 힐링 마사지 오일 (100ml)"의 재고 잔량이 안전 재고 기준선(5개) 미만인 2개로 확인되었습니다. 최근 판매 속도를 고려할 때 12시간 내 품절이 예상되어 긴급 발주서 초안을 작성했습니다.';
      } else {
        replyText = `지시하신 사항("${text}")을 수신했습니다. 관련 담당 에이전트(CS, 주문, 재고 등)를 활성화하여 시뮬레이션을 진행하고 필요 리포트를 추출합니다.`;
      }

      const aiMsg: Message = {
        sender: 'agent',
        senderName: senderName,
        text: replyText,
        timestamp: getFormattedTime()
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1000);
  };

  return (
    <div className="chat-console">
      <div className="chat-header">
        <span className="terminal-dot green"></span>
        <span className="chat-header-title">OPERATIONAL CONTROL CHAT</span>
      </div>

      <div className="chat-3d-container">
        <canvas ref={canvasRef} className="chat-3d-canvas" />
      </div>

      <div className="chat-messages-container">
        {messages.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.sender}`}>
            <div className="message-meta">
              <span className="message-sender">{msg.senderName}</span>
              <span className="message-time">[{msg.timestamp}]</span>
            </div>
            <div className="message-body">{msg.text}</div>
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

      <div className="chat-templates">
        {templates.map((tpl, i) => (
          <button key={i} className="template-btn" onClick={() => handleSend(tpl)}>
            💡 {tpl}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(inputValue);
        }}
        className="chat-input-form"
      >
        <span className="chat-prompt-symbol">&gt;</span>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="에이전트에게 지시할 명령을 입력하세요..."
          className="chat-input"
        />
        <button type="submit" className="chat-send-btn">
          SEND
        </button>
      </form>
    </div>
  );
};

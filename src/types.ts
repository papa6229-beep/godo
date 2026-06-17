export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  status: 'idle' | 'working' | 'completed' | 'offline' | 'thinking';
  tags: string[];
  capabilities: string[];
  currentTask: string;
  systemPrompt: string;
  spriteUrl?: string;
  initialX?: number;
  initialY?: number;
  bubbleText?: string;

  // Agent Skill System MVP
  knowledge?: string[];
  skills?: string[];
  tools?: string[];
  permissions?: string[];
  memory?: string[];
}

export interface Task {
  id: string;
  title: string;
  agentId: string; // 담당 에이전트 ID
  status: 'pending' | 'running' | 'completed';
  output?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'agent';
  agentName?: string;
}

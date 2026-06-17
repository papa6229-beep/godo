export type BrainCategory =
  | 'policy'
  | 'raw'
  | 'report'
  | 'decision'
  | 'template'
  | 'product'
  | 'marketing'
  | 'cs';

export type SourceType = 'demo' | 'markdown' | 'github' | 'api' | 'manual';

export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';

export interface BrainKnowledgeItem {
  id: string;
  filename: string;
  title: string;
  category: BrainCategory;
  summary: string;
  linkedAgentIds: string[];
  tags: string[];
  sourceType: SourceType;
  importance: ImportanceLevel;
  confidence: number; // 0 to 1 or 0 to 100
  usageCount: number;
  lastUsedAt?: string;
  updatedAt: string;
  contentPreview: string;
  actionExamples?: string[]; // 사용 가능한 작업 예시
}


export enum ThreatLevel {
  SAFE = 'SAFE',
  CAUTION = 'CAUTION',
  DANGER = 'DANGER',
  ANALYZING = 'ANALYZING'
}

export interface SystemLog {
  id: string;
  timestamp: string;
  message: string;
  source: 'PERCEPTION' | 'REASONING' | 'SYSTEM';
  level: 'info' | 'warn' | 'crit';
}

export interface DeepScanResult {
  threatLevel: ThreatLevel;
  analysis: string;
  action: string;
  confidence: number;
}

export interface ReasoningConfig {
  thinkingBudget: number;
  model: string;
}

export interface LiveConnectionState {
  isConnected: boolean;
  isStreaming: boolean;
  volume: number;
}

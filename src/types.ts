export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: string;
  photoURL?: string | null;
}

export interface ResourceLog {
  id: number;
  timestamp: string;
  cpu_usage: number;
  ram_usage: number;
  storage_usage: number;
  server_count: number;
  network_load: number;
  users_count: number;
  traffic_mode: string;
}

export interface PredictionLog {
  id: number;
  timestamp: string;
  actual_cpu: number;
  predicted_cpu: number;
  r2_score: number;
  mae: number;
}

export interface CostLog {
  id: number;
  timestamp: string;
  active_servers: number;
  hourly_cost: number;
  daily_cost: number;
  monthly_cost: number;
  cost_without_optimization: number;
  cost_with_optimization: number;
  cost_saved_daily: number;
  savings_percent: number;
}

export interface ScalingLog {
  id: number;
  timestamp: string;
  previous_servers: number;
  new_servers: number;
  delta: number;
  predicted_cpu: number;
  action: 'SCALE_UP' | 'SCALE_DOWN' | 'HOLD';
  reason: string;
}

export interface DashboardHistory {
  resource_logs: ResourceLog[];
  predictions: PredictionLog[];
  cost_history: CostLog[];
  scaling_history: ScalingLog[];
}

export interface DatasetRow {
  time: string;
  cpuUsage: number;
  ramUsage: number;
  serverCount: number;
  networkLoad: number;
  usersCount: number;
}

export interface TrainedModelInfo {
  features: string[];
  intercept: number;
  coefficients: number[];
  r2Score: number;
  mae: number;
  rmse: number;
  rowsTrained: number;
  totalDatasetRows: number;
  sampleRows: DatasetRow[];
}

export interface ScalingConfig {
  scaleDownLow: number;
  scaleDownModerate: number;
  scaleUpHigh: number;
  scaleUpCritical: number;
  minServers: number;
  maxServers: number;
  updatedAt?: string;
}

export interface ScalingPresetDoc {
  id: string;
  ownerUid: string;
  name: string;
  scaleDownLow: number;
  scaleDownModerate: number;
  scaleUpHigh: number;
  scaleUpCritical: number;
  minServers: number;
  maxServers: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface TelemetrySnapshotDoc {
  id: string;
  ownerUid: string;
  label: string;
  trafficMode: string;
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
  serverCount: number;
  predictedCpu: number;
  dailyCost: number;
  costSavedDaily: number;
  createdAtMs: number;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface GroundingInfo {
  webSearchQueries: string[];
  sources: GroundingSource[];
}

export interface CloudBenchmarkResult {
  summary: string;
  grounding: GroundingInfo;
  grounded: boolean;
  model: string;
  generatedAt: string;
}

export interface ChatMessageItem {
  id: string | number;
  role: 'user' | 'model';
  model: string;
  content: string;
  grounding?: GroundingInfo | null;
  createdAt?: string;
}

export interface ForecastStepPoint {
  step: 1 | 2 | 3;
  label: string;
  predictedCpu: number;
  exceedsHigh: boolean;
  exceedsCritical: boolean;
}

export interface ProactiveForecastSummary {
  scaleUpHigh: number;
  scaleUpCritical: number;
  breachDetected: boolean;
  firstBreachStep: 1 | 2 | 3 | null;
  peakProjectedCpu: number;
  severity: 'none' | 'warning' | 'critical';
  steps: ForecastStepPoint[];
}

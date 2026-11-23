import {formatTimestamp, type ScalingConfigRecord} from './db.ts';

export const MIN_SERVERS = 2;
export const MAX_SERVERS = 20;
export const COST_PER_SERVER_HOUR = 10; // INR 10/hr
export const STATIC_PEAK_SERVERS = 9; // Static unoptimized capacity baseline

export const DEFAULT_SCALING_CONFIG: Omit<ScalingConfigRecord, 'updatedAt'> = {
  scaleDownLow: 20,
  scaleDownModerate: 30,
  scaleUpHigh: 80,
  scaleUpCritical: 90,
  minServers: MIN_SERVERS,
  maxServers: MAX_SERVERS,
};

export interface ScalingEvaluation {
  timestamp: string;
  previous_servers: number;
  new_servers: number;
  delta: number;
  predicted_cpu: number;
  action: 'SCALE_UP' | 'SCALE_DOWN' | 'HOLD';
  reason: string;
  recommendations: string[];
}

export interface CostMetrics {
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

export function evaluateAutoScaling(params: {
  currentServers: number;
  predictedCpu: number;
  actualCpu: number;
  forceDemoScale?: boolean;
  config?: Omit<ScalingConfigRecord, 'updatedAt'>;
}): ScalingEvaluation {
  const timestamp = formatTimestamp();
  const {currentServers, predictedCpu, actualCpu, forceDemoScale} = params;
  const cfg = params.config ?? DEFAULT_SCALING_CONFIG;

  let delta = 0;
  let action: 'SCALE_UP' | 'SCALE_DOWN' | 'HOLD' = 'HOLD';
  const recommendations: string[] = [];

  if (forceDemoScale) {
    delta = 2;
    action = 'SCALE_UP';
    recommendations.push(`Predicted CPU exceeds ${cfg.scaleUpHigh}% threshold.`);
  } else if (predictedCpu > cfg.scaleUpCritical) {
    delta = 3;
    action = 'SCALE_UP';
    recommendations.push(`Predicted CPU exceeds critical ${cfg.scaleUpCritical}% threshold.`);
  } else if (predictedCpu > cfg.scaleUpHigh) {
    delta = 2;
    action = 'SCALE_UP';
    recommendations.push(`Predicted CPU exceeds ${cfg.scaleUpHigh}% threshold.`);
  } else if (predictedCpu < cfg.scaleDownLow) {
    delta = -2;
    action = 'SCALE_DOWN';
    recommendations.push(`Predicted CPU is below ${cfg.scaleDownLow}% under-utilization threshold.`);
  } else if (predictedCpu < cfg.scaleDownModerate) {
    delta = -1;
    action = 'SCALE_DOWN';
    recommendations.push(`Predicted CPU is below ${cfg.scaleDownModerate}% threshold.`);
  } else {
    recommendations.push('Resource utilization is healthy.');
  }

  const newServers = Math.max(cfg.minServers, Math.min(cfg.maxServers, currentServers + delta));
  const actualDelta = newServers - currentServers;

  let reason: string;
  if (actualDelta > 0) {
    reason = `Scaling up ${actualDelta} server(s) to absorb projected ${predictedCpu.toFixed(1)}% CPU utilization.`;
    recommendations.push(`Scaling up ${actualDelta} servers.`);
  } else if (actualDelta < 0) {
    reason = `Scaling down ${Math.abs(actualDelta)} server(s) to eliminate idle compute cost.`;
    recommendations.push(`Scaling down ${Math.abs(actualDelta)} servers.`);
  } else if (currentServers >= cfg.maxServers && delta > 0) {
    reason = `Cluster has reached maximum capacity (${cfg.maxServers} servers).`;
  } else if (currentServers <= cfg.minServers && delta < 0) {
    reason = `Cluster is at minimum high-availability floor (${cfg.minServers} servers).`;
  } else {
    reason = `Active cluster (${currentServers} servers) is right-sized for ${predictedCpu.toFixed(1)}% predicted CPU.`;
  }

  if (actualCpu <= cfg.scaleUpCritical && newServers <= STATIC_PEAK_SERVERS) {
    recommendations.push('Cost optimization successful.');
  }

  return {
    timestamp,
    previous_servers: currentServers,
    new_servers: newServers,
    delta: actualDelta,
    predicted_cpu: predictedCpu,
    action,
    reason,
    recommendations,
  };
}

export function calculateCostMetrics(activeServers: number): CostMetrics {
  const timestamp = formatTimestamp();
  const hourly_cost = Number((activeServers * COST_PER_SERVER_HOUR).toFixed(2));
  const daily_cost = Number((hourly_cost * 24).toFixed(2));
  const monthly_cost = Number((daily_cost * 30).toFixed(2));

  const baselineServers = Math.max(STATIC_PEAK_SERVERS, activeServers);
  const cost_without_optimization = Number((baselineServers * COST_PER_SERVER_HOUR * 24).toFixed(2));
  const cost_with_optimization = daily_cost;
  const cost_saved_daily = Number(Math.max(0, cost_without_optimization - cost_with_optimization).toFixed(2));
  const savings_percent =
    cost_without_optimization > 0
      ? Number(((cost_saved_daily / cost_without_optimization) * 100).toFixed(2))
      : 0;

  return {
    timestamp,
    active_servers: activeServers,
    hourly_cost,
    daily_cost,
    monthly_cost,
    cost_without_optimization,
    cost_with_optimization,
    cost_saved_daily,
    savings_percent,
  };
}

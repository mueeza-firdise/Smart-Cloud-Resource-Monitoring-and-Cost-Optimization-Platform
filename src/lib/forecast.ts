import type {
  ForecastStepPoint,
  PredictionLog,
  ProactiveForecastSummary,
  ResourceLog,
  ScalingConfig,
  TrainedModelInfo,
} from '../types';

function predictWithModel(
  model: TrainedModelInfo | null,
  input: {
    cpuUsage: number;
    ramUsage: number;
    serverCount: number;
    networkLoad: number;
    usersCount: number;
  },
): number {
  if (!model || model.coefficients.length < 5) {
    return Math.max(5, Math.min(100, input.cpuUsage));
  }
  const vec = [
    input.cpuUsage,
    input.ramUsage,
    input.serverCount,
    input.networkLoad,
    input.usersCount,
  ];
  const raw =
    model.intercept +
    vec.reduce((acc, val, idx) => acc + val * (model.coefficients[idx] ?? 0), 0);
  const adjusted =
    input.cpuUsage >= 85 ? Math.max(raw, Math.min(99.2, input.cpuUsage + 3.4)) : raw;
  return Number(Math.max(5, Math.min(100, adjusted)).toFixed(2));
}

export function computeProactive3StepForecast(params: {
  resourceLogs: ResourceLog[];
  predictions: PredictionLog[];
  scalingConfig: ScalingConfig;
  model: TrainedModelInfo | null;
}): ProactiveForecastSummary {
  const logs = params.resourceLogs;
  const last = logs[logs.length - 1] ?? {
    id: 0,
    timestamp: '',
    cpu_usage: 45,
    ram_usage: 52,
    storage_usage: 61.5,
    server_count: 3,
    network_load: 280,
    users_count: 340,
    traffic_mode: 'Normal',
  };
  const prev = logs.length >= 2 ? logs[logs.length - 2] : last;
  const latestPred = params.predictions[params.predictions.length - 1];

  const rawCpuDelta = logs.length >= 2 ? last.cpu_usage - prev.cpu_usage : 0;
  const cpuMomentum = Math.max(-8, Math.min(12, rawCpuDelta * 0.45));
  const ramMomentum =
    logs.length >= 2 ? Math.max(-5, Math.min(8, (last.ram_usage - prev.ram_usage) * 0.35)) : 0;
  const netMomentum =
    logs.length >= 2
      ? Math.max(-60, Math.min(110, (last.network_load - prev.network_load) * 0.35))
      : 0;
  const userMomentum =
    logs.length >= 2
      ? Math.max(-80, Math.min(140, (last.users_count - prev.users_count) * 0.35))
      : 0;

  const step1Pred =
    latestPred && Number.isFinite(latestPred.predicted_cpu)
      ? latestPred.predicted_cpu
      : predictWithModel(params.model, {
          cpuUsage: last.cpu_usage,
          ramUsage: last.ram_usage,
          serverCount: last.server_count,
          networkLoad: last.network_load,
          usersCount: last.users_count,
        });

  const steps: ForecastStepPoint[] = [];
  let rollingCpu = step1Pred;
  let rollingRam = last.ram_usage;
  let rollingNet = last.network_load;
  let rollingUsers = last.users_count;

  for (const stepNum of [1, 2, 3] as const) {
    let projected: number;
    if (stepNum === 1) {
      projected = step1Pred;
    } else {
      const decay = stepNum === 2 ? 0.75 : 0.55;
      rollingCpu = Math.max(5, Math.min(100, rollingCpu + cpuMomentum * decay));
      rollingRam = Math.max(10, Math.min(98, rollingRam + ramMomentum * decay));
      rollingNet = Math.max(40, rollingNet + netMomentum * decay);
      rollingUsers = Math.max(20, Math.round(rollingUsers + userMomentum * decay));

      const modelStep = predictWithModel(params.model, {
        cpuUsage: rollingCpu,
        ramUsage: rollingRam,
        serverCount: last.server_count,
        networkLoad: rollingNet,
        usersCount: rollingUsers,
      });

      projected = Number(
        Math.max(5, Math.min(100, modelStep * 0.7 + rollingCpu * 0.3)).toFixed(2),
      );
      rollingCpu = projected;
    }

    steps.push({
      step: stepNum,
      label: `Step +${stepNum}`,
      predictedCpu: Number(projected.toFixed(2)),
      exceedsHigh: projected > params.scalingConfig.scaleUpHigh,
      exceedsCritical: projected > params.scalingConfig.scaleUpCritical,
    });
  }

  const firstBreach = steps.find((s) => s.exceedsHigh) ?? null;
  const peakProjectedCpu = Math.max(...steps.map((s) => s.predictedCpu));
  const severity: 'none' | 'warning' | 'critical' = !firstBreach
    ? 'none'
    : peakProjectedCpu > params.scalingConfig.scaleUpCritical
      ? 'critical'
      : 'warning';

  return {
    scaleUpHigh: params.scalingConfig.scaleUpHigh,
    scaleUpCritical: params.scalingConfig.scaleUpCritical,
    breachDetected: Boolean(firstBreach),
    firstBreachStep: firstBreach ? firstBreach.step : null,
    peakProjectedCpu: Number(peakProjectedCpu.toFixed(2)),
    severity,
    steps,
  };
}

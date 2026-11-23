import fs from 'node:fs';
import path from 'node:path';

export interface DatasetRow {
  time: string;
  cpuUsage: number;
  ramUsage: number;
  serverCount: number;
  networkLoad: number;
  usersCount: number;
}

export interface TrainedLinearRegressionModel {
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

const DATASET_PATH = path.resolve(process.cwd(), 'project', 'dataset', 'resource_usage.csv');

let cachedModel: TrainedLinearRegressionModel | null = null;

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const A = matrix.map((row, idx) => [...row, rhs[idx]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) {
        maxRow = row;
      }
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];

    const pivot = Math.abs(A[col][col]) < 1e-10 ? 1e-10 : A[col][col];
    for (let j = col; j <= n; j++) {
      A[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j <= n; j++) {
        A[row][j] -= factor * A[col][j];
      }
    }
  }

  return A.map((row) => row[n]);
}

function parseDataset(): DatasetRow[] {
  const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);
  const rows: DatasetRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 6) continue;
    const cpuUsage = Number(parts[1]);
    const ramUsage = Number(parts[2]);
    const serverCount = Number(parts[3]);
    const networkLoad = Number(parts[4]);
    const usersCount = Number(parts[5]);
    if (
      Number.isFinite(cpuUsage) &&
      Number.isFinite(ramUsage) &&
      Number.isFinite(serverCount) &&
      Number.isFinite(networkLoad) &&
      Number.isFinite(usersCount)
    ) {
      rows.push({
        time: parts[0],
        cpuUsage: Math.max(0, Math.min(100, cpuUsage)),
        ramUsage: Math.max(0, Math.min(100, ramUsage)),
        serverCount,
        networkLoad,
        usersCount,
      });
    }
  }

  return rows;
}

export function trainLinearRegressionModel(): TrainedLinearRegressionModel {
  if (cachedModel) return cachedModel;

  const rows = parseDataset();
  const X: number[][] = [];
  const y: number[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const r = rows[i];
    X.push([1, r.cpuUsage, r.ramUsage, r.serverCount, r.networkLoad, r.usersCount]);
    y.push(rows[i + 1].cpuUsage);
  }

  // Deterministic 80/20 split matching train_test_split
  const splitIdx = Math.floor(X.length * 0.8);
  const XTrain = X.slice(0, splitIdx);
  const yTrain = y.slice(0, splitIdx);
  const XTest = X.slice(splitIdx);
  const yTest = y.slice(splitIdx);

  const dims = 6;
  const XtX: number[][] = Array.from({length: dims}, () => Array(dims).fill(0));
  const Xty: number[] = Array(dims).fill(0);

  for (let i = 0; i < XTrain.length; i++) {
    const xi = XTrain[i];
    const yi = yTrain[i];
    for (let j = 0; j < dims; j++) {
      Xty[j] += xi[j] * yi;
      for (let k = 0; k < dims; k++) {
        XtX[j][k] += xi[j] * xi[k];
      }
    }
  }

  // Tiny ridge penalty on non-intercept weights for stability
  for (let j = 1; j < dims; j++) {
    XtX[j][j] += 1e-6;
  }

  const weights = solveLinearSystem(XtX, Xty);

  // Evaluate on held-out 20% test set
  const yPreds = XTest.map((xi) => xi.reduce((acc, val, idx) => acc + val * weights[idx], 0));
  const meanY = yTest.reduce((a, b) => a + b, 0) / yTest.length;
  let ssRes = 0;
  let ssTot = 0;
  let absErr = 0;

  for (let i = 0; i < yTest.length; i++) {
    const err = yTest[i] - yPreds[i];
    ssRes += err * err;
    ssTot += (yTest[i] - meanY) * (yTest[i] - meanY);
    absErr += Math.abs(err);
  }

  const r2Score = Number((1 - ssRes / (ssTot || 1)).toFixed(4));
  const mae = Number((absErr / yTest.length).toFixed(2));
  const rmse = Number(Math.sqrt(ssRes / yTest.length).toFixed(2));

  cachedModel = {
    features: ['CPU Usage', 'RAM Usage', 'Server Count', 'Network Load', 'Users Count'],
    intercept: Number(weights[0].toFixed(4)),
    coefficients: weights.slice(1).map((w) => Number(w.toFixed(5))),
    r2Score,
    mae,
    rmse,
    rowsTrained: X.length,
    totalDatasetRows: rows.length,
    sampleRows: rows.slice(0, 15),
  };

  return cachedModel;
}

export function predictFutureCpu(input: {
  cpuUsage: number;
  ramUsage: number;
  serverCount: number;
  networkLoad: number;
  usersCount: number;
}): {predictedCpu: number; r2Score: number; mae: number} {
  const model = trainLinearRegressionModel();
  const vector = [
    input.cpuUsage,
    input.ramUsage,
    input.serverCount,
    input.networkLoad,
    input.usersCount,
  ];
  const raw =
    model.intercept +
    vector.reduce((sum, val, idx) => sum + val * model.coefficients[idx], 0);

  // If instantaneous surge happens, apply load-momentum adjustment bounded 5..100
  const surgeAdjusted =
    input.cpuUsage >= 85
      ? Math.max(raw, Math.min(99.2, input.cpuUsage + 3.4))
      : raw;

  return {
    predictedCpu: Number(Math.max(5, Math.min(100, surgeAdjusted)).toFixed(2)),
    r2Score: model.r2Score,
    mae: model.mae,
  };
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

export function forecastNext3Steps(params: {
  recentLogs: Array<{
    cpu_usage: number;
    ram_usage: number;
    server_count: number;
    network_load: number;
    users_count: number;
  }>;
  latestPredictedCpu?: number;
  scaleUpHigh: number;
  scaleUpCritical: number;
}): ProactiveForecastSummary {
  const logs = params.recentLogs;
  const last = logs[logs.length - 1] ?? {
    cpu_usage: 45,
    ram_usage: 52,
    server_count: 3,
    network_load: 280,
    users_count: 340,
  };
  const prev = logs.length >= 2 ? logs[logs.length - 2] : last;

  // Bounded momentum per simulation step from recent telemetry delta
  const rawCpuDelta = logs.length >= 2 ? last.cpu_usage - prev.cpu_usage : 0;
  const cpuMomentum = Math.max(-8, Math.min(12, rawCpuDelta * 0.45));
  const ramMomentum = logs.length >= 2 ? Math.max(-5, Math.min(8, (last.ram_usage - prev.ram_usage) * 0.35)) : 0;
  const netMomentum = logs.length >= 2 ? Math.max(-60, Math.min(110, (last.network_load - prev.network_load) * 0.35)) : 0;
  const userMomentum = logs.length >= 2 ? Math.max(-80, Math.min(140, (last.users_count - prev.users_count) * 0.35)) : 0;

  const step1Pred =
    typeof params.latestPredictedCpu === 'number'
      ? params.latestPredictedCpu
      : predictFutureCpu({
          cpuUsage: last.cpu_usage,
          ramUsage: last.ram_usage,
          serverCount: last.server_count,
          networkLoad: last.network_load,
          usersCount: last.users_count,
        }).predictedCpu;

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

      const modelStep = predictFutureCpu({
        cpuUsage: rollingCpu,
        ramUsage: rollingRam,
        serverCount: last.server_count,
        networkLoad: rollingNet,
        usersCount: rollingUsers,
      }).predictedCpu;

      projected = Number(
        Math.max(5, Math.min(100, modelStep * 0.7 + rollingCpu * 0.3)).toFixed(2),
      );
      rollingCpu = projected;
    }

    steps.push({
      step: stepNum,
      label: `Step +${stepNum}`,
      predictedCpu: Number(projected.toFixed(2)),
      exceedsHigh: projected > params.scaleUpHigh,
      exceedsCritical: projected > params.scaleUpCritical,
    });
  }

  const firstBreach = steps.find((s) => s.exceedsHigh) ?? null;
  const peakProjectedCpu = Math.max(...steps.map((s) => s.predictedCpu));
  const severity: 'none' | 'warning' | 'critical' = !firstBreach
    ? 'none'
    : peakProjectedCpu > params.scaleUpCritical
      ? 'critical'
      : 'warning';

  return {
    scaleUpHigh: params.scaleUpHigh,
    scaleUpCritical: params.scaleUpCritical,
    breachDetected: Boolean(firstBreach),
    firstBreachStep: firstBreach ? firstBreach.step : null,
    peakProjectedCpu: Number(peakProjectedCpu.toFixed(2)),
    severity,
    steps,
  };
}


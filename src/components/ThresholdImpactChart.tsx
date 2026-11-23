import {useMemo, useState} from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {computeProactive3StepForecast} from '../lib/forecast';
import type {PredictionLog, ResourceLog, ScalingConfig, TrainedModelInfo} from '../types';

interface ThresholdImpactChartProps {
  config: ScalingConfig;
  resourceLogs: ResourceLog[];
  predictions: PredictionLog[];
  model?: TrainedModelInfo | null;
  isDark?: boolean;
}

interface ChartPoint {
  time: string;
  cpu: number | null;
  predictedCpu: number;
  servers: number;
}

const SAMPLE_24H_LOAD = [
  {time: '00:00', cpu: 16},
  {time: '02:00', cpu: 18},
  {time: '04:00', cpu: 27},
  {time: '06:00', cpu: 45},
  {time: '08:00', cpu: 72},
  {time: '10:00', cpu: 92},
  {time: '12:00', cpu: 88},
  {time: '14:00', cpu: 68},
  {time: '16:00', cpu: 85},
  {time: '18:00', cpu: 74},
  {time: '20:00', cpu: 49},
  {time: '22:00', cpu: 25},
];

export function ThresholdImpactChart({
  config,
  resourceLogs,
  predictions,
  model = null,
  isDark = false,
}: ThresholdImpactChartProps) {
  const [viewMode, setViewMode] = useState<'logs' | 'sample24h'>('logs');

  const forecast3Step = useMemo(
    () =>
      computeProactive3StepForecast({
        resourceLogs,
        predictions,
        scalingConfig: config,
        model,
      }),
    [config, model, predictions, resourceLogs],
  );

  const chartData = useMemo<ChartPoint[]>(() => {
    if (viewMode === 'logs' && resourceLogs.length > 0) {
      const recentLogs = resourceLogs.slice(-24);
      const predOffset = Math.max(0, predictions.length - recentLogs.length);
      const historical: ChartPoint[] = recentLogs.map((log, idx) => {
        const pred = predictions[predOffset + idx];
        return {
          time: log.timestamp.slice(11, 19),
          cpu: Number(log.cpu_usage.toFixed(1)),
          predictedCpu: Number((pred?.predicted_cpu ?? log.cpu_usage).toFixed(1)),
          servers: log.server_count,
        };
      });

      const lastServers = recentLogs[recentLogs.length - 1]?.server_count ?? config.minServers;
      const futurePoints: ChartPoint[] = forecast3Step.steps.map((step) => ({
        time: `+${step.step} Step`,
        cpu: null,
        predictedCpu: Number(step.predictedCpu.toFixed(1)),
        servers: lastServers,
      }));

      return [...historical, ...futurePoints];
    }

    let servers = Math.max(config.minServers, Math.min(config.maxServers, 3));
    return SAMPLE_24H_LOAD.map((pt) => {
      let delta = 0;
      if (pt.cpu > config.scaleUpCritical) delta = 3;
      else if (pt.cpu > config.scaleUpHigh) delta = 2;
      else if (pt.cpu < config.scaleDownLow) delta = -2;
      else if (pt.cpu < config.scaleDownModerate) delta = -1;

      servers = Math.max(config.minServers, Math.min(config.maxServers, servers + delta));
      return {
        time: pt.time,
        cpu: pt.cpu,
        predictedCpu: Math.min(100, Number((pt.cpu * 1.03).toFixed(1))),
        servers,
      };
    });
  }, [config, forecast3Step.steps, predictions, resourceLogs, viewMode]);

  const stats = useMemo(() => {
    const highBreaches = chartData.filter((d) => d.predictedCpu > config.scaleUpHigh).length;
    const criticalBreaches = chartData.filter(
      (d) => d.predictedCpu > config.scaleUpCritical,
    ).length;
    const cpuValues = chartData
      .map((d) => d.cpu)
      .filter((v): v is number => typeof v === 'number');
    const peakCpu = cpuValues.length > 0 ? Math.max(...cpuValues) : 0;
    const minSrv = chartData.length > 0 ? Math.min(...chartData.map((d) => d.servers)) : config.minServers;
    const maxSrv = chartData.length > 0 ? Math.max(...chartData.map((d) => d.servers)) : config.minServers;
    return {highBreaches, criticalBreaches, peakCpu, minSrv, maxSrv};
  }, [chartData, config.minServers, config.scaleUpCritical, config.scaleUpHigh]);

  const tickColor = isDark ? '#94A3B8' : '#64748B';
  const serverStroke = isDark ? '#E2E8F0' : '#0F172A';
  const gridStroke = isDark ? '#334155' : '#E2E8F0';
  const axisStroke = isDark ? '#475569' : '#CBD5E1';

  return (
    <section
      aria-label="CPU Load Trend and Scaling Threshold Reference Chart"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
            CPU Load Trend vs. Active Scaling Thresholds
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Plots recent <span className="font-mono">resource_logs</span> CPU load and active server count against your Scale-Up High ({config.scaleUpHigh}%) and Scale-Up Critical ({config.scaleUpCritical}%) reference thresholds.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('logs')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
              viewMode === 'logs'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Live resource_logs
          </button>
          <button
            type="button"
            onClick={() => setViewMode('sample24h')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
              viewMode === 'sample24h'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            24h Sample Curve
          </button>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{top: 16, right: 16, left: 0, bottom: 8}}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis
              dataKey="time"
              tick={{fontSize: 11, fill: tickColor, fontFamily: '"JetBrains Mono", monospace'}}
              tickLine={false}
              axisLine={{stroke: axisStroke}}
            />
            <YAxis
              yAxisId="cpu"
              domain={[0, 100]}
              tick={{fontSize: 11, fill: tickColor, fontFamily: '"JetBrains Mono", monospace'}}
              tickLine={false}
              axisLine={{stroke: axisStroke}}
              unit="%"
            />
            <YAxis
              yAxisId="servers"
              orientation="right"
              domain={[0, Math.max(config.maxServers, stats.maxSrv + 2)]}
              allowDecimals={false}
              tick={{fontSize: 11, fill: serverStroke, fontFamily: '"JetBrains Mono", monospace'}}
              tickLine={false}
              axisLine={{stroke: axisStroke}}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#E2E8F0',
                color: isDark ? '#F1F5F9' : '#0F172A',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: '"JetBrains Mono", monospace',
              }}
            />
            <Legend wrapperStyle={{fontSize: '12px', paddingTop: '8px'}} />

            <ReferenceLine
              yAxisId="cpu"
              y={config.scaleUpHigh}
              stroke="#D97706"
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: `Scale-Up High (${config.scaleUpHigh}%)`,
                position: 'insideTopLeft',
                fill: isDark ? '#FBBF24' : '#B45309',
                fontSize: 11,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            />
            <ReferenceLine
              yAxisId="cpu"
              y={config.scaleUpCritical}
              stroke="#DC2626"
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: `Scale-Up Critical (${config.scaleUpCritical}%)`,
                position: 'insideBottomLeft',
                fill: isDark ? '#F87171' : '#B91C1C',
                fontSize: 11,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            />

            <Area
              yAxisId="cpu"
              type="monotone"
              dataKey="cpu"
              name="Actual CPU (%)"
              stroke="#2563EB"
              fill={isDark ? '#1D4ED8' : '#DBEAFE'}
              fillOpacity={isDark ? 0.25 : 0.55}
              strokeWidth={2}
              dot={{r: 3, fill: '#2563EB'}}
            />
            <Line
              yAxisId="cpu"
              type="monotone"
              dataKey="predictedCpu"
              name="Predicted CPU (%)"
              stroke="#7C3AED"
              strokeDasharray="4 4"
              strokeWidth={1.75}
              dot={false}
            />
            <Line
              yAxisId="servers"
              type="stepAfter"
              dataKey="servers"
              name="Active Servers"
              stroke={serverStroke}
              strokeWidth={2}
              dot={{r: 3, fill: serverStroke}}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-slate-500 dark:text-slate-400">Triggers &gt; Scale-Up High</div>
          <div className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400 text-base mt-0.5">
            {stats.highBreaches} events
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Triggers &gt; Scale-Up Critical</div>
          <div className="font-mono tabular-nums font-bold text-red-700 dark:text-red-400 text-base mt-0.5">
            {stats.criticalBreaches} events
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Peak CPU in Window</div>
          <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 text-base mt-0.5">
            {stats.peakCpu.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">Observed Server Range</div>
          <div className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400 text-base mt-0.5">
            {stats.minSrv} – {stats.maxSrv} nodes
          </div>
        </div>
      </div>
    </section>
  );
}

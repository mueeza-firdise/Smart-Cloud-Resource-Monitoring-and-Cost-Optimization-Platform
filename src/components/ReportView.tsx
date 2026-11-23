import {Download} from 'lucide-react';
import type {DashboardHistory, TrainedModelInfo} from '../types';

interface ReportViewProps {
  history: DashboardHistory;
  model: TrainedModelInfo | null;
  onDownloadPdf: () => void;
  downloadingPdf: boolean;
}

export function ReportView({
  history,
  model,
  onDownloadPdf,
  downloadingPdf,
}: ReportViewProps) {
  const latestResource = history.resource_logs[history.resource_logs.length - 1];
  const latestPrediction = history.predictions[history.predictions.length - 1];
  const latestScaling = history.scaling_history[history.scaling_history.length - 1];
  const latestCost = history.cost_history[history.cost_history.length - 1];

  if (!latestResource || !latestPrediction || !latestScaling || !latestCost) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-600 dark:text-slate-400">
        No telemetry snapshots recorded yet. Run a traffic simulation to populate the report.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Audit Timestamp: <span className="font-mono tabular-nums">{latestResource.timestamp}</span>{' '}
            <span aria-hidden="true">·</span> Traffic Mode: {latestResource.traffic_mode}
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Executive Resource &amp; Cost Optimization Report
          </h2>
        </div>

        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={downloadingPdf}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{downloadingPdf ? 'Generating PDF...' : 'Download PDF Report'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Current Resources &amp; ML Prediction
          </h3>
          <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">CPU Usage</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {latestResource.cpu_usage.toFixed(2)}%
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">RAM Usage</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {latestResource.ram_usage.toFixed(2)}%
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Storage Usage</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {latestResource.storage_usage.toFixed(2)}%
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Active Servers</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {latestResource.server_count} nodes
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Predicted Future CPU</dt>
              <dd className="font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                {latestPrediction.predicted_cpu.toFixed(2)}%
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Linear Regression Fit (R² / MAE)</dt>
              <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {(model?.r2Score ?? latestPrediction.r2_score).toFixed(4)} /{' '}
                {(model?.mae ?? latestPrediction.mae).toFixed(2)}%
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Cost Optimization Summary (₹10 / Server / Hour)
          </h3>
          <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Current Hourly Cost</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                ₹{latestCost.hourly_cost.toFixed(2)}/hr
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Daily Cost (With Optimization)</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                ₹{latestCost.daily_cost.toFixed(2)}/day
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Monthly Projected Cost</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                ₹{latestCost.monthly_cost.toFixed(2)}/mo
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">
                Cost Without Optimization (Static Peak)
              </dt>
              <dd className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                ₹{latestCost.cost_without_optimization.toFixed(2)}/day
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-700 dark:text-slate-300 font-medium">Net Daily Cost Saved</dt>
              <dd className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                ₹{latestCost.cost_saved_daily.toFixed(2)}/day ({latestCost.savings_percent.toFixed(1)}%)
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Latest Scaling Decision</dt>
              <dd className="text-right text-slate-900 dark:text-slate-100 font-medium">
                {latestScaling.action} ({latestScaling.previous_servers} → {latestScaling.new_servers})
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Scaling Decision Audit Trail
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {history.scaling_history.length} recent events
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Decision</th>
                <th className="py-2.5 px-4 text-right">Servers</th>
                <th className="py-2.5 px-4 text-right">Predicted CPU</th>
                <th className="py-2.5 px-4">Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...history.scaling_history].reverse().map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {row.timestamp}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {row.action === 'SCALE_UP'
                      ? 'Scale Up'
                      : row.action === 'SCALE_DOWN'
                        ? 'Scale Down'
                        : 'Hold'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {row.previous_servers} → {row.new_servers}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {row.predicted_cpu.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

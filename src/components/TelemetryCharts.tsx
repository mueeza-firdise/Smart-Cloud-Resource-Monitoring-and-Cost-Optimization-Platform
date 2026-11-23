import {useEffect, useRef} from 'react';
import Chart from 'chart.js/auto';
import type {DashboardHistory} from '../types';

interface TelemetryChartsProps {
  history: DashboardHistory;
  isDark?: boolean;
}

export function TelemetryCharts({history, isDark = false}: TelemetryChartsProps) {
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ramCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const predCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const serversCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const costCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const chartsRef = useRef<Record<string, Chart>>({});

  const latestRes = history.resource_logs[history.resource_logs.length - 1];
  const latestPred = history.predictions[history.predictions.length - 1];
  const latestScale = history.scaling_history[history.scaling_history.length - 1];
  const latestCost = history.cost_history[history.cost_history.length - 1];

  useEffect(() => {
    const logs = history.resource_logs;
    const preds = history.predictions;
    const scaling = history.scaling_history;
    const costs = history.cost_history;

    const labels = logs.map((r) => r.timestamp.slice(11, 19));

    const destroyAll = () => {
      Object.values(chartsRef.current).forEach((ch) => ch.destroy());
      chartsRef.current = {};
    };
    destroyAll();

    const textColor = isDark ? '#94A3B8' : '#475569';
    const actualCpuColor = isDark ? '#E2E8F0' : '#0F172A';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.45)' : 'rgba(148, 163, 184, 0.2)';
    const commonFont = {
      family: '"DM Sans", system-ui, sans-serif',
      size: 11,
    };
    const tooltipOptions = {
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      titleColor: isDark ? '#F8FAFC' : '#0F172A',
      bodyColor: isDark ? '#CBD5E1' : '#334155',
      borderColor: isDark ? '#334155' : '#E2E8F0',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      titleFont: {family: '"JetBrains Mono", monospace', size: 11},
      bodyFont: {family: '"JetBrains Mono", monospace', size: 11},
    };

    const makeAreaGradient = (ctx: CanvasRenderingContext2D, rgb: string) => {
      const grad = ctx.createLinearGradient(0, 0, 0, 220);
      grad.addColorStop(0, `rgba(${rgb}, 0.24)`);
      grad.addColorStop(1, `rgba(${rgb}, 0.01)`);
      return grad;
    };

    if (cpuCanvasRef.current) {
      const ctx = cpuCanvasRef.current.getContext('2d')!;
      chartsRef.current.cpu = new Chart(cpuCanvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'CPU Usage (%)',
              data: logs.map((r) => r.cpu_usage),
              borderColor: '#2563EB',
              backgroundColor: makeAreaGradient(ctx, '37, 99, 235'),
              fill: true,
              borderWidth: 2.25,
              pointRadius: 2.5,
              pointHoverRadius: 5,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          animation: {duration: 180},
          plugins: {
            legend: {labels: {color: textColor, font: commonFont, boxWidth: 12}},
            tooltip: tooltipOptions,
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              grid: {color: gridColor},
              ticks: {color: textColor, font: commonFont},
            },
            x: {
              grid: {display: false},
              ticks: {color: textColor, font: commonFont, maxRotation: 0},
            },
          },
        },
      });
    }

    if (ramCanvasRef.current) {
      const ctx = ramCanvasRef.current.getContext('2d')!;
      chartsRef.current.ram = new Chart(ramCanvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'RAM Usage (%)',
              data: logs.map((r) => r.ram_usage),
              borderColor: '#0D9488',
              backgroundColor: makeAreaGradient(ctx, '13, 148, 136'),
              fill: true,
              borderWidth: 2.25,
              pointRadius: 2.5,
              pointHoverRadius: 5,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          animation: {duration: 180},
          plugins: {
            legend: {labels: {color: textColor, font: commonFont, boxWidth: 12}},
            tooltip: tooltipOptions,
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              grid: {color: gridColor},
              ticks: {color: textColor, font: commonFont},
            },
            x: {
              grid: {display: false},
              ticks: {color: textColor, font: commonFont, maxRotation: 0},
            },
          },
        },
      });
    }

    if (predCanvasRef.current) {
      chartsRef.current.pred = new Chart(predCanvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Actual CPU (%)',
              data: preds.map((p) => p.actual_cpu),
              borderColor: actualCpuColor,
              borderWidth: 2,
              pointRadius: 2.5,
              pointHoverRadius: 5,
              tension: 0.26,
            },
            {
              label: 'Predicted CPU (%)',
              data: preds.map((p) => p.predicted_cpu),
              borderColor: '#DC2626',
              borderDash: [5, 4],
              borderWidth: 2,
              pointRadius: 2.5,
              pointHoverRadius: 5,
              tension: 0.26,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          animation: {duration: 180},
          plugins: {
            legend: {labels: {color: textColor, font: commonFont, boxWidth: 12}},
            tooltip: tooltipOptions,
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              grid: {color: gridColor},
              ticks: {color: textColor, font: commonFont},
            },
            x: {
              grid: {display: false},
              ticks: {color: textColor, font: commonFont, maxRotation: 0},
            },
          },
        },
      });
    }

    if (serversCanvasRef.current) {
      chartsRef.current.servers = new Chart(serversCanvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Active Servers (Min 2 / Max 20)',
              data: scaling.map((s) => s.new_servers),
              backgroundColor: '#2563EB',
              borderRadius: 5,
              maxBarThickness: 28,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          animation: {duration: 180},
          plugins: {
            legend: {labels: {color: textColor, font: commonFont, boxWidth: 12}},
            tooltip: tooltipOptions,
          },
          scales: {
            y: {
              min: 0,
              max: 20,
              ticks: {stepSize: 2, color: textColor, font: commonFont},
              grid: {color: gridColor},
            },
            x: {
              grid: {display: false},
              ticks: {color: textColor, font: commonFont, maxRotation: 0},
            },
          },
        },
      });
    }

    if (costCanvasRef.current) {
      chartsRef.current.cost = new Chart(costCanvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Without Optimization (₹/day)',
              data: costs.map((c) => c.cost_without_optimization),
              backgroundColor: isDark ? '#334155' : '#CBD5E1',
              borderRadius: 5,
              maxBarThickness: 24,
            },
            {
              label: 'With Auto-Scaling (₹/day)',
              data: costs.map((c) => c.cost_with_optimization),
              backgroundColor: '#16A34A',
              borderRadius: 5,
              maxBarThickness: 24,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          animation: {duration: 180},
          plugins: {
            legend: {labels: {color: textColor, font: commonFont, boxWidth: 12}},
            tooltip: tooltipOptions,
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {color: gridColor},
              ticks: {color: textColor, font: commonFont},
            },
            x: {
              grid: {display: false},
              ticks: {color: textColor, font: commonFont, maxRotation: 0},
            },
          },
        },
      });
    }

    return () => {
      destroyAll();
    };
  }, [history, isDark]);

  const cpuAvg =
    history.resource_logs.length > 0
      ? history.resource_logs.reduce((s, r) => s + r.cpu_usage, 0) / history.resource_logs.length
      : 0;
  const cpuPeak =
    history.resource_logs.length > 0
      ? Math.max(...history.resource_logs.map((r) => r.cpu_usage))
      : 0;
  const ramPeak =
    history.resource_logs.length > 0
      ? Math.max(...history.resource_logs.map((r) => r.ram_usage))
      : 0;
  const maxNodesObserved =
    history.scaling_history.length > 0
      ? Math.max(...history.scaling_history.map((s) => s.new_servers))
      : 3;

  return (
    <section aria-label="Telemetry Charts" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              01. CPU Trend
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              Avg {cpuAvg.toFixed(1)}% · Peak {cpuPeak.toFixed(1)}%
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
            {latestRes ? `${latestRes.cpu_usage.toFixed(1)}% current` : 'Utilization %'}
          </span>
        </div>
        <div className="h-56">
          <canvas ref={cpuCanvasRef} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              02. RAM Trend
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              Peak {ramPeak.toFixed(1)}% · {latestRes?.users_count ?? 0} active users
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-teal-600 dark:text-teal-400 font-semibold">
            {latestRes ? `${latestRes.ram_usage.toFixed(1)}% allocated` : 'Memory %'}
          </span>
        </div>
        <div className="h-56">
          <canvas ref={ramCanvasRef} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              03. Predicted vs Actual CPU
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              OLS R² {latestPred ? latestPred.r2_score.toFixed(3) : '0.931'} · MAE{' '}
              {latestPred ? `${latestPred.mae.toFixed(2)}%` : '2.74%'}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 font-semibold">
            {latestPred
              ? `${latestPred.predicted_cpu.toFixed(1)}% next`
              : 'Linear Regression forecast'}
          </span>
        </div>
        <div className="h-56">
          <canvas ref={predCanvasRef} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              04. Server Scaling History
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              Peak {maxNodesObserved} nodes · Last action {latestScale?.action ?? 'HOLD'}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
            {latestScale ? `${latestScale.new_servers} active nodes` : 'Active instances'}
          </span>
        </div>
        <div className="h-56">
          <canvas ref={serversCanvasRef} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 lg:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              05. Elastic Fleet Cost vs. Static Peak Provisioning
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
              Static ₹{(latestCost?.cost_without_optimization ?? 2160).toLocaleString()}/day ·
              Elastic ₹{(latestCost?.daily_cost ?? 720).toLocaleString()}/day
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
            {latestCost
              ? `Saves ₹${latestCost.cost_saved_daily.toFixed(0)}/day (${latestCost.savings_percent.toFixed(1)}%)`
              : 'Cost Optimization'}
          </span>
        </div>
        <div className="h-60">
          <canvas ref={costCanvasRef} />
        </div>
      </div>
    </section>
  );
}

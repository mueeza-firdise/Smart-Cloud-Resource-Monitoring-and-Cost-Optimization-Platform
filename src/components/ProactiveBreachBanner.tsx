import {AlertTriangle, MessageSquareText, SlidersHorizontal, X} from 'lucide-react';
import type {ProactiveForecastSummary} from '../types';

interface ProactiveBreachBannerProps {
  forecast: ProactiveForecastSummary;
  dismissedKey: string | null;
  currentKey: string;
  onDismiss: (key: string) => void;
  onInspectThresholds: () => void;
  onOpenAssistant: () => void;
}

export function ProactiveBreachBanner({
  forecast,
  dismissedKey,
  currentKey,
  onDismiss,
  onInspectThresholds,
  onOpenAssistant,
}: ProactiveBreachBannerProps) {
  if (!forecast.breachDetected || dismissedKey === currentKey) {
    return null;
  }

  const isCritical = forecast.severity === 'critical';
  const stepText =
    forecast.firstBreachStep === 1
      ? 'next simulation step (Step +1)'
      : `Step +${forecast.firstBreachStep} (within 3 steps)`;

  return (
    <section
      role="alert"
      aria-live="polite"
      aria-label="Proactive CPU Threshold Breach Warning"
      className={`rounded-xl border p-4 sm:p-5 transition-colors ${
        isCritical
          ? 'border-red-300 dark:border-red-800/80 bg-red-50/90 dark:bg-red-950/35'
          : 'border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/35'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className={`mt-0.5 p-2 rounded-lg border shrink-0 ${
              isCritical
                ? 'border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400'
                : 'border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2
                className={`font-display text-sm font-bold tracking-tight ${
                  isCritical
                    ? 'text-red-900 dark:text-red-200'
                    : 'text-amber-900 dark:text-amber-200'
                }`}
              >
                {isCritical
                  ? 'Critical 3-Step CPU Breach Warning'
                  : 'Proactive Scale-Up High Breach Warning'}
              </h2>
              <span
                className={`text-xs font-mono tabular-nums font-semibold ${
                  isCritical
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                Peak {forecast.peakProjectedCpu.toFixed(1)}% · Threshold &gt;{forecast.scaleUpHigh}%
              </span>
            </div>

            <p
              className={`text-xs leading-relaxed ${
                isCritical
                  ? 'text-red-800 dark:text-red-300'
                  : 'text-amber-900/90 dark:text-amber-200/90'
              }`}
            >
              Linear Regression trajectory predicts CPU load will exceed your{' '}
              <span className="font-semibold">Scale-Up High ({forecast.scaleUpHigh}%)</span>{' '}
              threshold by <span className="font-semibold">{stepText}</span>
              {isCritical
                ? ` and surpass Scale-Up Critical (${forecast.scaleUpCritical}%).`
                : '.'}
            </p>
          </div>
        </div>

        {/* 3-Step Trajectory Readout & Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="grid grid-cols-3 gap-1.5">
            {forecast.steps.map((s) => {
              const stepClass = s.exceedsCritical
                ? 'border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300'
                : s.exceedsHigh
                  ? 'border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300';

              return (
                <div
                  key={s.step}
                  className={`px-2.5 py-1.5 rounded-lg border text-center min-w-[74px] ${stepClass}`}
                >
                  <div className="text-[10px] font-medium opacity-75">{s.label}</div>
                  <div className="font-mono tabular-nums text-xs font-bold mt-0.5">
                    {s.predictedCpu.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onInspectThresholds}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Thresholds</span>
            </button>

            <button
              type="button"
              onClick={onOpenAssistant}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap transition-colors cursor-pointer ${
                isCritical
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Ask AI</span>
            </button>

            <button
              type="button"
              onClick={() => onDismiss(currentKey)}
              aria-label="Dismiss proactive breach warning"
              title="Dismiss until next simulation or threshold update"
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isCritical
                  ? 'border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100/70 dark:hover:bg-red-900/40'
                  : 'border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-900/40'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

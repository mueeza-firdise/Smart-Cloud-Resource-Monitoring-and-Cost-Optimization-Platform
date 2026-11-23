import {useEffect, useState} from 'react';
import {BookmarkPlus, RotateCcw, Save, SlidersHorizontal, Trash2} from 'lucide-react';
import {ThresholdImpactChart} from './ThresholdImpactChart';
import {deleteScalingPreset, saveScalingPreset} from '../lib/firestoreStore';
import type {
  PredictionLog,
  ResourceLog,
  ScalingConfig,
  ScalingPresetDoc,
  TrainedModelInfo,
} from '../types';

interface ModelDatasetViewProps {
  model: TrainedModelInfo | null;
  token: string;
  userUid: string;
  scalingConfig: ScalingConfig;
  onConfigUpdated: (updated: ScalingConfig) => void;
  resourceLogs: ResourceLog[];
  predictions: PredictionLog[];
  presets: ScalingPresetDoc[];
  isDark?: boolean;
}

const DEFAULT_CONFIG: ScalingConfig = {
  scaleDownLow: 20,
  scaleDownModerate: 30,
  scaleUpHigh: 80,
  scaleUpCritical: 90,
  minServers: 2,
  maxServers: 20,
};

export function ModelDatasetView({
  model,
  token,
  userUid,
  scalingConfig,
  onConfigUpdated,
  resourceLogs,
  predictions,
  presets,
  isDark = false,
}: ModelDatasetViewProps) {
  const [draft, setDraft] = useState<ScalingConfig>(scalingConfig);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(scalingConfig);
  }, [scalingConfig]);

  if (!model) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-sm text-slate-600 dark:text-slate-400">
        Loading Linear Regression model metrics and dataset telemetry...
      </div>
    );
  }

  function validateDraft(cfg: ScalingConfig): string | null {
    if (cfg.scaleDownLow < 5 || cfg.scaleUpCritical > 99) {
      return 'CPU thresholds must remain between 5% and 99%.';
    }
    if (
      !(
        cfg.scaleDownLow < cfg.scaleDownModerate &&
        cfg.scaleDownModerate < cfg.scaleUpHigh &&
        cfg.scaleUpHigh < cfg.scaleUpCritical
      )
    ) {
      return 'Thresholds must follow strict order: Scale Down (-2) < Scale Down (-1) < Scale Up (+2) < Scale Up (+3).';
    }
    if (cfg.minServers < 1 || cfg.maxServers > 50 || cfg.minServers >= cfg.maxServers) {
      return 'Server bounds must satisfy 1 <= Min Servers < Max Servers <= 50.';
    }
    return null;
  }

  async function persistConfig(target: ScalingConfig) {
    const validationError = validateDraft(target);
    if (validationError) {
      setErrorMsg(validationError);
      setSaveMessage(null);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/scaling-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(target),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to save CPU scaling thresholds.');
        return;
      }
      onConfigUpdated(data.scalingConfig);
      setSaveMessage('CPU scaling thresholds saved and applied to live auto-scaling.');
    } catch {
      setErrorMsg('Network error while saving scaling thresholds.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePreset() {
    const validationError = validateDraft(draft);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    const label = presetName.trim() || `Profile (${draft.scaleUpHigh}% / ${draft.scaleUpCritical}%)`;
    setSavingPreset(true);
    setErrorMsg(null);
    setSaveMessage(null);
    try {
      await saveScalingPreset(userUid, label, draft);
      setPresetName('');
      setSaveMessage(`Saved preset "${label}" to cloud storage.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save cloud preset.');
    } finally {
      setSavingPreset(false);
    }
  }

  async function handleDeletePreset(presetId: string) {
    setErrorMsg(null);
    try {
      await deleteScalingPreset(userUid, presetId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to remove cloud preset.');
    }
  }

  const isDirty =
    draft.scaleDownLow !== scalingConfig.scaleDownLow ||
    draft.scaleDownModerate !== scalingConfig.scaleDownModerate ||
    draft.scaleUpHigh !== scalingConfig.scaleUpHigh ||
    draft.scaleUpCritical !== scalingConfig.scaleUpCritical ||
    draft.minServers !== scalingConfig.minServers ||
    draft.maxServers !== scalingConfig.maxServers;

  const bandScaleDownLow = Math.max(0, Math.min(100, draft.scaleDownLow));
  const bandScaleDownMod = Math.max(0, draft.scaleDownModerate - draft.scaleDownLow);
  const bandHealthy = Math.max(0, draft.scaleUpHigh - draft.scaleDownModerate);
  const bandScaleUpHigh = Math.max(0, draft.scaleUpCritical - draft.scaleUpHigh);
  const bandScaleUpCrit = Math.max(0, 100 - draft.scaleUpCritical);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Algorithm</div>
          <div className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Linear Regression
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ordinary Least Squares (80/20 split)
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">R² Goodness of Fit</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-blue-600 dark:text-blue-400">
            {model.r2Score.toFixed(4)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Evaluated on test split
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Mean Absolute Error (MAE)
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
            {model.mae.toFixed(2)}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            RMSE: {model.rmse.toFixed(2)}%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Dataset Records</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
            {model.totalDatasetRows.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            dataset/resource_usage.csv
          </div>
        </div>
      </div>

      {/* CPU Scaling Threshold Configuration Interface */}
      <section
        aria-label="Auto-Scaling CPU Threshold Configuration"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <h2 className="font-display text-base font-bold">
                Auto-Scaling CPU Threshold Configuration
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Adjust predicted CPU thresholds and cluster capacity bounds used by the live auto-scaler.
              {scalingConfig.updatedAt ? (
                <span className="ml-1 font-mono tabular-nums">
                  · Last updated {scalingConfig.updatedAt}
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(DEFAULT_CONFIG);
                void persistConfig(DEFAULT_CONFIG);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Defaults</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistConfig(draft)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : isDirty ? 'Save Thresholds' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mb-5 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
          >
            {errorMsg}
          </div>
        )}

        {saveMessage && (
          <div
            role="status"
            className="mb-5 px-4 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-300"
          >
            {saveMessage}
          </div>
        )}

        {/* Visual CPU Operating Spectrum */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-2">
            <span>Predicted CPU Operating Bands (0% – 100%)</span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Healthy Dead-Band: {draft.scaleDownModerate}% – {draft.scaleUpHigh}%
            </span>
          </div>
          <div className="h-3 w-full rounded-md overflow-hidden flex border border-slate-200 dark:border-slate-700">
            <div style={{width: `${bandScaleDownLow}%`}} className="bg-sky-600 transition-all" />
            <div style={{width: `${bandScaleDownMod}%`}} className="bg-sky-300 transition-all" />
            <div style={{width: `${bandHealthy}%`}} className="bg-emerald-500 transition-all" />
            <div style={{width: `${bandScaleUpHigh}%`}} className="bg-amber-500 transition-all" />
            <div style={{width: `${bandScaleUpCrit}%`}} className="bg-red-600 transition-all" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            <span>&lt;{draft.scaleDownLow}%: -2 nodes</span>
            <span>&lt;{draft.scaleDownModerate}%: -1 node</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              {draft.scaleDownModerate}–{draft.scaleUpHigh}%: Hold
            </span>
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              &gt;{draft.scaleUpHigh}%: +2 nodes
            </span>
            <span className="text-red-700 dark:text-red-400 font-medium">
              &gt;{draft.scaleUpCritical}%: +3 nodes
            </span>
          </div>
        </div>

        {/* Threshold Sliders & Numeric Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="cfg-scale-up-high" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Scale Up Trigger (+2 Servers)
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="cfg-scale-up-high"
                  type="number"
                  min={40}
                  max={95}
                  step={1}
                  value={draft.scaleUpHigh}
                  onChange={(e) => setDraft({...draft, scaleUpHigh: Number(e.target.value)})}
                  className="w-16 px-2 py-1 text-right font-mono tabular-nums text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-md text-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            </div>
            <input
              type="range"
              aria-label="Scale Up Trigger (+2 Servers) slider"
              min={40}
              max={95}
              step={1}
              value={draft.scaleUpHigh}
              onChange={(e) => setDraft({...draft, scaleUpHigh: Number(e.target.value)})}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Triggers +2 servers when Predicted CPU exceeds {draft.scaleUpHigh}%.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="cfg-scale-up-critical" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Critical Scale Up Trigger (+3 Servers)
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="cfg-scale-up-critical"
                  type="number"
                  min={50}
                  max={99}
                  step={1}
                  value={draft.scaleUpCritical}
                  onChange={(e) => setDraft({...draft, scaleUpCritical: Number(e.target.value)})}
                  className="w-16 px-2 py-1 text-right font-mono tabular-nums text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-md text-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            </div>
            <input
              type="range"
              aria-label="Critical Scale Up Trigger (+3 Servers) slider"
              min={50}
              max={99}
              step={1}
              value={draft.scaleUpCritical}
              onChange={(e) => setDraft({...draft, scaleUpCritical: Number(e.target.value)})}
              className="w-full accent-red-600 cursor-pointer"
            />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Triggers +3 servers when Predicted CPU exceeds {draft.scaleUpCritical}%.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="cfg-scale-down-mod" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Scale Down Trigger (-1 Server)
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="cfg-scale-down-mod"
                  type="number"
                  min={10}
                  max={65}
                  step={1}
                  value={draft.scaleDownModerate}
                  onChange={(e) =>
                    setDraft({...draft, scaleDownModerate: Number(e.target.value)})
                  }
                  className="w-16 px-2 py-1 text-right font-mono tabular-nums text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-md text-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            </div>
            <input
              type="range"
              aria-label="Scale Down Trigger (-1 Server) slider"
              min={10}
              max={65}
              step={1}
              value={draft.scaleDownModerate}
              onChange={(e) =>
                setDraft({...draft, scaleDownModerate: Number(e.target.value)})
              }
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Removes 1 idle server when Predicted CPU drops below {draft.scaleDownModerate}%.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="cfg-scale-down-low" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Aggressive Scale Down (-2 Servers)
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="cfg-scale-down-low"
                  type="number"
                  min={5}
                  max={45}
                  step={1}
                  value={draft.scaleDownLow}
                  onChange={(e) => setDraft({...draft, scaleDownLow: Number(e.target.value)})}
                  className="w-16 px-2 py-1 text-right font-mono tabular-nums text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-md text-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            </div>
            <input
              type="range"
              aria-label="Aggressive Scale Down (-2 Servers) slider"
              min={5}
              max={45}
              step={1}
              value={draft.scaleDownLow}
              onChange={(e) => setDraft({...draft, scaleDownLow: Number(e.target.value)})}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Removes 2 idle servers when Predicted CPU drops below {draft.scaleDownLow}%.
            </div>
          </div>

          <div>
            <label htmlFor="cfg-min-servers" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Minimum Server Floor
            </label>
            <input
              id="cfg-min-servers"
              type="number"
              min={1}
              max={15}
              value={draft.minServers}
              onChange={(e) =>
                setDraft({...draft, minServers: Math.round(Number(e.target.value))})
              }
              className="w-full px-3 py-2 font-mono tabular-nums text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="cfg-max-servers" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Maximum Server Ceiling
            </label>
            <input
              id="cfg-max-servers"
              type="number"
              min={2}
              max={50}
              value={draft.maxServers}
              onChange={(e) =>
                setDraft({...draft, maxServers: Math.round(Number(e.target.value))})
              }
              className="w-full px-3 py-2 font-mono tabular-nums text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Cloud-Synced Threshold Presets (Firestore) */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Saved Threshold Presets (Cloud Sync)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bookmark custom threshold rulesets to your account for instant switching across devices.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                maxLength={64}
                placeholder="Preset name (e.g. Cost Saver)"
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 w-52"
              />
              <button
                type="button"
                disabled={savingPreset}
                onClick={handleSavePreset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>{savingPreset ? 'Saving...' : 'Save Preset'}</span>
              </button>
            </div>
          </div>

          {presets.length === 0 ? (
            <div className="px-4 py-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              No saved presets yet. Enter a name above and click Save Preset to store this threshold profile to Firestore.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {presets.map((p) => {
                const isActive =
                  p.scaleDownLow === scalingConfig.scaleDownLow &&
                  p.scaleDownModerate === scalingConfig.scaleDownModerate &&
                  p.scaleUpHigh === scalingConfig.scaleUpHigh &&
                  p.scaleUpCritical === scalingConfig.scaleUpCritical &&
                  p.minServers === scalingConfig.minServers &&
                  p.maxServers === scalingConfig.maxServers;
                return (
                  <div
                    key={p.id}
                    className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50/50 dark:bg-slate-950/40"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </span>
                      <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        Down {p.scaleDownLow}%/{p.scaleDownModerate}% · Up {p.scaleUpHigh}%/{p.scaleUpCritical}% · {p.minServers}–{p.maxServers} nodes
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isActive || saving}
                        onClick={() => {
                          const nextCfg: ScalingConfig = {
                            scaleDownLow: p.scaleDownLow,
                            scaleDownModerate: p.scaleDownModerate,
                            scaleUpHigh: p.scaleUpHigh,
                            scaleUpCritical: p.scaleUpCritical,
                            minServers: p.minServers,
                            maxServers: p.maxServers,
                          };
                          setDraft(nextCfg);
                          void persistConfig(nextCfg);
                        }}
                        className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isActive ? 'Applied' : 'Apply'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete preset ${p.name}`}
                        onClick={() => void handleDeletePreset(p.id)}
                        className="p-1.5 text-slate-500 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ThresholdImpactChart
        config={draft}
        resourceLogs={resourceLogs}
        predictions={predictions}
        model={model}
        isDark={isDark}
      />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Trained Model Weights &amp; Intercept
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Predicts next-interval Future CPU Usage from current cluster telemetry features.
        </p>
        <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-nowrap">
          ŷ(CPU) = {model.intercept}{' '}
          {model.features
            .map((feat, idx) => {
              const w = model.coefficients[idx] ?? 0;
              return `${w >= 0 ? '+' : '−'} ${Math.abs(w)}·${feat}`;
            })
            .join(' ')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
                <th className="py-2 pr-4">Feature</th>
                <th className="py-2 px-4 text-right">Linear Weight (β)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr>
                <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-100">
                  Intercept (β₀)
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {model.intercept}
                </td>
              </tr>
              {model.features.map((feat, idx) => (
                <tr key={feat}>
                  <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">{feat}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {model.coefficients[idx]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Training Dataset Preview (dataset/resource_usage.csv)
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Showing 15 of {model.totalDatasetRows} rows
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-4 text-right">CPU Usage (%)</th>
                <th className="py-2.5 px-4 text-right">RAM Usage (%)</th>
                <th className="py-2.5 px-4 text-right">Server Count</th>
                <th className="py-2.5 px-4 text-right">Network Load (Mbps)</th>
                <th className="py-2.5 px-4 text-right">Users Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums text-xs">
              {model.sampleRows.map((row) => (
                <tr key={row.time} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {row.time}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900 dark:text-slate-100">
                    {row.cpuUsage.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900 dark:text-slate-100">
                    {row.ramUsage.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900 dark:text-slate-100">
                    {row.serverCount}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900 dark:text-slate-100">
                    {row.networkLoad.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-900 dark:text-slate-100">
                    {row.usersCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

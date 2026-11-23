import {useCallback, useEffect, useMemo, useState} from 'react';
import {onIdTokenChanged, signOut, type User} from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bookmark,
  Box,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Globe,
  HardDrive,
  IndianRupee,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Sun,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {Cluster3DView} from './components/Cluster3DView';
import {GeminiAssistantView} from './components/GeminiAssistantView';
import {LoginView} from './components/LoginView';
import {MarkdownContent} from './components/MarkdownContent';
import {ModelDatasetView} from './components/ModelDatasetView';
import {OverviewSparkline} from './components/OverviewSparkline';
import {ProactiveBreachBanner} from './components/ProactiveBreachBanner';
import {ProjectBlueprintView} from './components/ProjectBlueprintView';
import {ReportView} from './components/ReportView';
import {TelemetryCharts} from './components/TelemetryCharts';
import {auth} from './lib/firebase';
import {computeProactive3StepForecast} from './lib/forecast';
import {
  deleteTelemetrySnapshot,
  ensureUserProfile,
  saveTelemetrySnapshot,
  subscribeUserPresets,
  subscribeUserSnapshots,
} from './lib/firestoreStore';
import type {
  AuthenticatedUser,
  CloudBenchmarkResult,
  DashboardHistory,
  ScalingConfig,
  ScalingPresetDoc,
  TelemetrySnapshotDoc,
  TrainedModelInfo,
} from './types';

type NavTab = 'dashboard' | 'cluster3d' | 'ml' | 'assistant' | 'report' | 'blueprint';

const DEFAULT_SCALING_CONFIG: ScalingConfig = {
  scaleDownLow: 20,
  scaleDownModerate: 30,
  scaleUpHigh: 80,
  scaleUpCritical: 90,
  minServers: 2,
  maxServers: 20,
};

function getLoadStatus(cpu: number, highThreshold: number): {
  label: string;
  textClass: string;
  barClass: string;
} {
  if (cpu > highThreshold) {
    return {
      label: 'Critical',
      textClass: 'text-red-600 dark:text-red-400',
      barClass: 'bg-red-600',
    };
  }
  if (cpu >= Math.max(40, highThreshold - 20)) {
    return {
      label: 'Elevated',
      textClass: 'text-amber-600 dark:text-amber-400',
      barClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Healthy',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    barClass: 'bg-emerald-500',
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const [history, setHistory] = useState<DashboardHistory | null>(null);
  const [model, setModel] = useState<TrainedModelInfo | null>(null);
  const [scalingConfig, setScalingConfig] = useState<ScalingConfig>(DEFAULT_SCALING_CONFIG);
  const [presets, setPresets] = useState<ScalingPresetDoc[]>([]);
  const [snapshots, setSnapshots] = useState<TelemetrySnapshotDoc[]>([]);

  const [recommendations, setRecommendations] = useState<string[]>([
    'Resource utilization is healthy.',
    'Cost optimization successful.',
  ]);
  const [simulating, setSimulating] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [benchmark, setBenchmark] = useState<CloudBenchmarkResult | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [benchmarkCanFallback, setBenchmarkCanFallback] = useState(false);
  const [dismissedBreachKey, setDismissedBreachKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const proactiveForecast = useMemo(
    () =>
      computeProactive3StepForecast({
        resourceLogs: history?.resource_logs ?? [],
        predictions: history?.predictions ?? [],
        scalingConfig,
        model,
      }),
    [history, model, scalingConfig],
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setFirebaseUser(null);
        setToken(null);
        setUser(null);
        setHistory(null);
        setPresets([]);
        setSnapshots([]);
        setAuthReady(true);
        return;
      }

      try {
        setAuthError(null);
        const idToken = await fbUser.getIdToken();
        setFirebaseUser(fbUser);
        setToken(idToken);
        setUser({
          id: 0,
          uid: fbUser.uid,
          email: fbUser.email || '',
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Cloud Operator',
          role: 'Cloud Architect',
          photoURL: fbUser.photoURL,
        });
        await ensureUserProfile(fbUser);
      } catch (err: unknown) {
        setAuthError(
          err instanceof Error ? err.message : 'Unable to initialize cloud user profile.',
        );
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchTelemetry = useCallback(async (authToken: string) => {
    try {
      const res = await fetch('/api/telemetry', {
        headers: {Authorization: `Bearer ${authToken}`},
      });
      if (res.status === 401) {
        setAuthError('Session expired. Please sign in again.');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to load telemetry from database.');
        return;
      }
      setHistory(data.history);
      setModel(data.model);
      if (data.scalingConfig) {
        setScalingConfig(data.scalingConfig);
      }
      const latestScaling =
        data.history?.scaling_history?.[data.history.scaling_history.length - 1];
      if (latestScaling?.reason) {
        setRecommendations([latestScaling.reason, 'Cost optimization successful.']);
      }
    } catch {
      setErrorMsg('Unable to load telemetry from server.');
    }
  }, []);

  useEffect(() => {
    if (!token || !firebaseUser) return;
    void fetchTelemetry(token);

    const unsubPresets = subscribeUserPresets(
      firebaseUser.uid,
      setPresets,
      (msg) => setErrorMsg(msg),
    );
    const unsubSnapshots = subscribeUserSnapshots(
      firebaseUser.uid,
      setSnapshots,
      (msg) => setErrorMsg(msg),
    );

    return () => {
      unsubPresets();
      unsubSnapshots();
    };
  }, [token, firebaseUser, fetchTelemetry]);

  async function runSimulation(mode: 'normal' | 'heavy' | 'peak' | 'demo_peak' | 'reset_demo') {
    if (!firebaseUser) return;
    setSimulating(true);
    setErrorMsg(null);
    try {
      const freshToken = await firebaseUser.getIdToken();
      setToken(freshToken);
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({mode}),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Simulation step failed.');
        return;
      }
      setHistory(data.history);
      if (Array.isArray(data.recommendations)) {
        setRecommendations(data.recommendations);
      }
    } catch {
      setErrorMsg('Network error during simulation.');
    } finally {
      setSimulating(false);
    }
  }

  async function handleSaveSnapshot() {
    if (!firebaseUser || !history) return;
    const latestResource = history.resource_logs[history.resource_logs.length - 1];
    const latestPrediction = history.predictions[history.predictions.length - 1];
    const latestCost = history.cost_history[history.cost_history.length - 1];
    if (!latestResource || !latestPrediction || !latestCost) return;

    setSavingSnapshot(true);
    setErrorMsg(null);
    try {
      await saveTelemetrySnapshot(firebaseUser.uid, {
        label: `${latestResource.traffic_mode} · ${latestResource.server_count} nodes`,
        trafficMode: latestResource.traffic_mode,
        cpuUsage: latestResource.cpu_usage,
        ramUsage: latestResource.ram_usage,
        storageUsage: latestResource.storage_usage,
        serverCount: latestResource.server_count,
        predictedCpu: latestPrediction.predicted_cpu,
        dailyCost: latestCost.daily_cost,
        costSavedDaily: latestCost.cost_saved_daily,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save cloud snapshot.');
    } finally {
      setSavingSnapshot(false);
    }
  }

  async function handleDownloadPdf() {
    if (!firebaseUser) return;
    setDownloadingPdf(true);
    setErrorMsg(null);
    try {
      const freshToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/report/pdf', {
        headers: {Authorization: `Bearer ${freshToken}`},
      });
      if (!res.ok) {
        setErrorMsg('Failed to generate PDF report.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cloud_scaling_report_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg('Error downloading PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleFetchBenchmark(mode: 'search' | 'standard' = 'search') {
    if (!firebaseUser || benchmarkLoading) return;
    setBenchmarkLoading(true);
    setBenchmarkError(null);
    setBenchmarkCanFallback(false);
    try {
      const freshToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/grounding/benchmark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
        body: JSON.stringify({mode}),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        setBenchmarkError(`Server returned HTTP ${res.status}. Please retry.`);
        return;
      }

      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : `Failed to retrieve live cloud pricing benchmark (HTTP ${res.status}).`;
        setBenchmarkError(msg);
        setBenchmarkCanFallback(Boolean(data.canRunStandard));
        return;
      }
      setBenchmark(data as unknown as CloudBenchmarkResult);
    } catch {
      setBenchmarkError('Network error while querying live cloud pricing benchmark.');
    } finally {
      setBenchmarkLoading(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">
          Initializing CloudScale ML workspace...
        </div>
      </div>
    );
  }

  if (!firebaseUser || !token || !user) {
    return <LoginView authError={authError} />;
  }

  const latestResource = history?.resource_logs[history.resource_logs.length - 1];
  const prevResource =
    history && history.resource_logs.length >= 2
      ? history.resource_logs[history.resource_logs.length - 2]
      : undefined;
  const latestPrediction = history?.predictions[history.predictions.length - 1];
  const latestScaling = history?.scaling_history[history.scaling_history.length - 1];
  const latestCost = history?.cost_history[history.cost_history.length - 1];

  const breachFingerprint = `${latestResource?.id ?? 0}:${scalingConfig.scaleUpHigh}:${scalingConfig.scaleUpCritical}:${proactiveForecast.firstBreachStep ?? 'ok'}`;

  const cpuVal = latestResource?.cpu_usage ?? 45;
  const ramVal = latestResource?.ram_usage ?? 52;
  const storageVal = latestResource?.storage_usage ?? 61.5;
  const activeServersVal = latestResource?.server_count ?? 3;
  const predictedCpuVal = latestPrediction?.predicted_cpu ?? 46.8;
  const cpuStatus = getLoadStatus(cpuVal, scalingConfig.scaleUpHigh);

  const cpuDelta = prevResource ? cpuVal - prevResource.cpu_usage : 0;
  const ramDelta = prevResource ? ramVal - prevResource.ram_usage : 0;
  const cpuSeries = history?.resource_logs.map((r) => r.cpu_usage) ?? [45];
  const ramSeries = history?.resource_logs.map((r) => r.ram_usage) ?? [52];
  const storageSeries = history?.resource_logs.map((r) => r.storage_usage) ?? [61.5];
  const serverSeries = history?.resource_logs.map((r) => r.server_count) ?? [3];
  const costSeries = history?.cost_history.map((c) => c.hourly_cost) ?? [30];
  const predSeries = history?.predictions.map((p) => p.predicted_cpu) ?? [46.8];
  const recentScalingEvents = (history?.scaling_history ?? []).slice(-4).reverse();

  const staticDailyBaseline = latestCost?.cost_without_optimization ?? 2160;
  const optimizedDaily = latestCost?.daily_cost ?? 720;
  const costBarPct = Math.min(100, Math.round((optimizedDaily / Math.max(1, staticDailyBaseline)) * 100));

  const navItems: {id: NavTab; label: string; icon: typeof Activity}[] = [
    {id: 'dashboard', label: 'Overview', icon: BarChart3},
    {id: 'cluster3d', label: '3D Cluster', icon: Box},
    {id: 'ml', label: 'ML & Thresholds', icon: Database},
    {id: 'assistant', label: 'AI Assistant', icon: MessageSquareText},
    {id: 'report', label: 'Executive Report', icon: FileText},
    {id: 'blueprint', label: 'Flask Source', icon: FileCode2},
  ];

  const breadcrumbTitle =
    navItems.find((item) => item.id === activeTab)?.label ?? 'Overview';

  const initials = user.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex md:w-64 md:flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0">
        <div className="h-16 px-6 flex items-center border-b border-slate-200 dark:border-slate-800">
          <span className="font-display font-bold text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            CloudScale ML
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-3 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.displayName}
              </div>
              <div className="text-slate-500 dark:text-slate-400 truncate">{user.email}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-display font-bold text-lg text-slate-900 dark:text-white">
                CloudScale ML
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="p-1.5 text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                      activeTab === item.id
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
          <div
            className="flex-1 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, clean actions on right */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="md:hidden p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span>Cloud Simulator</span>
              <span className="mx-2 text-slate-300 dark:text-slate-700" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {breadcrumbTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {history && proactiveForecast.breachDetected && (
              <button
                type="button"
                onClick={() => {
                  setDismissedBreachKey(null);
                  setActiveTab('dashboard');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  proactiveForecast.severity === 'critical'
                    ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950'
                    : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono tabular-nums">
                  Breach in +{proactiveForecast.firstBreachStep} step
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Generating...' : 'Download PDF Report'}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto space-y-6">
          {errorMsg && (
            <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-sm text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {history && (
            <ProactiveBreachBanner
              forecast={proactiveForecast}
              dismissedKey={dismissedBreachKey}
              currentKey={breachFingerprint}
              onDismiss={(key) => setDismissedBreachKey(key)}
              onInspectThresholds={() => setActiveTab('ml')}
              onOpenAssistant={() => setActiveTab('assistant')}
            />
          )}

          {activeTab === 'dashboard' && (
            <>
              {/* Hero Command Console & 3-Step Horizon Summary */}
              <section
                aria-label="Traffic Simulation Controls"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 relative overflow-hidden"
                style={{
                  backgroundImage: isDark
                    ? 'radial-gradient(circle at 92% 0%, rgba(37, 99, 235, 0.14), transparent 46%), radial-gradient(circle at 10% 100%, rgba(16, 185, 129, 0.08), transparent 42%)'
                    : 'radial-gradient(circle at 92% 0%, rgba(37, 99, 235, 0.07), transparent 46%), radial-gradient(circle at 10% 100%, rgba(16, 185, 129, 0.05), transparent 42%)',
                }}
              >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                  <div className="space-y-1.5 min-w-0">
                    <div className="text-xs font-mono tabular-nums text-blue-600 dark:text-blue-400 font-medium">
                      Smart Cloud Resource Monitoring &amp; Cost Optimization
                    </div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight [text-wrap:balance]">
                      Elastic Cluster Operations &amp; Predictive Auto-Scaler
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Mode: {latestResource?.traffic_mode ?? 'Normal'} · Bounds: {scalingConfig.minServers}–{scalingConfig.maxServers} nodes · Scale-Up &gt;{scalingConfig.scaleUpHigh}% / Crit &gt;{scalingConfig.scaleUpCritical}% · ₹10/hr/node
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={simulating}
                        onClick={() => void runSimulation('normal')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          latestResource?.traffic_mode === 'Normal'
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
                        }`}
                      >
                        Normal
                      </button>
                      <button
                        type="button"
                        disabled={simulating}
                        onClick={() => void runSimulation('heavy')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          latestResource?.traffic_mode === 'Heavy'
                            ? 'bg-amber-500 text-white'
                            : 'text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/60'
                        }`}
                      >
                        Heavy
                      </button>
                      <button
                        type="button"
                        disabled={simulating}
                        onClick={() => void runSimulation('peak')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          latestResource?.traffic_mode === 'Peak'
                            ? 'bg-red-600 text-white'
                            : 'text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/60'
                        }`}
                      >
                        Peak
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={simulating}
                      onClick={() => void runSimulation('demo_peak')}
                      className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      Jury Demo (92% Peak)
                    </button>
                    <button
                      type="button"
                      disabled={savingSnapshot || !history}
                      onClick={() => void handleSaveSnapshot()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>{savingSnapshot ? 'Saving...' : 'Save Snapshot'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={simulating}
                      onClick={() => void runSimulation('reset_demo')}
                      title="Reset baseline to 45% CPU and 3 servers"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Inline Telemetry & 3-Step Trajectory Strip */}
                <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Active Workload</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {(latestResource?.users_count ?? 340).toLocaleString()} users
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Network I/O</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {(latestResource?.network_load ?? 280).toFixed(0)} Mbps
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Headroom to High</div>
                    <div
                      className={`font-mono tabular-nums font-semibold mt-0.5 ${
                        scalingConfig.scaleUpHigh - cpuVal <= 10
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {(scalingConfig.scaleUpHigh - cpuVal).toFixed(1)}% margin
                    </div>
                  </div>
                  {proactiveForecast.steps.map((step) => (
                    <div key={step.step}>
                      <div className="text-slate-500 dark:text-slate-400">Forecast {step.label}</div>
                      <div
                        className={`font-mono tabular-nums font-semibold mt-0.5 ${
                          step.exceedsCritical
                            ? 'text-red-600 dark:text-red-400'
                            : step.exceedsHigh
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {step.predictedCpu.toFixed(1)}%
                        {step.exceedsCritical ? ' (Crit)' : step.exceedsHigh ? ' (High)' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 6 Dashboard KPI Cards with Real Telemetry Sparklines */}
              <section
                aria-label="Cluster KPI Summary"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
              >
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">CPU Usage</div>
                      <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {cpuVal.toFixed(1)}%
                      </div>
                    </div>
                    <Cpu className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                  <OverviewSparkline
                    values={cpuSeries}
                    strokeColor={cpuVal > scalingConfig.scaleUpHigh ? '#DC2626' : '#2563EB'}
                    ariaLabel="CPU usage trend sparkline"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium ${cpuStatus.textClass}`}>{cpuStatus.label}</span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {cpuDelta >= 0 ? `+${cpuDelta.toFixed(1)}` : cpuDelta.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">RAM Usage</div>
                      <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {ramVal.toFixed(1)}%
                      </div>
                    </div>
                    <Activity className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                  <OverviewSparkline
                    values={ramSeries}
                    strokeColor="#0D9488"
                    ariaLabel="RAM usage trend sparkline"
                  />
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span>{latestResource?.users_count ?? 0} users</span>
                    <span>{ramDelta >= 0 ? `+${ramDelta.toFixed(1)}` : ramDelta.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Storage Usage</div>
                      <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {storageVal.toFixed(1)}%
                      </div>
                    </div>
                    <HardDrive className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                  <OverviewSparkline
                    values={storageSeries}
                    strokeColor={isDark ? '#94A3B8' : '#475569'}
                    ariaLabel="Storage utilization sparkline"
                  />
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span>Volume I/O</span>
                    <span>{(latestResource?.network_load ?? 0).toFixed(0)} Mbps</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Active Servers</div>
                      <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {activeServersVal}
                      </div>
                    </div>
                    <Server className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                  <OverviewSparkline
                    values={serverSeries}
                    min={0}
                    max={scalingConfig.maxServers}
                    strokeColor="#2563EB"
                    ariaLabel="Active servers trend sparkline"
                  />
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span>
                      {latestScaling
                        ? `${latestScaling.previous_servers} → ${latestScaling.new_servers} nodes`
                        : `Min ${scalingConfig.minServers}`}
                    </span>
                    <span>Cap {scalingConfig.maxServers}</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Current Cost</div>
                      <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        ₹{(latestCost?.hourly_cost ?? 30).toFixed(0)}/hr
                      </div>
                    </div>
                    <IndianRupee className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                  <OverviewSparkline
                    values={costSeries}
                    min={0}
                    max={Math.max(200, scalingConfig.maxServers * 10)}
                    strokeColor="#16A34A"
                    ariaLabel="Hourly cluster cost sparkline"
                  />
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      -₹{(latestCost?.cost_saved_daily ?? 0).toFixed(0)}/d
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {(latestCost?.savings_percent ?? 0).toFixed(0)}% saved
                    </span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Predicted CPU</div>
                      <div
                        className={`font-mono tabular-nums text-2xl font-bold mt-1 ${
                          proactiveForecast.breachDetected
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {predictedCpuVal.toFixed(1)}%
                      </div>
                    </div>
                    <TrendingUp
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        proactiveForecast.breachDetected
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    />
                  </div>
                  <OverviewSparkline
                    values={predSeries}
                    strokeColor={proactiveForecast.breachDetected ? '#D97706' : '#2563EB'}
                    ariaLabel="Predicted CPU trend sparkline"
                  />
                  <div
                    className={`text-xs font-mono tabular-nums truncate ${
                      proactiveForecast.breachDetected
                        ? 'font-semibold text-amber-700 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {proactiveForecast.breachDetected
                      ? `Step +${proactiveForecast.firstBreachStep} breach · Peak ${proactiveForecast.peakProjectedCpu.toFixed(1)}%`
                      : `R² ${(model?.r2Score ?? 0.93).toFixed(2)} · OLS Reg.`}
                  </div>
                </div>
              </section>

              {/* Asymmetric Insights Row: Cost + AI Decisions (7 cols) / Scaling Ledger + Cloud Snapshots (5 cols) */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                        Cost Optimization &amp; Auto-Scaler Intelligence
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Elastic provisioning vs. fixed peak fleet allocation
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                      Action: {latestScaling?.action ?? 'HOLD'}
                    </span>
                  </div>

                  {/* Cost Comparison Meter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">
                        Elastic Spend vs. Static Peak Baseline (₹{staticDailyBaseline.toLocaleString()}/day)
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                        {(latestCost?.savings_percent ?? 0).toFixed(1)}% saved
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{width: `${Math.min(100, Math.max(4, costBarPct))}%`}}
                        title={`Elastic spend: ₹${optimizedDaily}/day`}
                      />
                      <div
                        className="h-full bg-emerald-500/80 transition-all duration-300"
                        style={{width: `${Math.max(0, 100 - Math.min(100, Math.max(4, costBarPct)))}%`}}
                        title={`Daily savings: ₹${(latestCost?.cost_saved_daily ?? 0).toFixed(0)}/day`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      <span>Elastic Spend: ₹{optimizedDaily.toLocaleString()}/day</span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Avoided Waste: ₹{(latestCost?.cost_saved_daily ?? 0).toLocaleString()}/day
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-sm">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Daily Cost</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white text-base mt-0.5">
                        ₹{optimizedDaily.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Monthly Proj.</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white text-base mt-0.5">
                        ₹{(latestCost?.monthly_cost ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Static Peak</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-400 text-base mt-0.5">
                        ₹{staticDailyBaseline.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Daily Saved</div>
                      <div className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-base mt-0.5">
                        ₹{(latestCost?.cost_saved_daily ?? 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      AI Decision Stream
                    </div>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {proactiveForecast.breachDetected && (
                        <li className="py-2 font-medium text-amber-800 dark:text-amber-300 font-mono tabular-nums">
                          Proactive 3-Step Alert: CPU projected at{' '}
                          {proactiveForecast.steps
                            .map((s) => `${s.label} ${s.predictedCpu.toFixed(1)}%`)
                            .join(' → ')}{' '}
                          (exceeds &gt;{scalingConfig.scaleUpHigh}% Scale-Up High at Step +
                          {proactiveForecast.firstBreachStep}).
                        </li>
                      )}
                      {recommendations.map((msg, idx) => (
                        <li key={`${msg}-${idx}`} className="py-2 text-slate-700 dark:text-slate-300">
                          {msg}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Live Google Search Cloud Pricing Benchmark */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Live Cloud Pricing Benchmark (Google Search)</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Compare ₹10/node/hr simulation against current Mumbai (asia-south1) cloud VM rates via Gemini 4 Hydrogen.
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={benchmarkLoading}
                        onClick={() => void handleFetchBenchmark('search')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>{benchmarkLoading ? 'Searching Web...' : benchmark ? 'Refresh Benchmark' : 'Compare Live Rates'}</span>
                      </button>
                    </div>

                    {benchmarkError && (
                      <div className="px-3.5 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 space-y-2.5">
                        <div>{benchmarkError}</div>
                        {benchmarkCanFallback && (
                          <button
                            type="button"
                            disabled={benchmarkLoading}
                            onClick={() => void handleFetchBenchmark('standard')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 hover:bg-red-100/60 dark:hover:bg-red-950 text-red-800 dark:text-red-200 font-semibold whitespace-nowrap cursor-pointer"
                          >
                            <span>Run Standard AI Analysis (No Web Search)</span>
                          </button>
                        )}
                      </div>
                    )}

                    {benchmark && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-3">
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {benchmark.model} · {benchmark.grounded ? 'Google Search Grounded' : 'Model Estimate (No Web Search)'}
                        </div>
                        <MarkdownContent
                          content={benchmark.summary}
                          className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
                        />
                        {benchmark.grounding.sources.length > 0 && (
                          <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {benchmark.grounding.sources.slice(0, 4).map((src) => (
                              <a
                                key={src.uri}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 text-[11px] text-slate-700 dark:text-slate-300 transition-colors min-w-0"
                              >
                                <span className="truncate">{src.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Scaling Ledger + Saved Cloud Snapshots */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between gap-5">
                  <div className="space-y-5">
                    {/* Recent Scaling Ledger */}
                    <div>
                      <div className="flex items-baseline justify-between mb-2.5">
                        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                          Recent Scaling Events
                        </h2>
                        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          Latest {recentScalingEvents.length}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                              <th className="py-1.5 pr-2 font-medium">Time</th>
                              <th className="py-1.5 px-2 font-medium">Decision</th>
                              <th className="py-1.5 px-2 text-right font-medium">Fleet</th>
                              <th className="py-1.5 pl-2 text-right font-medium">Pred</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                            {recentScalingEvents.map((ev) => (
                              <tr key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                <td className="py-2 pr-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {ev.timestamp.slice(11, 19)}
                                </td>
                                <td
                                  className={`py-2 px-2 font-semibold whitespace-nowrap ${
                                    ev.action === 'SCALE_UP'
                                      ? 'text-red-600 dark:text-red-400'
                                      : ev.action === 'SCALE_DOWN'
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {ev.action}
                                </td>
                                <td className="py-2 px-2 text-right text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {ev.previous_servers} → {ev.new_servers}
                                </td>
                                <td className="py-2 pl-2 text-right text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  {ev.predicted_cpu.toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Saved Telemetry Snapshots */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-baseline justify-between mb-2.5">
                        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                          Saved Telemetry Snapshots
                        </h3>
                        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {snapshots.length} bookmarked
                        </span>
                      </div>

                      {snapshots.length === 0 ? (
                        <div className="py-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          Click <span className="font-semibold text-slate-700 dark:text-slate-200">Save Snapshot</span> above after running a scenario to archive metrics and savings across devices.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto">
                          {snapshots.map((snap) => (
                            <div
                              key={snap.id}
                              className="py-2 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {snap.label}
                                </div>
                                <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                                  CPU {snap.cpuUsage.toFixed(1)}% · Pred {snap.predictedCpu.toFixed(1)}% · ₹{snap.dailyCost.toFixed(0)}/day
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-label={`Delete snapshot ${snap.label}`}
                                onClick={() =>
                                  firebaseUser && void deleteTelemetrySnapshot(firebaseUser.uid, snap.id)
                                }
                                className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('cluster3d')}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Box className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>3D Twin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ml')}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Thresholds</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('assistant')}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
                      <span>Ask AI</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* 5 Chart.js Charts */}
              {history && <TelemetryCharts history={history} isDark={isDark} />}
            </>
          )}

          {activeTab === 'cluster3d' && (
            <Cluster3DView
              activeServers={activeServersVal}
              maxServers={scalingConfig.maxServers}
              cpuUsage={cpuVal}
              ramUsage={ramVal}
              predictedCpu={predictedCpuVal}
              networkLoad={latestResource?.network_load ?? 280}
              trafficMode={latestResource?.traffic_mode ?? 'Normal'}
              scalingConfig={scalingConfig}
              onSimulate={(mode) => void runSimulation(mode)}
              simulating={simulating}
            />
          )}

          {activeTab === 'ml' && (
            <ModelDatasetView
              model={model}
              token={token}
              userUid={firebaseUser.uid}
              scalingConfig={scalingConfig}
              onConfigUpdated={setScalingConfig}
              resourceLogs={history?.resource_logs ?? []}
              predictions={history?.predictions ?? []}
              presets={presets}
              isDark={isDark}
            />
          )}

          {activeTab === 'assistant' && (
            <GeminiAssistantView
              token={token}
              getFreshToken={() => firebaseUser.getIdToken()}
              latestResource={latestResource}
              latestPrediction={latestPrediction}
              latestCost={latestCost}
              scalingConfig={scalingConfig}
              proactiveForecast={proactiveForecast}
            />
          )}

          {activeTab === 'report' && history && (
            <ReportView
              history={history}
              model={model}
              onDownloadPdf={handleDownloadPdf}
              downloadingPdf={downloadingPdf}
            />
          )}

          {activeTab === 'blueprint' && <ProjectBlueprintView token={token} />}
        </main>
      </div>
    </div>
  );
}

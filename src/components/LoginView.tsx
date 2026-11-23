import {useState} from 'react';
import {signInWithPopup} from 'firebase/auth';
import {
  ArrowRight,
  BarChart3,
  Box,
  Database,
  Globe,
  Server,
} from 'lucide-react';
import {auth, googleAuthProvider} from '../lib/firebase';

interface LoginViewProps {
  authError?: string | null;
}

export function LoginView({authError}: LoginViewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLocalError(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Google sign-in popup was closed or blocked.';
      setLocalError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden items-stretch shadow-sm">
        {/* Left Architectural Showcase */}
        <div
          className="lg:col-span-7 p-8 sm:p-12 bg-slate-950 text-slate-100 flex flex-col justify-between gap-10 relative overflow-hidden"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 18%, rgba(37, 99, 235, 0.22), transparent 52%), radial-gradient(circle at 86% 82%, rgba(16, 185, 129, 0.14), transparent 48%)',
          }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display font-bold text-lg tracking-tight text-white">
                  CloudScale ML
                </div>
                <div className="text-xs text-slate-400">
                  Predictive Resource Monitoring &amp; Auto-Scaling Simulator
                </div>
              </div>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white leading-[1.15] max-w-xl [text-wrap:balance]">
              Proactive ML Auto-Scaling &amp; Real-Time 3D Infrastructure Telemetry
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mt-4 leading-relaxed max-w-xl">
              Forecast upcoming CPU demand with multivariate Linear Regression, scale virtual compute fleets automatically between 2 and 20 nodes, inspect live workloads in 3D, and quantify cloud cost savings in INR.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-5 pt-8 border-t border-slate-800/90">
            <div className="flex items-start gap-3">
              <BarChart3 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-white">OLS Linear Regression Engine</div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Trained on 1,080 multi-feature resource records with customizable threshold bands.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Box className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-white">Three.js 3D Cluster Twin</div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Interactive WebGL server rack array and optical packet streams synced to live CPU load.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Globe className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-white">Search-Grounded AI Architect</div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Multi-turn Gemini 4 Hydrogen advisor with live Google Search cloud pricing citations.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Database className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-white">Cloud SQL + Firestore Persistence</div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                  PostgreSQL telemetry logs, PDF executive reports, and cloud-synced scaling presets.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sign-In Column */}
        <div className="lg:col-span-5 p-8 sm:p-12 flex flex-col justify-between gap-8 bg-white dark:bg-slate-900">
          <div className="my-auto">
            <div className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-2">
              Operator Authentication
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Access Your Cloud Workspace
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2.5 mb-7 leading-relaxed">
              Sign in with Google to launch your isolated cluster monitor, run Normal/Heavy/Peak traffic simulations, inspect the 3D rack topology, and export PDF audit reports.
            </p>

            {displayError && (
              <div
                role="alert"
                className="mb-5 px-4 py-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
              >
                {displayError}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.24 1.25-.96 2.31-2.04 3.02l3.3 2.56c1.92-1.77 3.04-4.38 3.04-7.48 0-.72-.06-1.41-.19-2.08H12z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.75 0 5.06-.91 6.75-2.47l-3.3-2.56c-.91.61-2.08.98-3.45.98-2.65 0-4.9-1.79-5.7-4.2H2.89v2.64C4.57 19.73 8.01 22 12 22z"
                />
                <path
                  fill="#4A90E2"
                  d="M6.3 13.75A5.99 5.99 0 0 1 5.98 12c0-.61.11-1.2.32-1.75V7.61H2.89A9.97 9.97 0 0 0 2 12c0 1.61.39 3.13 1.09 4.39l3.21-2.64z"
                />
                <path
                  fill="#FBBC05"
                  d="M12 6.05c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.05 3.01 14.74 2 12 2 8.01 2 4.57 4.27 2.89 7.61l3.41 2.64c.8-2.41 3.05-4.2 5.7-4.2z"
                />
              </svg>
              <span>{submitting ? 'Opening Google Sign-In...' : 'Continue with Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Educational Cloud Simulation</span>
            <span className="font-mono tabular-nums">₹10 / server / hr</span>
          </div>
        </div>
      </div>
    </div>
  );
}

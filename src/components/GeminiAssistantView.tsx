import React, {useEffect, useRef, useState} from 'react';
import {AlertCircle, ExternalLink, Globe, RotateCcw, Send, Trash2} from 'lucide-react';
import {MarkdownContent} from './MarkdownContent';
import type {
  ChatMessageItem,
  CostLog,
  GroundingInfo,
  PredictionLog,
  ProactiveForecastSummary,
  ResourceLog,
  ScalingConfig,
} from '../types';

interface GeminiAssistantViewProps {
  token: string;
  getFreshToken?: () => Promise<string | null>;
  latestResource?: ResourceLog;
  latestPrediction?: PredictionLog;
  latestCost?: CostLog;
  scalingConfig: ScalingConfig;
  proactiveForecast?: ProactiveForecastSummary;
}

type ModelChoice = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

const QUICK_PROMPTS = [
  'Analyze my current CPU utilization, 3-step forecast, and scaling decision.',
  'Compare my ₹10/hr simulated node cost with typical AWS EC2, GCP Compute Engine, and Azure VM pricing in Mumbai (asia-south1).',
  'What are best practices for predictive cloud auto-scaling and cooldown windows?',
  'Suggest optimal Scale-Up and Scale-Down thresholds for bursty traffic based on my current load.',
];

export function GeminiAssistantView({
  token,
  getFreshToken,
  latestResource,
  latestPrediction,
  latestCost,
  scalingConfig,
  proactiveForecast,
}: GeminiAssistantViewProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ModelChoice>('gemini-4-hydrogen');
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  async function resolveAuthToken(): Promise<string> {
    if (getFreshToken) {
      const fresh = await getFreshToken();
      if (fresh) return fresh;
    }
    return token;
  }

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const authToken = await resolveAuthToken();
        const res = await fetch('/api/chat/history', {
          headers: {Authorization: `Bearer ${authToken}`},
        });
        const data = await res.json();
        if (!res.ok) {
          if (active) setErrorMsg(data.error || 'Failed to load chat history.');
          return;
        }
        if (active && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        if (active) setErrorMsg('Unable to reach assistant history endpoint.');
      } finally {
        if (active) setLoadingHistory(false);
      }
    }
    void loadHistory();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages, streamingText, errorMsg]);

  function handleSelectModel(nextModel: ModelChoice) {
    setModel(nextModel);
    if (nextModel === 'gemini-3.1-flash-lite') {
      setUseSearchGrounding(false);
    }
  }

  function handleToggleSearchGrounding() {
    setUseSearchGrounding((prev) => {
      const next = !prev;
      if (next) {
        setModel('gemini-4-hydrogen');
      }
      return next;
    });
  }

  async function sendMessage(textToSend: string, overrideSearch?: boolean) {
    const trimmed = textToSend.trim();
    if (!trimmed || streaming) return;

    const searchEnabled = overrideSearch ?? useSearchGrounding;
    const effectiveModel: ModelChoice = searchEnabled ? 'gemini-4-hydrogen' : model;
    setErrorMsg(null);
    setErrorCode(null);
    setLastFailedPrompt(null);
    setInput('');

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'user' && last.content === trimmed) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `local_u_${Date.now()}`,
          role: 'user',
          model: effectiveModel,
          content: trimmed,
        },
      ];
    });
    setStreaming(true);
    setStreamingText('');

    try {
      const authToken = await resolveAuthToken();
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          message: trimmed,
          model: effectiveModel,
          useSearchGrounding: searchEnabled,
          sessionId: 'default',
        }),
      });

      if (!res.ok || !res.body) {
        const errPayload = await res.json().catch(() => ({}));
        setErrorMsg(errPayload.error || `Gemini assistant request failed (HTTP ${res.status}).`);
        setErrorCode(typeof errPayload.code === 'string' ? errPayload.code : null);
        setLastFailedPrompt(trimmed);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let currentEvent = 'message';
      let receivedTerminalEvent = false;

      const processLine = (rawLine: string) => {
        const line = rawLine.trimEnd();
        if (line === '') {
          currentEvent = 'message';
          return;
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          return;
        }
        if (line.startsWith('data:')) {
          const rawJson = line.slice(5).trim();
          if (!rawJson) return;
          try {
            const payload = JSON.parse(rawJson) as Record<string, unknown>;
            if (currentEvent === 'chunk' && typeof payload.text === 'string') {
              accumulated += payload.text;
              setStreamingText(accumulated);
            } else if (currentEvent === 'done') {
              receivedTerminalEvent = true;
              const finalContent =
                typeof payload.content === 'string' && payload.content.trim()
                  ? payload.content
                  : accumulated;
              const finalModel =
                typeof payload.model === 'string' ? payload.model : effectiveModel;
              const grounding: GroundingInfo | null =
                payload.grounding && typeof payload.grounding === 'object'
                  ? (payload.grounding as GroundingInfo)
                  : null;
              if (finalContent.trim()) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `local_m_${Date.now()}`,
                    role: 'model',
                    model: finalModel,
                    content: finalContent,
                    grounding,
                  },
                ]);
              } else {
                setErrorMsg('Gemini returned an empty response. Please retry.');
                setLastFailedPrompt(trimmed);
              }
              setStreamingText('');
            } else if (currentEvent === 'error') {
              receivedTerminalEvent = true;
              setErrorMsg(
                typeof payload.error === 'string'
                  ? payload.error
                  : 'Gemini API returned an error.',
              );
              setErrorCode(typeof payload.code === 'string' ? payload.code : null);
              setLastFailedPrompt(trimmed);
            }
          } catch {
            // Ignore malformed partial SSE frame
          }
        }
      };

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          processLine(rawLine);
        }
      }

      if (buffer.trim()) {
        for (const rawLine of buffer.split('\n')) {
          processLine(rawLine);
        }
      }

      if (!receivedTerminalEvent) {
        if (accumulated.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: `local_m_${Date.now()}`,
              role: 'model',
              model: effectiveModel,
              content: accumulated,
            },
          ]);
        } else {
          setErrorMsg('Assistant stream ended before returning a reply. Click Retry below.');
          setLastFailedPrompt(trimmed);
        }
      }
    } catch {
      setErrorMsg('Connection interrupted while streaming assistant response.');
      setLastFailedPrompt(trimmed);
    } finally {
      setStreaming(false);
      setStreamingText('');
    }
  }

  async function handleClearHistory() {
    if (streaming) return;
    setErrorMsg(null);
    setErrorCode(null);
    setLastFailedPrompt(null);
    try {
      const authToken = await resolveAuthToken();
      const res = await fetch('/api/chat/history', {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${authToken}`},
      });
      if (!res.ok) {
        setErrorMsg('Unable to clear conversation history.');
        return;
      }
      setMessages([]);
    } catch {
      setErrorMsg('Network error clearing conversation history.');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  const isSearchQuotaError =
    errorCode === 'SEARCH_QUOTA_EXCEEDED' ||
    (useSearchGrounding && Boolean(errorMsg?.includes('429')));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-11rem)] min-h-[540px]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
            Cloud Architect AI Assistant
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            Live context: CPU {(latestResource?.cpu_usage ?? 45).toFixed(1)}% · Predicted{' '}
            {(latestPrediction?.predicted_cpu ?? 46.8).toFixed(1)}% ·{' '}
            {latestResource?.server_count ?? 3} nodes · Daily cost ₹
            {(latestCost?.daily_cost ?? 720).toFixed(0)} · Trigger &gt;{scalingConfig.scaleUpHigh}%
            {proactiveForecast?.breachDetected
              ? ` · 3-Step Alert: +${proactiveForecast.firstBreachStep} (${proactiveForecast.peakProjectedCpu.toFixed(1)}%)`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleSearchGrounding}
            aria-pressed={useSearchGrounding}
            title="Enable Google Search Grounding with Gemini 4 Hydrogen (requires search quota / billing-enabled API key)"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              useSearchGrounding
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{useSearchGrounding ? 'Google Search: ON' : 'Google Search: OFF'}</span>
          </button>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => handleSelectModel('gemini-4-hydrogen')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                model === 'gemini-4-hydrogen'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Gemini 4 Hydrogen
            </button>
            <button
              type="button"
              onClick={() => handleSelectModel('gemini-3.1-flash-lite')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                model === 'gemini-3.1-flash-lite'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Flash Lite
            </button>
          </div>

          <button
            type="button"
            onClick={handleClearHistory}
            disabled={streaming || messages.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Thread</span>
          </button>
        </div>
      </div>

      {/* Scrollable Conversation Thread */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/50 dark:bg-slate-950/40">
        {loadingHistory ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Loading conversation history...
          </div>
        ) : messages.length === 0 && !streamingText ? (
          <div className="max-w-2xl mx-auto py-8 space-y-5">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Ask about your simulated cluster, scaling policy, or cloud benchmarks
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Every message carries your live telemetry, 3-step proactive CPU forecast, and
                thresholds. Toggle Google Search ON anytime if using a billing-enabled key for live
                web citations.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void sendMessage(q)}
                  className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-xs text-slate-700 dark:text-slate-300 leading-relaxed cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div
                    className={`text-[11px] font-mono mb-1 flex items-center gap-2 ${
                      msg.role === 'user'
                        ? 'text-blue-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <span>{msg.role === 'user' ? 'You' : msg.model}</span>
                    {msg.role === 'model' &&
                      msg.grounding &&
                      msg.grounding.sources.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <Globe className="w-3 h-3" />
                          <span>Grounded ({msg.grounding.sources.length} sources)</span>
                        </span>
                      )}
                  </div>

                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <MarkdownContent content={msg.content} />
                  )}

                  {msg.role === 'model' &&
                    msg.grounding &&
                    (msg.grounding.sources.length > 0 ||
                      msg.grounding.webSearchQueries.length > 0) && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        {msg.grounding.webSearchQueries.length > 0 && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            Searched: {msg.grounding.webSearchQueries.join(' · ')}
                          </div>
                        )}
                        {msg.grounding.sources.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {msg.grounding.sources.slice(0, 6).map((src) => (
                              <a
                                key={src.uri}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-blue-400 dark:hover:border-blue-600 text-xs text-slate-700 dark:text-slate-300 transition-colors min-w-0"
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
            ))}

            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                  <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mb-1">
                    {useSearchGrounding ? 'gemini-4-hydrogen · Google Search' : model} · Streaming
                  </div>
                  {streamingText ? (
                    <MarkdownContent content={streamingText} />
                  ) : (
                    <div className="text-slate-500 dark:text-slate-400">Thinking...</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
          >
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSearchQuotaError && lastFailedPrompt && (
                <button
                  type="button"
                  disabled={streaming}
                  onClick={() => {
                    setUseSearchGrounding(false);
                    void sendMessage(lastFailedPrompt, false);
                  }}
                  className="px-3 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 hover:bg-red-100/60 dark:hover:bg-red-950 text-red-800 dark:text-red-200 font-semibold whitespace-nowrap cursor-pointer"
                >
                  Retry Without Google Search
                </button>
              )}
              {lastFailedPrompt && !isSearchQuotaError && (
                <button
                  type="button"
                  disabled={streaming}
                  onClick={() => void sendMessage(lastFailedPrompt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 hover:bg-red-100/60 dark:hover:bg-red-950 text-red-800 dark:text-red-200 font-semibold whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          maxLength={4000}
          placeholder={
            useSearchGrounding
              ? 'Ask about current AWS/GCP/Azure pricing, CPU spikes, or scaling best practices...'
              : 'Ask about CPU spikes, 3-step forecast, scaling thresholds, or Linear Regression weights...'
          }
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>{streaming ? 'Streaming...' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
}

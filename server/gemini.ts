import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentResponse,
} from '@google/genai';
import type {
  CostHistoryRecord,
  PredictionRecord,
  ResourceLogRecord,
  ScalingConfigRecord,
  ScalingHistoryRecord,
} from './db.ts';
import type {ProactiveForecastSummary, TrainedLinearRegressionModel} from './ml.ts';

export type SupportedGeminiModel = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface GroundingInfo {
  webSearchQueries: string[];
  sources: GroundingSource[];
}

export interface ClusterChatContext {
  latestResource?: ResourceLogRecord;
  latestPrediction?: PredictionRecord;
  latestScaling?: ScalingHistoryRecord;
  latestCost?: CostHistoryRecord;
  scalingConfig: ScalingConfigRecord;
  modelInfo: TrainedLinearRegressionModel;
  proactiveForecast?: ProactiveForecastSummary;
}

export interface FormattedGeminiError {
  status: number;
  code: 'SEARCH_QUOTA_EXCEEDED' | 'QUOTA_EXCEEDED' | 'HIGH_DEMAND' | 'AUTH_ERROR' | 'UPSTREAM_ERROR';
  message: string;
}

const ALLOWED_MODELS = new Set<SupportedGeminiModel>([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);

export function resolveSupportedModel(requested?: unknown): SupportedGeminiModel {
  if (typeof requested === 'string' && ALLOWED_MODELS.has(requested as SupportedGeminiModel)) {
    return requested as SupportedGeminiModel;
  }
  return 'gemini-4-hydrogen';
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your API key in Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractApiStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = Number((error as {status?: unknown}).status);
    if (Number.isFinite(s) && s >= 400) return s;
  }
  if (error instanceof Error) {
    const match = /"code"\s*:\s*(\d{3})/.exec(error.message);
    if (match) return Number(match[1]);
  }
  return 502;
}

export function formatGeminiError(error: unknown, usedSearch = false): FormattedGeminiError {
  const status = extractApiStatus(error);
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');

  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      code: usedSearch ? 'SEARCH_QUOTA_EXCEEDED' : 'QUOTA_EXCEEDED',
      message: usedSearch
        ? 'Google Search grounding quota is exhausted on the current free-tier API key (HTTP 429). Select a billing-enabled API key in Settings > Secrets for live web search, or run standard AI analysis without web search.'
        : 'Gemini API quota exceeded on the current free-tier API key (HTTP 429). Select a billing-enabled API key in Settings > Secrets or retry later.',
    };
  }

  if (status === 503 || rawMessage.includes('UNAVAILABLE')) {
    return {
      status: 503,
      code: 'HIGH_DEMAND',
      message:
        'Gemini 4 Hydrogen is temporarily experiencing high demand (HTTP 503). Please retry in a few seconds or switch to Flash Lite.',
    };
  }

  if (status === 400 || status === 403 || rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
    return {
      status: status === 400 ? 400 : 403,
      code: 'AUTH_ERROR',
      message:
        'Gemini API rejected the request credentials. Please check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }

  let parsedMsg = rawMessage;
  try {
    const parsed = JSON.parse(rawMessage);
    if (parsed?.error?.message) {
      parsedMsg = String(parsed.error.message);
    }
  } catch {
    // Keep original message
  }

  return {
    status: status >= 400 && status < 600 ? status : 502,
    code: 'UPSTREAM_ERROR',
    message: parsedMsg || 'Failed to contact Gemini API.',
  };
}

async function withTransientRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = extractApiStatus(err);
      if (status !== 503 || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function isSafeHttpUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function mergeGroundingMetadata(
  target: {queries: Set<string>; sources: Map<string, string>},
  response: GenerateContentResponse,
) {
  const meta = response.candidates?.[0]?.groundingMetadata;
  if (!meta) return;

  if (Array.isArray(meta.webSearchQueries)) {
    for (const q of meta.webSearchQueries) {
      if (typeof q === 'string' && q.trim()) {
        target.queries.add(q.trim());
      }
    }
  }

  if (Array.isArray(meta.groundingChunks)) {
    for (const chunk of meta.groundingChunks) {
      const uri = chunk.web?.uri;
      if (isSafeHttpUrl(uri)) {
        const rawTitle = chunk.web?.title?.trim();
        let fallbackTitle = uri;
        try {
          fallbackTitle = new URL(uri).hostname;
        } catch {
          // keep raw uri fallback
        }
        if (!target.sources.has(uri)) {
          target.sources.set(uri, rawTitle || fallbackTitle);
        }
      }
    }
  }
}

function finalizeGrounding(acc: {queries: Set<string>; sources: Map<string, string>}): GroundingInfo {
  return {
    webSearchQueries: Array.from(acc.queries),
    sources: Array.from(acc.sources.entries()).map(([uri, title]) => ({uri, title})),
  };
}

function extractVisibleText(response: GenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const joined = parts
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text ?? '')
      .join('');
    if (joined) return joined;
  }
  try {
    return response.text ?? '';
  } catch {
    return '';
  }
}

function normalizeHistory(history: Array<{role: string; content: string}>): Content[] {
  const cleaned = history
    .filter((m) => (m.role === 'user' || m.role === 'model') && m.content.trim().length > 0)
    .slice(-20);

  const merged: Array<{role: 'user' | 'model'; text: string}> = [];
  for (const item of cleaned) {
    const role: 'user' | 'model' = item.role === 'user' ? 'user' : 'model';
    const text = item.content.trim();
    const prev = merged[merged.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n\n${text}`;
    } else {
      merged.push({role, text});
    }
  }

  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }
  while (merged.length > 0 && merged[merged.length - 1].role === 'user') {
    merged.pop();
  }

  return merged.map((m) => ({
    role: m.role,
    parts: [{text: m.text}],
  }));
}

function buildSystemInstruction(ctx: ClusterChatContext): string {
  const res = ctx.latestResource;
  const pred = ctx.latestPrediction;
  const scale = ctx.latestScaling;
  const cost = ctx.latestCost;
  const cfg = ctx.scalingConfig;
  const forecast = ctx.proactiveForecast;

  const forecastLine = forecast
    ? `- 3-Step Proactive Forecast: ${forecast.steps.map((s) => `${s.label}=${s.predictedCpu.toFixed(1)}%`).join(', ')} (${
        forecast.breachDetected
          ? `BREACH WARNING at Step +${forecast.firstBreachStep} > Scale-Up High ${forecast.scaleUpHigh}%, peak ${forecast.peakProjectedCpu.toFixed(1)}%`
          : `No breach > ${forecast.scaleUpHigh}% projected`
      })`
    : null;

  return [
    'You are the CloudScale ML Infrastructure Architect Assistant embedded inside an educational cloud resource monitoring and auto-scaling simulator.',
    'Keep explanations crisp, accurate, and grounded in the live cluster telemetry provided below. Use ₹ (INR) at ₹10/server/hour for simulator cost calculations.',
    'When Google Search grounding is enabled and the user asks about real-world cloud pricing, AWS/GCP/Azure instances, Kubernetes/cloud best practices, or current benchmarks, use live web search results so information is up to date and cite concrete numbers.',
    'Live Cluster State:',
    `- Traffic Mode: ${res?.traffic_mode ?? 'Normal'}`,
    `- CPU Usage: ${res ? res.cpu_usage.toFixed(1) : '45.0'}% | RAM Usage: ${res ? res.ram_usage.toFixed(1) : '52.0'}% | Storage: ${res ? res.storage_usage.toFixed(1) : '61.5'}%`,
    `- Active Servers: ${res?.server_count ?? 3} (Allowed bounds: ${cfg.minServers} to ${cfg.maxServers})`,
    `- Active Users: ${res?.users_count ?? 340} | Network Load: ${res ? res.network_load.toFixed(1) : '280.0'} Mbps`,
    `- Linear Regression Next-Interval Predicted CPU: ${pred ? pred.predicted_cpu.toFixed(1) : '46.8'}% (R² = ${ctx.modelInfo.r2Score.toFixed(4)}, MAE = ${ctx.modelInfo.mae.toFixed(2)}%)`,
    ...(forecastLine ? [forecastLine] : []),
    `- Latest Auto-Scaler Action: ${scale?.action ?? 'HOLD'} (${scale?.reason ?? 'Resource utilization is healthy.'})`,
    `- Active Thresholds: Aggressive Scale-Down <${cfg.scaleDownLow}% (-2), Moderate Scale-Down <${cfg.scaleDownModerate}% (-1), High Scale-Up >${cfg.scaleUpHigh}% (+2), Critical Scale-Up >${cfg.scaleUpCritical}% (+3)`,
    `- Cost Telemetry: Hourly ₹${cost?.hourly_cost ?? 30}/hr | Daily ₹${cost?.daily_cost ?? 720}/day | Static Peak Baseline ₹${cost?.cost_without_optimization ?? 2160}/day | Daily Saved ₹${cost?.cost_saved_daily ?? 1440}/day (${cost ? cost.savings_percent.toFixed(1) : '66.7'}%)`,
    'Provide clear, actionable engineering guidance and concise Markdown bullets or formulas when helpful.',
  ].join('\n');
}

export async function streamClusterAssistantReply(params: {
  model: SupportedGeminiModel;
  useSearchGrounding?: boolean;
  history: Array<{role: string; content: string}>;
  userMessage: string;
  context: ClusterChatContext;
  onChunk: (text: string) => void;
}): Promise<{text: string; grounding: GroundingInfo; effectiveModel: SupportedGeminiModel}> {
  const ai = getGenAIClient();
  const useSearch = params.useSearchGrounding === true && params.model === 'gemini-4-hydrogen';
  const primaryModel: SupportedGeminiModel = useSearch ? 'gemini-4-hydrogen' : params.model;
  const systemInstruction = buildSystemInstruction(params.context);

  const contents: Content[] = [
    ...normalizeHistory(params.history),
    {role: 'user', parts: [{text: params.userMessage}]},
  ];

  const attemptStream = async (
    targetModel: SupportedGeminiModel,
    searchEnabled: boolean,
  ): Promise<{text: string; grounding: GroundingInfo; effectiveModel: SupportedGeminiModel}> => {
    const thinkingConfig =
      targetModel === 'gemini-4-hydrogen'
        ? {thinkingLevel: ThinkingLevel.LOW}
        : {thinkingLevel: ThinkingLevel.MINIMAL};

    const config = {
      systemInstruction,
      ...(searchEnabled ? {tools: [{googleSearch: {}}]} : {thinkingConfig}),
    };

    let fullReply = '';
    const groundingAcc = {
      queries: new Set<string>(),
      sources: new Map<string, string>(),
    };
    let emitted = false;

    const stream = await ai.models.generateContentStream({
      model: targetModel,
      contents,
      config,
    });

    for await (const chunk of stream) {
      const c = chunk as GenerateContentResponse;
      mergeGroundingMetadata(groundingAcc, c);
      const delta = extractVisibleText(c);
      if (delta) {
        emitted = true;
        fullReply += delta;
        params.onChunk(delta);
      }
    }

    if (!fullReply.trim()) {
      const single = await ai.models.generateContent({
        model: targetModel,
        contents,
        config,
      });
      mergeGroundingMetadata(groundingAcc, single);
      const fallbackText = extractVisibleText(single).trim();
      if (fallbackText) {
        fullReply = fallbackText;
        if (!emitted) {
          params.onChunk(fallbackText);
        }
      }
    }

    return {
      text: fullReply,
      grounding: finalizeGrounding(groundingAcc),
      effectiveModel: targetModel,
    };
  };

  try {
    return await withTransientRetry(() => attemptStream(primaryModel, useSearch));
  } catch (err: unknown) {
    const status = extractApiStatus(err);
    // If standard (non-search) Gemini 4 Hydrogen is overloaded/throttled, fall back to Flash Lite
    if (!useSearch && primaryModel === 'gemini-4-hydrogen' && (status === 503 || status === 429)) {
      return await withTransientRetry(() => attemptStream('gemini-3.1-flash-lite', false));
    }
    throw err;
  }
}

export async function fetchLiveCloudBenchmark(
  context: ClusterChatContext,
  useSearch = true,
): Promise<{
  summary: string;
  grounding: GroundingInfo;
  grounded: boolean;
  model: SupportedGeminiModel;
  generatedAt: string;
}> {
  const ai = getGenAIClient();
  const res = context.latestResource;
  const pred = context.latestPrediction;
  const cost = context.latestCost;
  const activeServers = res?.server_count ?? 3;
  const hourlyInr = cost?.hourly_cost ?? activeServers * 10;
  const dailyInr = cost?.daily_cost ?? hourlyInr * 24;

  const prompt = useSearch
    ? [
        `Using current Google Search data for India / Mumbai (asia-south1 / ap-south-1) on-demand cloud compute pricing (AWS EC2 general-purpose e.g. t3.medium / m6i.large, Google Cloud Compute Engine e2-medium / e2-standard-2, and Azure B2ms / D2s v5):`,
        `1. Give a concise bulleted comparison of real-world hourly & daily cost for ${activeServers} compute nodes in INR (convert USD to INR at current exchange rate) versus our simulator's ₹10/node/hr (₹${hourlyInr}/hr, ₹${dailyInr}/day).`,
        `2. Briefly suggest 1 current cloud auto-scaling best practice relevant to our current ${res?.traffic_mode ?? 'Normal'} traffic mode (CPU ${(res?.cpu_usage ?? 45).toFixed(1)}%, Predicted ${(pred?.predicted_cpu ?? 46.8).toFixed(1)}%).`,
        `Keep the entire response crisp (under 180 words) with clear bullet points.`,
      ].join('\n')
    : [
        `Compare our simulated cluster (${activeServers} nodes at ₹10/node/hr = ₹${hourlyInr}/hr, ₹${dailyInr}/day, current ${res?.traffic_mode ?? 'Normal'} traffic mode, CPU ${(res?.cpu_usage ?? 45).toFixed(1)}%, Predicted ${(pred?.predicted_cpu ?? 46.8).toFixed(1)}%) against typical AWS EC2 (ap-south-1), Google Cloud Compute Engine (asia-south1), and Azure Mumbai general-purpose 2-vCPU VM cost tiers in INR.`,
        `Note clearly that this estimate uses model knowledge (live Google Search web lookup was skipped), and suggest 1 auto-scaling optimization for the current load. Keep under 170 words in crisp bullet points.`,
      ].join('\n');

  let usedModel: SupportedGeminiModel = 'gemini-4-hydrogen';
  let response: GenerateContentResponse;

  try {
    response = await withTransientRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: buildSystemInstruction(context),
          ...(useSearch ? {tools: [{googleSearch: {}}]} : {thinkingConfig: {thinkingLevel: ThinkingLevel.LOW}}),
        },
      }),
    );
  } catch (err: unknown) {
    // Only if standard (non-search) mode hits 503 high demand on hydrogen, fall back to flash-lite cleanly
    if (!useSearch && extractApiStatus(err) === 503) {
      usedModel = 'gemini-3.1-flash-lite';
      response = await ai.models.generateContent({
        model: usedModel,
        contents: prompt,
        config: {
          systemInstruction: buildSystemInstruction(context),
          thinkingConfig: {thinkingLevel: ThinkingLevel.MINIMAL},
        },
      });
    } else {
      throw err;
    }
  }

  const groundingAcc = {
    queries: new Set<string>(),
    sources: new Map<string, string>(),
  };
  mergeGroundingMetadata(groundingAcc, response);

  const summary = (response.text ?? '').trim();
  if (!summary) {
    throw new Error('Gemini returned an empty benchmark response. Please retry.');
  }

  return {
    summary,
    grounding: finalizeGrounding(groundingAcc),
    grounded: useSearch,
    model: usedModel,
    generatedAt: new Date().toISOString(),
  };
}

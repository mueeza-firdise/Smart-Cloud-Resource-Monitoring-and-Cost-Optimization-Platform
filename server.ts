import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import {formatTimestamp} from './server/db.ts';
import {
  fetchLiveCloudBenchmark,
  formatGeminiError,
  resolveSupportedModel,
  streamClusterAssistantReply,
} from './server/gemini.ts';
import {forecastNext3Steps, predictFutureCpu, trainLinearRegressionModel} from './server/ml.ts';
import {buildPdfReportBuffer} from './server/pdf.ts';
import {calculateCostMetrics, evaluateAutoScaling} from './server/scaler.ts';
import {
  appendChatMessages,
  clearChatHistory,
  getChatHistory,
  getUserDashboardHistory,
  getUserScalingConfig,
  logUserSimulationStep,
  resetUserDemoBaseline,
  updateUserScalingConfig,
} from './src/db/cloudRepo.ts';
import {requireAuth, type AuthRequest} from './src/middleware/auth.ts';

const PORT = Number(process.env.PORT || 3000);
const PROJECT_ROOT = path.resolve(process.cwd(), 'project');

function collectProjectFiles(dir: string, relBase = ''): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__' || entry.name === 'cloud.db') {
      continue;
    }
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectProjectFiles(fullPath, relPath));
    } else if (!entry.name.endsWith('.pkl') && !entry.name.endsWith('.db')) {
      results.push(relPath);
    }
  }
  return results.sort();
}

async function startServer() {
  const mlModel = trainLinearRegressionModel();

  const app = express();
  app.use(express.json({limit: '1mb'}));

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.json({user: req.dbUser});
  });

  app.get('/api/telemetry', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const [history, scalingConfig] = await Promise.all([
        getUserDashboardHistory(userId, 24),
        getUserScalingConfig(userId),
      ]);
      const proactiveForecast = forecastNext3Steps({
        recentLogs: history.resource_logs,
        latestPredictedCpu: history.predictions[history.predictions.length - 1]?.predicted_cpu,
        scaleUpHigh: scalingConfig.scaleUpHigh,
        scaleUpCritical: scalingConfig.scaleUpCritical,
      });
      res.json({history, model: mlModel, scalingConfig, proactiveForecast});
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load telemetry.';
      res.status(500).json({error: msg});
    }
  });

  app.get('/api/scaling-config', requireAuth, async (req: AuthRequest, res) => {
    try {
      const config = await getUserScalingConfig(req.dbUser!.id);
      res.json({scalingConfig: config});
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load scaling config.';
      res.status(500).json({error: msg});
    }
  });

  app.put('/api/scaling-config', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body ?? {};
      const scaleDownLow = Number(body.scaleDownLow);
      const scaleDownModerate = Number(body.scaleDownModerate);
      const scaleUpHigh = Number(body.scaleUpHigh);
      const scaleUpCritical = Number(body.scaleUpCritical);
      const minServers = Math.round(Number(body.minServers));
      const maxServers = Math.round(Number(body.maxServers));

      if (
        ![scaleDownLow, scaleDownModerate, scaleUpHigh, scaleUpCritical, minServers, maxServers].every(
          Number.isFinite,
        )
      ) {
        res.status(400).json({error: 'All threshold and server bound fields must be valid numbers.'});
        return;
      }

      if (scaleDownLow < 5 || scaleUpCritical > 99) {
        res.status(400).json({error: 'CPU thresholds must stay within 5% to 99%.'});
        return;
      }

      if (
        !(
          scaleDownLow < scaleDownModerate &&
          scaleDownModerate < scaleUpHigh &&
          scaleUpHigh < scaleUpCritical
        )
      ) {
        res.status(400).json({
          error:
            'Thresholds must follow strict order: Scale Down (-2) < Scale Down (-1) < Scale Up (+2) < Scale Up (+3).',
        });
        return;
      }

      if (minServers < 1 || maxServers > 50 || minServers >= maxServers) {
        res.status(400).json({
          error: 'Server bounds must satisfy 1 <= Min Servers < Max Servers <= 50.',
        });
        return;
      }

      const updated = await updateUserScalingConfig(req.dbUser!.id, {
        scaleDownLow: Number(scaleDownLow.toFixed(1)),
        scaleDownModerate: Number(scaleDownModerate.toFixed(1)),
        scaleUpHigh: Number(scaleUpHigh.toFixed(1)),
        scaleUpCritical: Number(scaleUpCritical.toFixed(1)),
        minServers,
        maxServers,
      });

      res.json({scalingConfig: updated});
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save scaling thresholds.';
      res.status(500).json({error: msg});
    }
  });

  app.post('/api/simulate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.dbUser!.id;
      const mode = String(req.body?.mode || 'normal').toLowerCase();

      if (mode === 'reset_demo') {
        await resetUserDemoBaseline(userId);
        const [refreshed, scalingConfig] = await Promise.all([
          getUserDashboardHistory(userId, 24),
          getUserScalingConfig(userId),
        ]);
        const proactiveForecast = forecastNext3Steps({
          recentLogs: refreshed.resource_logs,
          latestPredictedCpu: refreshed.predictions[refreshed.predictions.length - 1]?.predicted_cpu,
          scaleUpHigh: scalingConfig.scaleUpHigh,
          scaleUpCritical: scalingConfig.scaleUpCritical,
        });
        res.json({
          mode: 'Reset Demo Baseline',
          history: refreshed,
          proactiveForecast,
          recommendations: [
            'Demo baseline restored: CPU = 45.0%, Active Servers = 3. Ready for Peak Traffic trigger.',
          ],
        });
        return;
      }

      const [history, scalingConfig] = await Promise.all([
        getUserDashboardHistory(userId, 1),
        getUserScalingConfig(userId),
      ]);
      const latest = history.resource_logs[history.resource_logs.length - 1];
      const currentServers = latest ? latest.server_count : 3;
      const currentStorage = latest ? latest.storage_usage : 61.5;

      let cpu = 45;
      let ram = 52;
      let usersCount = 340;
      let network = 280;
      let label = 'Normal';
      let forceDemoScale = false;
      let forcedPredictedCpu: number | null = null;

      const rand = (min: number, max: number) =>
        Number((min + Math.random() * (max - min)).toFixed(2));

      if (mode === 'demo_peak') {
        cpu = 92.0;
        ram = 88.4;
        usersCount = 980;
        network = 865.0;
        label = 'Peak (Jury Demo)';
        forcedPredictedCpu = 96.0;
        forceDemoScale = true;
      } else if (mode === 'normal') {
        cpu = rand(20, 60);
        ram = rand(34, 62);
        usersCount = Math.round(180 + Math.random() * 280);
        network = Number((usersCount * 0.76 + rand(-15, 20)).toFixed(2));
        label = 'Normal';
      } else if (mode === 'heavy') {
        cpu = rand(60, 85);
        ram = rand(58, 82);
        usersCount = Math.round(480 + Math.random() * 290);
        network = Number((usersCount * 0.8 + rand(-10, 25)).toFixed(2));
        label = 'Heavy';
      } else if (mode === 'peak') {
        cpu = rand(85, 100);
        ram = rand(76, 95);
        usersCount = Math.round(840 + Math.random() * 340);
        network = Number((usersCount * 0.86 + rand(5, 30)).toFixed(2));
        label = 'Peak';
      } else {
        res.status(400).json({error: 'Invalid simulation mode.'});
        return;
      }

      const storage = Number(
        Math.min(95, Math.max(45, currentStorage + rand(-0.6, 1.1))).toFixed(2),
      );
      const pred = predictFutureCpu({
        cpuUsage: cpu,
        ramUsage: ram,
        serverCount: currentServers,
        networkLoad: network,
        usersCount,
      });

      const predictedCpu = forcedPredictedCpu ?? pred.predictedCpu;
      const scaling = evaluateAutoScaling({
        currentServers,
        predictedCpu,
        actualCpu: cpu,
        forceDemoScale,
        config: scalingConfig,
      });
      const cost = calculateCostMetrics(scaling.new_servers);
      const ts = formatTimestamp();

      await logUserSimulationStep(userId, {
        resource: {
          timestamp: ts,
          cpu_usage: cpu,
          ram_usage: ram,
          storage_usage: storage,
          server_count: scaling.new_servers,
          network_load: network,
          users_count: usersCount,
          traffic_mode: label,
        },
        prediction: {
          timestamp: ts,
          actual_cpu: cpu,
          predicted_cpu: predictedCpu,
          r2_score: pred.r2Score,
          mae: pred.mae,
        },
        scaling: {
          timestamp: ts,
          previous_servers: scaling.previous_servers,
          new_servers: scaling.new_servers,
          delta: scaling.delta,
          predicted_cpu: predictedCpu,
          action: scaling.action,
          reason: scaling.reason,
        },
        cost: {
          timestamp: ts,
          active_servers: cost.active_servers,
          hourly_cost: cost.hourly_cost,
          daily_cost: cost.daily_cost,
          monthly_cost: cost.monthly_cost,
          cost_without_optimization: cost.cost_without_optimization,
          cost_with_optimization: cost.cost_with_optimization,
          cost_saved_daily: cost.cost_saved_daily,
          savings_percent: cost.savings_percent,
        },
      });

      const updated = await getUserDashboardHistory(userId, 24);
      const proactiveForecast = forecastNext3Steps({
        recentLogs: updated.resource_logs,
        latestPredictedCpu: updated.predictions[updated.predictions.length - 1]?.predicted_cpu,
        scaleUpHigh: scalingConfig.scaleUpHigh,
        scaleUpCritical: scalingConfig.scaleUpCritical,
      });
      res.json({
        mode: label,
        recommendations: scaling.recommendations,
        history: updated,
        proactiveForecast,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Simulation execution failed.';
      res.status(500).json({error: msg});
    }
  });

  // Multi-Turn Gemini Cloud Architect Chat Routes
  app.get('/api/chat/history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : 'default';
      const rows = await getChatHistory(req.dbUser!.id, sessionId, 50);
      res.json({
        messages: rows.map((r) => {
          let grounding = null;
          if (r.groundingJson) {
            try {
              grounding = JSON.parse(r.groundingJson);
            } catch {
              grounding = null;
            }
          }
          return {
            id: r.id,
            role: r.role as 'user' | 'model',
            model: r.model,
            content: r.content,
            grounding,
            createdAt: r.createdAt.toISOString(),
          };
        }),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load chat history.';
      res.status(500).json({error: msg});
    }
  });

  app.delete('/api/chat/history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : 'default';
      await clearChatHistory(req.dbUser!.id, sessionId);
      res.json({cleared: true});
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to clear chat history.';
      res.status(500).json({error: msg});
    }
  });

  app.post('/api/chat/stream', requireAuth, async (req: AuthRequest, res) => {
    const userId = req.dbUser!.id;
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : 'default';
    const useSearchGrounding = req.body?.useSearchGrounding === true;
    const selectedModel = useSearchGrounding
      ? 'gemini-4-hydrogen'
      : resolveSupportedModel(req.body?.model);

    if (!rawMessage || rawMessage.length > 4000) {
      res.status(400).json({error: 'Message must be between 1 and 4000 characters.'});
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, payload: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const [pastMessages, history, scalingConfig] = await Promise.all([
        getChatHistory(userId, sessionId, 24),
        getUserDashboardHistory(userId, 5),
        getUserScalingConfig(userId),
      ]);

      const latestPrediction = history.predictions[history.predictions.length - 1];
      const proactiveForecast = forecastNext3Steps({
        recentLogs: history.resource_logs,
        latestPredictedCpu: latestPrediction?.predicted_cpu,
        scaleUpHigh: scalingConfig.scaleUpHigh,
        scaleUpCritical: scalingConfig.scaleUpCritical,
      });

      const context = {
        latestResource: history.resource_logs[history.resource_logs.length - 1],
        latestPrediction,
        latestScaling: history.scaling_history[history.scaling_history.length - 1],
        latestCost: history.cost_history[history.cost_history.length - 1],
        scalingConfig,
        modelInfo: mlModel,
        proactiveForecast,
      };

      const reply = await streamClusterAssistantReply({
        model: selectedModel,
        useSearchGrounding,
        history: pastMessages.map((m) => ({role: m.role, content: m.content})),
        userMessage: rawMessage,
        context,
        onChunk: (delta) => sendEvent('chunk', {text: delta}),
      });

      const finalText = reply.text.trim();
      if (!finalText) {
        sendEvent('error', {
          error: 'Gemini returned an empty response. Please retry or switch models.',
          code: 'UPSTREAM_ERROR',
        });
        res.end();
        return;
      }

      const hasGrounding =
        reply.grounding.sources.length > 0 || reply.grounding.webSearchQueries.length > 0;
      const groundingPayload = hasGrounding ? reply.grounding : null;

      await appendChatMessages(userId, sessionId, [
        {role: 'user', model: reply.effectiveModel, content: rawMessage},
        {
          role: 'model',
          model: reply.effectiveModel,
          content: finalText,
          groundingJson: groundingPayload ? JSON.stringify(groundingPayload) : null,
        },
      ]);

      sendEvent('done', {
        model: reply.effectiveModel,
        content: finalText,
        grounding: groundingPayload,
      });
      res.end();
    } catch (error: unknown) {
      console.error('Gemini chat stream failed:', error);
      const formatted = formatGeminiError(error, useSearchGrounding);
      sendEvent('error', {error: formatted.message, code: formatted.code});
      res.end();
    }
  });

  app.post('/api/grounding/benchmark', requireAuth, async (req: AuthRequest, res) => {
    const useSearch = req.body?.mode !== 'standard';
    try {
      const userId = req.dbUser!.id;
      const [history, scalingConfig] = await Promise.all([
        getUserDashboardHistory(userId, 1),
        getUserScalingConfig(userId),
      ]);

      const benchmark = await fetchLiveCloudBenchmark(
        {
          latestResource: history.resource_logs[history.resource_logs.length - 1],
          latestPrediction: history.predictions[history.predictions.length - 1],
          latestScaling: history.scaling_history[history.scaling_history.length - 1],
          latestCost: history.cost_history[history.cost_history.length - 1],
          scalingConfig,
          modelInfo: mlModel,
        },
        useSearch,
      );

      res.json(benchmark);
    } catch (error: unknown) {
      console.error('Cloud benchmark search grounding failed:', error);
      const formatted = formatGeminiError(error, useSearch);
      res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
        canRunStandard: useSearch && formatted.code === 'SEARCH_QUOTA_EXCEEDED',
      });
    }
  });

  // Downloadable PDF report
  app.get('/api/report/pdf', requireAuth, async (req: AuthRequest, res) => {
    try {
      const history = await getUserDashboardHistory(req.dbUser!.id, 24);
      const resource = history.resource_logs[history.resource_logs.length - 1];
      const prediction = history.predictions[history.predictions.length - 1];
      const scaling = history.scaling_history[history.scaling_history.length - 1];
      const cost = history.cost_history[history.cost_history.length - 1];

      const pdfBuffer = await buildPdfReportBuffer({
        resource,
        prediction,
        scaling,
        cost,
        scalingHistory: history.scaling_history,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cloud_scaling_report_${Date.now()}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({error: 'Failed to generate PDF report.'});
    }
  });

  // Read-only Flask project blueprint file browser (strictly confined to project/)
  app.get('/api/project-files', requireAuth, (_req, res) => {
    const files = collectProjectFiles(PROJECT_ROOT);
    res.json({files});
  });

  app.get('/api/project-file', requireAuth, (req, res) => {
    const relPath = String(req.query.path || '');
    if (!relPath) {
      res.status(400).json({error: 'Missing file path.'});
      return;
    }
    const resolved = path.resolve(PROJECT_ROOT, relPath);
    if (!resolved.startsWith(PROJECT_ROOT + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({error: 'File not found.'});
      return;
    }
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      res.status(400).json({error: 'Not a file.'});
      return;
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');
    const truncated = relPath.endsWith('.csv') && lines.length > 60;
    res.json({
      path: relPath,
      totalLines: lines.length,
      truncated,
      content: truncated ? lines.slice(0, 60).join('\n') : content,
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CloudScale ML server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

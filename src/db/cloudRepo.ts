import {and, desc, eq} from 'drizzle-orm';
import {db} from './index.ts';
import {
  chatMessages,
  costHistory,
  predictions,
  resourceLogs,
  scalingConfig,
  scalingHistory,
} from './schema.ts';
import type {
  CostHistoryRecord,
  PredictionRecord,
  ResourceLogRecord,
  ScalingConfigRecord,
  ScalingHistoryRecord,
} from '../../server/db.ts';
import {formatTimestamp} from '../../server/db.ts';

const DEFAULT_CONFIG: Omit<ScalingConfigRecord, 'updatedAt'> = {
  scaleDownLow: 20,
  scaleDownModerate: 30,
  scaleUpHigh: 80,
  scaleUpCritical: 90,
  minServers: 2,
  maxServers: 20,
};

async function insertBaselineSeeds(userId: number) {
  const now = new Date();
  const seedPoints = [
    {offsetMin: -25, cpu: 36.4, ram: 45.2, storage: 60.8, servers: 3, net: 215.0, users: 265, mode: 'Normal', pred: 38.1, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -20, cpu: 39.8, ram: 48.0, storage: 61.0, servers: 3, net: 242.0, users: 298, mode: 'Normal', pred: 41.6, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -15, cpu: 43.2, ram: 50.1, storage: 61.2, servers: 3, net: 265.0, users: 322, mode: 'Normal', pred: 44.8, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -10, cpu: 41.5, ram: 49.4, storage: 61.3, servers: 3, net: 254.0, users: 310, mode: 'Normal', pred: 43.0, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -5, cpu: 45.0, ram: 52.0, storage: 61.5, servers: 3, net: 280.0, users: 340, mode: 'Normal', pred: 46.8, action: 'HOLD', reason: 'Resource utilization is healthy.'},
  ];

  for (const pt of seedPoints) {
    const ts = formatTimestamp(new Date(now.getTime() + pt.offsetMin * 60_000));
    const hourly = pt.servers * 10;
    const daily = hourly * 24;
    const monthly = daily * 30;
    const staticDaily = 9 * 10 * 24;
    const saved = staticDaily - daily;
    const pct = Number(((saved / staticDaily) * 100).toFixed(2));

    await db.insert(resourceLogs).values({
      userId,
      timestamp: ts,
      cpuUsage: pt.cpu,
      ramUsage: pt.ram,
      storageUsage: pt.storage,
      serverCount: pt.servers,
      networkLoad: pt.net,
      usersCount: pt.users,
      trafficMode: pt.mode,
    });

    await db.insert(predictions).values({
      userId,
      timestamp: ts,
      actualCpu: pt.cpu,
      predictedCpu: pt.pred,
      r2Score: 0.9312,
      mae: 2.74,
    });

    await db.insert(costHistory).values({
      userId,
      timestamp: ts,
      activeServers: pt.servers,
      hourlyCost: hourly,
      dailyCost: daily,
      monthlyCost: monthly,
      costWithoutOptimization: staticDaily,
      costWithOptimization: daily,
      costSavedDaily: saved,
      savingsPercent: pct,
    });

    await db.insert(scalingHistory).values({
      userId,
      timestamp: ts,
      previousServers: pt.servers,
      newServers: pt.servers,
      delta: 0,
      predictedCpu: pt.pred,
      action: pt.action,
      reason: pt.reason,
    });
  }
}

export async function ensureUserWorkspaceSeeded(userId: number): Promise<void> {
  try {
    await db
      .insert(scalingConfig)
      .values({
        userId,
        ...DEFAULT_CONFIG,
        updatedAt: formatTimestamp(),
      })
      .onConflictDoNothing({target: scalingConfig.userId});

    const existingLogs = await db
      .select({id: resourceLogs.id})
      .from(resourceLogs)
      .where(eq(resourceLogs.userId, userId))
      .limit(1);

    if (existingLogs.length === 0) {
      await insertBaselineSeeds(userId);
    }
  } catch (error) {
    console.error('Failed to seed user workspace:', error);
    throw new Error('Failed to initialize workspace telemetry.', {cause: error});
  }
}

export async function getUserDashboardHistory(userId: number, limit = 24): Promise<{
  resource_logs: ResourceLogRecord[];
  predictions: PredictionRecord[];
  cost_history: CostHistoryRecord[];
  scaling_history: ScalingHistoryRecord[];
}> {
  try {
    await ensureUserWorkspaceSeeded(userId);
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

    const [resRows, predRows, costRows, scaleRows] = await Promise.all([
      db
        .select()
        .from(resourceLogs)
        .where(eq(resourceLogs.userId, userId))
        .orderBy(desc(resourceLogs.id))
        .limit(safeLimit),
      db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, userId))
        .orderBy(desc(predictions.id))
        .limit(safeLimit),
      db
        .select()
        .from(costHistory)
        .where(eq(costHistory.userId, userId))
        .orderBy(desc(costHistory.id))
        .limit(safeLimit),
      db
        .select()
        .from(scalingHistory)
        .where(eq(scalingHistory.userId, userId))
        .orderBy(desc(scalingHistory.id))
        .limit(safeLimit),
    ]);

    return {
      resource_logs: resRows.reverse().map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        cpu_usage: r.cpuUsage,
        ram_usage: r.ramUsage,
        storage_usage: r.storageUsage,
        server_count: r.serverCount,
        network_load: r.networkLoad,
        users_count: r.usersCount,
        traffic_mode: r.trafficMode,
      })),
      predictions: predRows.reverse().map((p) => ({
        id: p.id,
        timestamp: p.timestamp,
        actual_cpu: p.actualCpu,
        predicted_cpu: p.predictedCpu,
        r2_score: p.r2Score,
        mae: p.mae,
      })),
      cost_history: costRows.reverse().map((c) => ({
        id: c.id,
        timestamp: c.timestamp,
        active_servers: c.activeServers,
        hourly_cost: c.hourlyCost,
        daily_cost: c.dailyCost,
        monthly_cost: c.monthlyCost,
        cost_without_optimization: c.costWithoutOptimization,
        cost_with_optimization: c.costWithOptimization,
        cost_saved_daily: c.costSavedDaily,
        savings_percent: c.savingsPercent,
      })),
      scaling_history: scaleRows.reverse().map((s) => ({
        id: s.id,
        timestamp: s.timestamp,
        previous_servers: s.previousServers,
        new_servers: s.newServers,
        delta: s.delta,
        predicted_cpu: s.predictedCpu,
        action: s.action,
        reason: s.reason,
      })),
    };
  } catch (error) {
    console.error('Failed to fetch dashboard history:', error);
    throw new Error('Failed to load cluster telemetry history.', {cause: error});
  }
}

export async function logUserSimulationStep(
  userId: number,
  params: {
    resource: Omit<ResourceLogRecord, 'id'>;
    prediction: Omit<PredictionRecord, 'id'>;
    scaling: Omit<ScalingHistoryRecord, 'id'>;
    cost: Omit<CostHistoryRecord, 'id'>;
  },
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(resourceLogs).values({
        userId,
        timestamp: params.resource.timestamp,
        cpuUsage: params.resource.cpu_usage,
        ramUsage: params.resource.ram_usage,
        storageUsage: params.resource.storage_usage,
        serverCount: params.resource.server_count,
        networkLoad: params.resource.network_load,
        usersCount: params.resource.users_count,
        trafficMode: params.resource.traffic_mode,
      });

      await tx.insert(predictions).values({
        userId,
        timestamp: params.prediction.timestamp,
        actualCpu: params.prediction.actual_cpu,
        predictedCpu: params.prediction.predicted_cpu,
        r2Score: params.prediction.r2_score,
        mae: params.prediction.mae,
      });

      await tx.insert(scalingHistory).values({
        userId,
        timestamp: params.scaling.timestamp,
        previousServers: params.scaling.previous_servers,
        newServers: params.scaling.new_servers,
        delta: params.scaling.delta,
        predictedCpu: params.scaling.predicted_cpu,
        action: params.scaling.action,
        reason: params.scaling.reason,
      });

      await tx.insert(costHistory).values({
        userId,
        timestamp: params.cost.timestamp,
        activeServers: params.cost.active_servers,
        hourlyCost: params.cost.hourly_cost,
        dailyCost: params.cost.daily_cost,
        monthlyCost: params.cost.monthly_cost,
        costWithoutOptimization: params.cost.cost_without_optimization,
        costWithOptimization: params.cost.cost_with_optimization,
        costSavedDaily: params.cost.cost_saved_daily,
        savingsPercent: params.cost.savings_percent,
      });
    });
  } catch (error) {
    console.error('Failed to record simulation step:', error);
    throw new Error('Failed to save simulation snapshot.', {cause: error});
  }
}

export async function resetUserDemoBaseline(userId: number): Promise<void> {
  try {
    await db.delete(resourceLogs).where(eq(resourceLogs.userId, userId));
    await db.delete(predictions).where(eq(predictions.userId, userId));
    await db.delete(costHistory).where(eq(costHistory.userId, userId));
    await db.delete(scalingHistory).where(eq(scalingHistory.userId, userId));
    await insertBaselineSeeds(userId);
  } catch (error) {
    console.error('Failed to reset demo baseline:', error);
    throw new Error('Failed to reset baseline cluster metrics.', {cause: error});
  }
}

export async function getUserScalingConfig(userId: number): Promise<ScalingConfigRecord> {
  try {
    await ensureUserWorkspaceSeeded(userId);
    const rows = await db
      .select()
      .from(scalingConfig)
      .where(eq(scalingConfig.userId, userId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return {...DEFAULT_CONFIG, updatedAt: formatTimestamp()};
    }

    return {
      scaleDownLow: row.scaleDownLow,
      scaleDownModerate: row.scaleDownModerate,
      scaleUpHigh: row.scaleUpHigh,
      scaleUpCritical: row.scaleUpCritical,
      minServers: row.minServers,
      maxServers: row.maxServers,
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    console.error('Failed to load scaling config:', error);
    throw new Error('Failed to retrieve scaling thresholds.', {cause: error});
  }
}

export async function updateUserScalingConfig(
  userId: number,
  cfg: Omit<ScalingConfigRecord, 'updatedAt'>,
): Promise<ScalingConfigRecord> {
  try {
    const updatedAt = formatTimestamp();
    await db
      .insert(scalingConfig)
      .values({
        userId,
        ...cfg,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: scalingConfig.userId,
        set: {
          scaleDownLow: cfg.scaleDownLow,
          scaleDownModerate: cfg.scaleDownModerate,
          scaleUpHigh: cfg.scaleUpHigh,
          scaleUpCritical: cfg.scaleUpCritical,
          minServers: cfg.minServers,
          maxServers: cfg.maxServers,
          updatedAt,
        },
      });
    return {...cfg, updatedAt};
  } catch (error) {
    console.error('Failed to update scaling config:', error);
    throw new Error('Failed to persist scaling thresholds.', {cause: error});
  }
}

export async function getChatHistory(userId: number, sessionId = 'default', limit = 40) {
  try {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)))
      .orderBy(desc(chatMessages.id))
      .limit(limit);
    return rows.reverse();
  } catch (error) {
    console.error('Failed to load chat history:', error);
    throw new Error('Failed to load assistant conversation history.', {cause: error});
  }
}

export async function appendChatMessages(
  userId: number,
  sessionId: string,
  messages: Array<{
    role: 'user' | 'model';
    model: string;
    content: string;
    groundingJson?: string | null;
  }>,
) {
  try {
    if (messages.length === 0) return;
    await db.insert(chatMessages).values(
      messages.map((m) => ({
        userId,
        sessionId,
        role: m.role,
        model: m.model,
        content: m.content,
        groundingJson: m.groundingJson ?? null,
      })),
    );
  } catch (error) {
    console.error('Failed to persist chat messages:', error);
    throw new Error('Failed to store chat message.', {cause: error});
  }
}

export async function clearChatHistory(userId: number, sessionId = 'default') {
  try {
    await db
      .delete(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)));
  } catch (error) {
    console.error('Failed to clear chat history:', error);
    throw new Error('Failed to clear chat history.', {cause: error});
  }
}

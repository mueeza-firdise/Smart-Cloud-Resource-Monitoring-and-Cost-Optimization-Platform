import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

const PROJECT_DIR = path.resolve(process.cwd(), 'project');
const DB_DIR = path.join(PROJECT_DIR, 'database');
export const DB_PATH = path.join(DB_DIR, 'cloud.db');

export interface AdminRecord {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export interface ResourceLogRecord {
  id: number;
  timestamp: string;
  cpu_usage: number;
  ram_usage: number;
  storage_usage: number;
  server_count: number;
  network_load: number;
  users_count: number;
  traffic_mode: string;
}

export interface PredictionRecord {
  id: number;
  timestamp: string;
  actual_cpu: number;
  predicted_cpu: number;
  r2_score: number;
  mae: number;
}

export interface CostHistoryRecord {
  id: number;
  timestamp: string;
  active_servers: number;
  hourly_cost: number;
  daily_cost: number;
  monthly_cost: number;
  cost_without_optimization: number;
  cost_with_optimization: number;
  cost_saved_daily: number;
  savings_percent: number;
}

export interface ScalingHistoryRecord {
  id: number;
  timestamp: string;
  previous_servers: number;
  new_servers: number;
  delta: number;
  predicted_cpu: number;
  action: string;
  reason: string;
}

export interface ScalingConfigRecord {
  scaleDownLow: number;
  scaleDownModerate: number;
  scaleUpHigh: number;
  scaleUpCritical: number;
  minServers: number;
  maxServers: number;
  updatedAt: string;
}

let dbInstance: DatabaseSync | null = null;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hexHash] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hexHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DB_DIR, {recursive: true});
  const db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Cloud Administrator',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resource_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      cpu_usage REAL NOT NULL,
      ram_usage REAL NOT NULL,
      storage_usage REAL NOT NULL,
      server_count INTEGER NOT NULL,
      network_load REAL NOT NULL,
      users_count INTEGER NOT NULL,
      traffic_mode TEXT NOT NULL DEFAULT 'Normal'
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      actual_cpu REAL NOT NULL,
      predicted_cpu REAL NOT NULL,
      r2_score REAL NOT NULL,
      mae REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cost_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      active_servers INTEGER NOT NULL,
      hourly_cost REAL NOT NULL,
      daily_cost REAL NOT NULL,
      monthly_cost REAL NOT NULL,
      cost_without_optimization REAL NOT NULL,
      cost_with_optimization REAL NOT NULL,
      cost_saved_daily REAL NOT NULL,
      savings_percent REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scaling_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      previous_servers INTEGER NOT NULL,
      new_servers INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      predicted_cpu REAL NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scaling_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      scale_down_low REAL NOT NULL DEFAULT 20,
      scale_down_moderate REAL NOT NULL DEFAULT 30,
      scale_up_high REAL NOT NULL DEFAULT 80,
      scale_up_critical REAL NOT NULL DEFAULT 90,
      min_servers INTEGER NOT NULL DEFAULT 2,
      max_servers INTEGER NOT NULL DEFAULT 20,
      updated_at TEXT NOT NULL
    );
  `);

  const existingConfig = db
    .prepare('SELECT id FROM scaling_config WHERE id = 1')
    .get() as {id: number} | undefined;

  if (!existingConfig) {
    db.prepare(
      `INSERT INTO scaling_config
      (id, scale_down_low, scale_down_moderate, scale_up_high, scale_up_critical, min_servers, max_servers, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(20, 30, 80, 90, 2, 20, formatTimestamp());
  }

  const existingAdmin = db
    .prepare('SELECT id FROM admins WHERE username = ?')
    .get('admin') as {id: number} | undefined;

  if (!existingAdmin) {
    const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    db.prepare(
      'INSERT INTO admins (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
    ).run('admin', hashPassword(defaultPass), 'Cloud Administrator', formatTimestamp());
  }

  const logCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM resource_logs')
    .get() as {count: number};

  if (logCountRow.count === 0) {
    seedBaselineState(db);
  }

  dbInstance = db;
  return db;
}

export function seedBaselineState(db: DatabaseSync = getDb()): void {
  const now = new Date();
  const seedPoints = [
    {offsetMin: -25, cpu: 36.4, ram: 45.2, storage: 60.8, servers: 3, net: 215.0, users: 265, mode: 'Normal', pred: 38.1, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -20, cpu: 39.8, ram: 48.0, storage: 61.0, servers: 3, net: 242.0, users: 298, mode: 'Normal', pred: 41.6, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -15, cpu: 43.2, ram: 50.1, storage: 61.2, servers: 3, net: 265.0, users: 322, mode: 'Normal', pred: 44.8, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -10, cpu: 41.5, ram: 49.4, storage: 61.3, servers: 3, net: 254.0, users: 310, mode: 'Normal', pred: 43.0, action: 'HOLD', reason: 'Resource utilization is healthy.'},
    {offsetMin: -5, cpu: 45.0, ram: 52.0, storage: 61.5, servers: 3, net: 280.0, users: 340, mode: 'Normal', pred: 46.8, action: 'HOLD', reason: 'Resource utilization is healthy.'},
  ];

  const insertResource = db.prepare(`
    INSERT INTO resource_logs
    (timestamp, cpu_usage, ram_usage, storage_usage, server_count, network_load, users_count, traffic_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPred = db.prepare(`
    INSERT INTO predictions (timestamp, actual_cpu, predicted_cpu, r2_score, mae)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertCost = db.prepare(`
    INSERT INTO cost_history
    (timestamp, active_servers, hourly_cost, daily_cost, monthly_cost,
     cost_without_optimization, cost_with_optimization, cost_saved_daily, savings_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertScaling = db.prepare(`
    INSERT INTO scaling_history
    (timestamp, previous_servers, new_servers, delta, predicted_cpu, action, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const pt of seedPoints) {
    const ts = formatTimestamp(new Date(now.getTime() + pt.offsetMin * 60_000));
    const hourly = pt.servers * 10;
    const daily = hourly * 24;
    const monthly = daily * 30;
    const staticDaily = 9 * 10 * 24;
    const saved = staticDaily - daily;
    const pct = Number(((saved / staticDaily) * 100).toFixed(2));

    insertResource.run(ts, pt.cpu, pt.ram, pt.storage, pt.servers, pt.net, pt.users, pt.mode);
    insertPred.run(ts, pt.cpu, pt.pred, 0.9312, 2.74);
    insertCost.run(ts, pt.servers, hourly, daily, monthly, staticDaily, daily, saved, pct);
    insertScaling.run(ts, pt.servers, pt.servers, 0, pt.pred, pt.action, pt.reason);
  }
}

export function resetDemoBaseline(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM resource_logs;
    DELETE FROM predictions;
    DELETE FROM cost_history;
    DELETE FROM scaling_history;
  `);
  seedBaselineState(db);
}

export function authenticateAdmin(username: string, password: string): {username: string; role: string} | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, username, password_hash, role FROM admins WHERE username = ?')
    .get(username) as AdminRecord | undefined;

  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return {username: row.username, role: row.role};
}

export function logSimulationStep(params: {
  resource: Omit<ResourceLogRecord, 'id'>;
  prediction: Omit<PredictionRecord, 'id'>;
  scaling: Omit<ScalingHistoryRecord, 'id'>;
  cost: Omit<CostHistoryRecord, 'id'>;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO resource_logs
    (timestamp, cpu_usage, ram_usage, storage_usage, server_count, network_load, users_count, traffic_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.resource.timestamp,
    params.resource.cpu_usage,
    params.resource.ram_usage,
    params.resource.storage_usage,
    params.resource.server_count,
    params.resource.network_load,
    params.resource.users_count,
    params.resource.traffic_mode,
  );

  db.prepare(`
    INSERT INTO predictions (timestamp, actual_cpu, predicted_cpu, r2_score, mae)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.prediction.timestamp,
    params.prediction.actual_cpu,
    params.prediction.predicted_cpu,
    params.prediction.r2_score,
    params.prediction.mae,
  );

  db.prepare(`
    INSERT INTO scaling_history
    (timestamp, previous_servers, new_servers, delta, predicted_cpu, action, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.scaling.timestamp,
    params.scaling.previous_servers,
    params.scaling.new_servers,
    params.scaling.delta,
    params.scaling.predicted_cpu,
    params.scaling.action,
    params.scaling.reason,
  );

  db.prepare(`
    INSERT INTO cost_history
    (timestamp, active_servers, hourly_cost, daily_cost, monthly_cost,
     cost_without_optimization, cost_with_optimization, cost_saved_daily, savings_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.cost.timestamp,
    params.cost.active_servers,
    params.cost.hourly_cost,
    params.cost.daily_cost,
    params.cost.monthly_cost,
    params.cost.cost_without_optimization,
    params.cost.cost_with_optimization,
    params.cost.cost_saved_daily,
    params.cost.savings_percent,
  );
}

export function getDashboardHistory(limit = 24) {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  const resource_logs = (
    db.prepare('SELECT * FROM resource_logs ORDER BY id DESC LIMIT ?').all(safeLimit) as unknown as ResourceLogRecord[]
  ).reverse();

  const predictions = (
    db.prepare('SELECT * FROM predictions ORDER BY id DESC LIMIT ?').all(safeLimit) as unknown as PredictionRecord[]
  ).reverse();

  const cost_history = (
    db.prepare('SELECT * FROM cost_history ORDER BY id DESC LIMIT ?').all(safeLimit) as unknown as CostHistoryRecord[]
  ).reverse();

  const scaling_history = (
    db.prepare('SELECT * FROM scaling_history ORDER BY id DESC LIMIT ?').all(safeLimit) as unknown as ScalingHistoryRecord[]
  ).reverse();

  return {
    resource_logs,
    predictions,
    cost_history,
    scaling_history,
  };
}

export function getScalingConfig(): ScalingConfigRecord {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT scale_down_low, scale_down_moderate, scale_up_high, scale_up_critical, min_servers, max_servers, updated_at
       FROM scaling_config WHERE id = 1`,
    )
    .get() as
    | {
        scale_down_low: number;
        scale_down_moderate: number;
        scale_up_high: number;
        scale_up_critical: number;
        min_servers: number;
        max_servers: number;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return {
      scaleDownLow: 20,
      scaleDownModerate: 30,
      scaleUpHigh: 80,
      scaleUpCritical: 90,
      minServers: 2,
      maxServers: 20,
      updatedAt: formatTimestamp(),
    };
  }

  return {
    scaleDownLow: row.scale_down_low,
    scaleDownModerate: row.scale_down_moderate,
    scaleUpHigh: row.scale_up_high,
    scaleUpCritical: row.scale_up_critical,
    minServers: row.min_servers,
    maxServers: row.max_servers,
    updatedAt: row.updated_at,
  };
}

export function updateScalingConfig(
  cfg: Omit<ScalingConfigRecord, 'updatedAt'>,
): ScalingConfigRecord {
  const db = getDb();
  const updatedAt = formatTimestamp();
  db.prepare(
    `UPDATE scaling_config
     SET scale_down_low = ?, scale_down_moderate = ?, scale_up_high = ?, scale_up_critical = ?,
         min_servers = ?, max_servers = ?, updated_at = ?
     WHERE id = 1`,
  ).run(
    cfg.scaleDownLow,
    cfg.scaleDownModerate,
    cfg.scaleUpHigh,
    cfg.scaleUpCritical,
    cfg.minServers,
    cfg.maxServers,
    updatedAt,
  );
  return {...cfg, updatedAt};
}

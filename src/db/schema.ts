import {relations} from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Cloud Operator'),
  role: text('role').notNull().default('Cloud Architect'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const resourceLogs = pgTable('resource_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  timestamp: text('timestamp').notNull(),
  cpuUsage: doublePrecision('cpu_usage').notNull(),
  ramUsage: doublePrecision('ram_usage').notNull(),
  storageUsage: doublePrecision('storage_usage').notNull(),
  serverCount: integer('server_count').notNull(),
  networkLoad: doublePrecision('network_load').notNull(),
  usersCount: integer('users_count').notNull(),
  trafficMode: text('traffic_mode').notNull().default('Normal'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const predictions = pgTable('predictions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  timestamp: text('timestamp').notNull(),
  actualCpu: doublePrecision('actual_cpu').notNull(),
  predictedCpu: doublePrecision('predicted_cpu').notNull(),
  r2Score: doublePrecision('r2_score').notNull(),
  mae: doublePrecision('mae').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const costHistory = pgTable('cost_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  timestamp: text('timestamp').notNull(),
  activeServers: integer('active_servers').notNull(),
  hourlyCost: doublePrecision('hourly_cost').notNull(),
  dailyCost: doublePrecision('daily_cost').notNull(),
  monthlyCost: doublePrecision('monthly_cost').notNull(),
  costWithoutOptimization: doublePrecision('cost_without_optimization').notNull(),
  costWithOptimization: doublePrecision('cost_with_optimization').notNull(),
  costSavedDaily: doublePrecision('cost_saved_daily').notNull(),
  savingsPercent: doublePrecision('savings_percent').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const scalingHistory = pgTable('scaling_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  timestamp: text('timestamp').notNull(),
  previousServers: integer('previous_servers').notNull(),
  newServers: integer('new_servers').notNull(),
  delta: integer('delta').notNull(),
  predictedCpu: doublePrecision('predicted_cpu').notNull(),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const scalingConfig = pgTable('scaling_config', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull()
    .unique(),
  scaleDownLow: doublePrecision('scale_down_low').notNull().default(20),
  scaleDownModerate: doublePrecision('scale_down_moderate').notNull().default(30),
  scaleUpHigh: doublePrecision('scale_up_high').notNull().default(80),
  scaleUpCritical: doublePrecision('scale_up_critical').notNull().default(90),
  minServers: integer('min_servers').notNull().default(2),
  maxServers: integer('max_servers').notNull().default(20),
  updatedAt: text('updated_at').notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, {onDelete: 'cascade'})
    .notNull(),
  sessionId: text('session_id').notNull().default('default'),
  role: text('role').notNull(),
  model: text('model').notNull().default('gemini-4-hydrogen'),
  content: text('content').notNull(),
  groundingJson: text('grounding_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({many, one}) => ({
  resourceLogs: many(resourceLogs),
  predictions: many(predictions),
  costHistory: many(costHistory),
  scalingHistory: many(scalingHistory),
  scalingConfig: one(scalingConfig),
  chatMessages: many(chatMessages),
}));

export const resourceLogsRelations = relations(resourceLogs, ({one}) => ({
  user: one(users, {fields: [resourceLogs.userId], references: [users.id]}),
}));

export const predictionsRelations = relations(predictions, ({one}) => ({
  user: one(users, {fields: [predictions.userId], references: [users.id]}),
}));

export const costHistoryRelations = relations(costHistory, ({one}) => ({
  user: one(users, {fields: [costHistory.userId], references: [users.id]}),
}));

export const scalingHistoryRelations = relations(scalingHistory, ({one}) => ({
  user: one(users, {fields: [scalingHistory.userId], references: [users.id]}),
}));

export const scalingConfigRelations = relations(scalingConfig, ({one}) => ({
  user: one(users, {fields: [scalingConfig.userId], references: [users.id]}),
}));

export const chatMessagesRelations = relations(chatMessages, ({one}) => ({
  user: one(users, {fields: [chatMessages.userId], references: [users.id]}),
}));

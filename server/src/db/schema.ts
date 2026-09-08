// Drizzle ORM Schema — AgentForge 数据模型
// AGENTS.md §3：数据库列名 snake_case，代码标识符 camelCase
// M1 范围：users / agent_projects / agent_runs / agent_run_steps
// M2+ 扩展：harness_config / skill / mcp_connection / rag_document / rag_chunk / orchestration

import { pgTable, uuid, text, timestamp, integer, jsonb, varchar, pgEnum, boolean } from 'drizzle-orm/pg-core';

// ===== 用户 =====
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ===== Agent 项目 =====
// provider/model 走字符串，AI Provider 抽象层负责适配
export const agentProjects = pgTable('agent_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  provider: varchar('provider', { length: 50 }).notNull().default('openai'),
  model: varchar('model', { length: 100 }).notNull().default('gpt-4o-mini'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ===== Agent 运行状态枚举 =====
export const runStatusEnum = pgEnum('run_status', ['pending', 'running', 'success', 'failed']);

// ===== Agent 运行记录 =====
// M1：单轮 LLM 调用即一条 run；M2+ 拓展为多步骤
export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agentProjects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  input: text('input').notNull(),
  output: text('output'),
  status: runStatusEnum('status').notNull().default('pending'),
  tokenCount: integer('token_count').default(0),
  durationMs: integer('duration_ms').default(0),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ===== 运行步骤（M1 暂只记录单步 LLM 调用；M2 Skill 调用链拓展为多步）=====
export const runStepTypeEnum = pgEnum('run_step_type', ['llm_call', 'tool_call', 'rag_retrieval']);

export const agentRunSteps = pgTable('agent_run_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  stepType: runStepTypeEnum('step_type').notNull(),
  stepInput: jsonb('step_input'),
  stepOutput: jsonb('step_output'),
  durationMs: integer('duration_ms').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ===== Harness 配置（M2） =====
// 一个 Agent 项目对应一份 harness_config（1:1，逻辑上）
// system_prompt：系统级指令；rules：Markdown 规则文件（多条）；constraints：JSON Schema 形式的约束
export const harnessConfigs = pgTable('harness_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agentProjects.id, { onDelete: 'cascade' }),
  systemPrompt: text('system_prompt'),
  // rules_json: string[] —— Markdown 规则文件正文（多段，每段一个 AGENTS.md 风格的章节）
  rulesJson: jsonb('rules_json').$type<string[]>().default([]),
  // constraints_json: Record<string, unknown> —— 自由结构约束（M2 暂作展示用）
  constraintsJson: jsonb('constraints_json').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ===== Skill 实体（M2） =====
export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agentProjects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  // trigger_json: { keywords?: string[]; semantic?: string } —— 触发条件
  triggerJson: jsonb('trigger_json').$type<{ keywords?: string[]; semantic?: string }>().default({}),
  // tool_chain_json: Array<{ tool: string; description: string }> —— M2 简化为工具名+描述
  toolChainJson: jsonb('tool_chain_json')
    .$type<Array<{ tool: string; description: string }>>()
    .default([]),
  // input_schema / output_schema: Zod schema 的 JSON 表示（standardSchema JSON Schema）
  inputSchema: jsonb('input_schema'),
  outputSchema: jsonb('output_schema'),
  // 是否预置模板（不可删，但可基于模板复制）
  isTemplate: boolean('is_template').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 类型导出（供路由层与服务层使用）
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AgentProject = typeof agentProjects.$inferSelect;
export type NewAgentProject = typeof agentProjects.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunStep = typeof agentRunSteps.$inferSelect;
export type NewAgentRunStep = typeof agentRunSteps.$inferInsert;
export type HarnessConfig = typeof harnessConfigs.$inferSelect;
export type NewHarnessConfig = typeof harnessConfigs.$inferInsert;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

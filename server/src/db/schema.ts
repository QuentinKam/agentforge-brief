// Drizzle ORM Schema — AgentForge 数据模型
// AGENTS.md §3：数据库列名 snake_case，代码标识符 camelCase
// M1 范围：users / agent_projects / agent_runs / agent_run_steps
// M2+ 扩展：harness_config / skill / mcp_connection / rag_document / rag_chunk / orchestration

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  varchar,
  pgEnum,
  boolean,
  customType,
} from 'drizzle-orm/pg-core';

// ===== pgvector 类型适配 =====
// drizzle-orm 0.36 未直接导出 vector 列工厂，用 customType 自定义
// 维度固定 1536（OpenAI text-embedding-3-small 输出维度）
// pgvector 字面值格式：'[1,2,3,...]'；customType 的 toDriver 负责 JS array → 字符串
export const vector1536 = customType<{ data: number[]; defaultData: never }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
});

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

// ===== RAG 文档（M3） =====
// 一个 Agent 项目可上传多个文档；content_hash 用于去重
export const ragDocuments = pgTable('rag_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agentProjects.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  chunkCount: integer('chunk_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ===== RAG 文档分块（M3） =====
// embedding: pgvector vector(1536)；metadata_json: { filePath, type, heading, lineStart, lineEnd }
export const ragChunks = pgTable('rag_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => ragDocuments.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agentProjects.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: vector1536('embedding'),
  metadataJson: jsonb('metadata_json').$type<RagChunkMetadata>().default({}),
  chunkIndex: integer('chunk_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export interface RagChunkMetadata {
  filePath?: string;
  type?: 'markdown' | 'code' | 'text';
  heading?: string;
  lineStart?: number;
  lineEnd?: number;
}

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
export type RagDocument = typeof ragDocuments.$inferSelect;
export type NewRagDocument = typeof ragDocuments.$inferInsert;
export type RagChunk = typeof ragChunks.$inferSelect;
export type NewRagChunk = typeof ragChunks.$inferInsert;

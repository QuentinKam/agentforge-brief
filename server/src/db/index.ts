// 数据库连接 — 单例 postgres 客户端 + Drizzle 实例
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import 'dotenv/config';

import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost:5432/agentforge';

// 单例：避免 HMR 重复创建连接（开发期 Bun --hot 会重载）
declare global {
  // eslint-disable-next-line no-var
  var __agentforgeDbClient: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __agentforgeDb: ReturnType<typeof drizzle> | undefined;
}

const client =
  globalThis.__agentforgeDbClient ??
  (globalThis.__agentforgeDbClient = postgres(databaseUrl, {
    max: 50,
    // 测试场景下大批量插入用，避免连接池耗尽
    idle_timeout: 20,
    connect_timeout: 10,
  }));

export const db =
  globalThis.__agentforgeDb ??
  (globalThis.__agentforgeDb = drizzle(client, { schema, casing: 'snake_case' }));

export { schema };
// 重新导出 schema 类型供路由层与服务层使用
export type {
  User,
  NewUser,
  AgentProject,
  NewAgentProject,
  AgentRun,
  NewAgentRun,
  AgentRunStep,
  NewAgentRunStep,
  HarnessConfig,
  NewHarnessConfig,
  Skill,
  NewSkill,
  RagDocument,
  NewRagDocument,
  RagChunk,
  NewRagChunk,
} from './schema';
export type { RagChunkMetadata } from './schema';

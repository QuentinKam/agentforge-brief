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
  globalThis.__agentforgeDbClient ?? (globalThis.__agentforgeDbClient = postgres(databaseUrl, { max: 10 }));

export const db =
  globalThis.__agentforgeDb ??
  (globalThis.__agentforgeDb = drizzle(client, { schema, casing: 'snake_case' }));

export { schema };

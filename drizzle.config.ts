// Drizzle Kit 配置 — 迁移文件版本管理
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './server/src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/agentforge',
  },
  verbose: true,
  strict: true,
});

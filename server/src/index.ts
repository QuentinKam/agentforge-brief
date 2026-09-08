// Hono 应用入口 — 注册路由、全局错误处理、健康检查
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import 'dotenv/config';

import { authRoutes } from './routes/auth';
import { agentProjectRoutes } from './routes/agent-projects';
import { agentRunRoutes } from './routes/agent-runs';
import { harnessRoutes } from './routes/harness';
import { skillRoutes } from './routes/skills';
import { ragRoutes } from './routes/rag';
import { ApiError, sendApiError } from './lib/errors';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

// 中间件
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }),
);

// 健康检查
app.get('/api/health', (ctx) => ctx.json({ status: 'ok', ts: Date.now() }));

// 业务路由
app.route('/api/auth', authRoutes);
app.route('/api/agent-projects', agentProjectRoutes);
app.route('/api/agent-projects', harnessRoutes);
app.route('/api/agent-projects', skillRoutes);
app.route('/api/agent-projects', ragRoutes);
app.route('/api/agent-runs', agentRunRoutes);

// 404 兜底
app.notFound((ctx) =>
  sendApiError(ctx, ApiError.notFound('ROUTE_NOT_FOUND', '路由不存在')),
);

// 全局错误处理：拦截 ApiError + zod 校验错误 + 其他异常
app.onError((err, ctx) => {
  if (err instanceof ApiError) {
    return sendApiError(ctx, err);
  }
  console.error('[AgentForge] 未捕获异常:', err);
  return sendApiError(
    ctx,
    ApiError.internal('INTERNAL_ERROR', '服务器内部错误', {
      name: err.name,
      message: err.message,
    }),
  );
});

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};

console.log(`[AgentForge] API server listening on http://localhost:${port}`);

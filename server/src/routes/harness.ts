// Harness 配置路由 — 单 Agent 单 harness（1:1）
// GET /api/agent-projects/:id/harness        获取
// PUT  /api/agent-projects/:id/harness        upsert（首次写入或更新）
// POST /api/agent-projects/:id/harness/export 导出 JSON
// POST /api/agent-projects/:id/harness/import 导入 JSON
// POST /api/agent-projects/:id/harness/preview 上下文预览（实时 token 计数）
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { ApiError, sendApiError } from '../lib/errors';
import { zodHook } from '../lib/zod-hook';
import { buildContextPreview } from '../lib/tokens';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../types';

const harnessSchema = z.object({
  systemPrompt: z.string().max(20000).nullable().optional(),
  rules: z.array(z.string().max(50000)).max(20).optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
});

const importSchema = z.object({
  systemPrompt: z.string().max(20000).nullable().optional(),
  rules: z.array(z.string().max(50000)).max(20).optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
});

export const harnessRoutes = new Hono<AppEnv>()
  .use('*', authMiddleware)
  // 获取（首次访问时若不存在则懒创建一份空 harness）
  .get('/:agentId/harness', async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;

    const [project] = await db
      .select({ id: schema.agentProjects.id })
      .from(schema.agentProjects)
      .where(
        and(
          eq(schema.agentProjects.id, agentId),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .limit(1);
    if (!project) {
      return sendApiError(ctx, ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'));
    }

    const [existing] = await db
      .select()
      .from(schema.harnessConfigs)
      .where(eq(schema.harnessConfigs.agentId, agentId))
      .limit(1);

    if (existing) return ctx.json({ data: existing });

    // 懒创建
    const [created] = await db
      .insert(schema.harnessConfigs)
      .values({ agentId, systemPrompt: null, rulesJson: [], constraintsJson: {} })
      .returning();
    return ctx.json({ data: created });
  })
  // 更新 / 首次写入
  .put('/:agentId/harness', zValidator('json', harnessSchema, zodHook), async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;
    const body = ctx.req.valid('json');

    const [project] = await db
      .select({ id: schema.agentProjects.id })
      .from(schema.agentProjects)
      .where(
        and(
          eq(schema.agentProjects.id, agentId),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .limit(1);
    if (!project) {
      return sendApiError(ctx, ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'));
    }

    const [existing] = await db
      .select({ id: schema.harnessConfigs.id })
      .from(schema.harnessConfigs)
      .where(eq(schema.harnessConfigs.agentId, agentId))
      .limit(1);

    const payload = {
      systemPrompt: body.systemPrompt ?? null,
      rulesJson: body.rules ?? [],
      constraintsJson: body.constraints ?? {},
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await db
        .update(schema.harnessConfigs)
        .set(payload)
        .where(eq(schema.harnessConfigs.id, existing.id))
        .returning();
      return ctx.json({ data: updated });
    }

    const [created] = await db
      .insert(schema.harnessConfigs)
      .values({ agentId, ...payload })
      .returning();
    return ctx.json({ data: created });
  })
  // 导出 JSON
  .post('/:agentId/harness/export', async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;

    const [project] = await db
      .select()
      .from(schema.agentProjects)
      .where(
        and(
          eq(schema.agentProjects.id, agentId),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .limit(1);
    if (!project) {
      return sendApiError(ctx, ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'));
    }

    const [harness] = await db
      .select()
      .from(schema.harnessConfigs)
      .where(eq(schema.harnessConfigs.agentId, agentId))
      .limit(1);

    const skillsList = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.agentId, agentId))
      .orderBy(schema.skills.createdAt);

    return ctx.json({
      data: {
        version: 1,
        agent: {
          name: project.name,
          description: project.description,
          provider: project.provider,
          model: project.model,
        },
        harness: harness
          ? {
              systemPrompt: harness.systemPrompt,
              rules: harness.rulesJson,
              constraints: harness.constraintsJson,
            }
          : null,
        skills: skillsList.map((s) => ({
          name: s.name,
          description: s.description,
          trigger: s.triggerJson,
          toolChain: s.toolChainJson,
          inputSchema: s.inputSchema,
          outputSchema: s.outputSchema,
        })),
      },
    });
  })
  // 导入 JSON
  .post('/:agentId/harness/import', zValidator('json', importSchema, zodHook), async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;
    const body = ctx.req.valid('json');

    const [project] = await db
      .select({ id: schema.agentProjects.id })
      .from(schema.agentProjects)
      .where(
        and(
          eq(schema.agentProjects.id, agentId),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .limit(1);
    if (!project) {
      return sendApiError(ctx, ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'));
    }

    const [existing] = await db
      .select({ id: schema.harnessConfigs.id })
      .from(schema.harnessConfigs)
      .where(eq(schema.harnessConfigs.agentId, agentId))
      .limit(1);

    const payload = {
      systemPrompt: body.systemPrompt ?? null,
      rulesJson: body.rules ?? [],
      constraintsJson: body.constraints ?? {},
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await db
        .update(schema.harnessConfigs)
        .set(payload)
        .where(eq(schema.harnessConfigs.id, existing.id))
        .returning();
      return ctx.json({ data: updated });
    }

    const [created] = await db
      .insert(schema.harnessConfigs)
      .values({ agentId, ...payload })
      .returning();
    return ctx.json({ data: created });
  })
  // 上下文预览：实时渲染最终发给 LLM 的完整 prompt + token 计数
  .post('/:agentId/harness/preview', async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;

    const [project] = await db
      .select({ id: schema.agentProjects.id })
      .from(schema.agentProjects)
      .where(
        and(
          eq(schema.agentProjects.id, agentId),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .limit(1);
    if (!project) {
      return sendApiError(ctx, ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'));
    }

    // 入参不强制 zod 校验（可选字段，预览用），手解析
    const body = (await ctx.req.json().catch(() => ({}))) as {
      systemPrompt?: string | null;
      rules?: string[];
      constraints?: Record<string, unknown>;
      userMessage?: string;
    };

    const [harness] = await db
      .select()
      .from(schema.harnessConfigs)
      .where(eq(schema.harnessConfigs.agentId, agentId))
      .limit(1);

    const systemPrompt =
      body.systemPrompt !== undefined ? body.systemPrompt : harness?.systemPrompt ?? null;
    const rules =
      body.rules !== undefined ? body.rules : (harness?.rulesJson as string[] | null) ?? null;
    const constraints =
      body.constraints !== undefined
        ? body.constraints
        : (harness?.constraintsJson as Record<string, unknown> | null) ?? null;

    const preview = buildContextPreview({
      systemPrompt,
      rules,
      constraints,
      userMessage: body.userMessage,
    });

    return ctx.json({ data: preview });
  });

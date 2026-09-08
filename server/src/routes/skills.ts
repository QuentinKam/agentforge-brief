// Skill CRUD — GET/POST/PATCH/DELETE /api/agent-projects/:agentId/skills
// 含预置 Skill 模板的种子端点 POST /api/agent-projects/:agentId/skills/seed-templates
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { ApiError, sendApiError } from '../lib/errors';
import { zodHook } from '../lib/zod-hook';
import { authMiddleware } from '../middleware/auth';
import { SKILL_TEMPLATES } from './skill-templates';
import type { AppEnv } from '../types';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  trigger: z
    .object({
      keywords: z.array(z.string()).optional(),
      semantic: z.string().optional(),
    })
    .optional(),
  toolChain: z
    .array(z.object({ tool: z.string(), description: z.string() }))
    .optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = createSchema.partial();

export const skillRoutes = new Hono<AppEnv>()
  .use('*', authMiddleware)
  .get('/:agentId/skills', async (ctx) => {
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

    const rows = await db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.agentId, agentId))
      .orderBy(schema.skills.createdAt);
    return ctx.json({ data: rows });
  })
  .post('/:agentId/skills', zValidator('json', createSchema, zodHook), async (ctx) => {
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

    const [created] = await db
      .insert(schema.skills)
      .values({
        agentId,
        name: body.name,
        description: body.description,
        triggerJson: body.trigger ?? {},
        toolChainJson: body.toolChain ?? [],
        inputSchema: body.inputSchema ?? null,
        outputSchema: body.outputSchema ?? null,
        isTemplate: false,
      })
      .returning();
    return ctx.json({ data: created }, 201);
  })
  .post('/:agentId/skills/seed-templates', async (ctx) => {
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

    // 已有模板则跳过
    const existing = await db
      .select({ name: schema.skills.name })
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.agentId, agentId),
          eq(schema.skills.isTemplate, true),
        ),
      );
    const existingNames = new Set(existing.map((r) => r.name));
    const toInsert = SKILL_TEMPLATES.filter((t) => !existingNames.has(t.name));

    if (toInsert.length === 0) {
      return ctx.json({ data: { inserted: 0, message: '模板已存在' } });
    }

    const inserted = await db
      .insert(schema.skills)
      .values(
        toInsert.map((t) => ({
          agentId,
          name: t.name,
          description: t.description,
          triggerJson: t.trigger,
          toolChainJson: t.toolChain,
          inputSchema: t.inputSchema ?? null,
          outputSchema: t.outputSchema ?? null,
          isTemplate: true,
        })),
      )
      .returning();
    return ctx.json({ data: { inserted: inserted.length, skills: inserted } }, 201);
  })
  .patch('/:agentId/skills/:skillId', zValidator('json', updateSchema, zodHook), async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;
    const skillId = ctx.req.param('skillId')!;
    const body = ctx.req.valid('json');

    // 校验归属
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

    const [updated] = await db
      .update(schema.skills)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.trigger !== undefined ? { triggerJson: body.trigger } : {}),
        ...(body.toolChain !== undefined ? { toolChainJson: body.toolChain } : {}),
        ...(body.inputSchema !== undefined ? { inputSchema: body.inputSchema } : {}),
        ...(body.outputSchema !== undefined ? { outputSchema: body.outputSchema } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.skills.id, skillId),
          eq(schema.skills.agentId, agentId),
        ),
      )
      .returning();
    if (!updated) {
      return sendApiError(ctx, ApiError.notFound('SKILL_NOT_FOUND', 'Skill 不存在'));
    }
    return ctx.json({ data: updated });
  })
  .delete('/:agentId/skills/:skillId', async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;
    const skillId = ctx.req.param('skillId')!;

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

    const [deleted] = await db
      .delete(schema.skills)
      .where(
        and(
          eq(schema.skills.id, skillId),
          eq(schema.skills.agentId, agentId),
        ),
      )
      .returning({ id: schema.skills.id, isTemplate: schema.skills.isTemplate });
    if (!deleted) {
      return sendApiError(ctx, ApiError.notFound('SKILL_NOT_FOUND', 'Skill 不存在'));
    }
    if (deleted.isTemplate) {
      return sendApiError(
        ctx,
        ApiError.badRequest('CANNOT_DELETE_TEMPLATE', '预置模板不可删除'),
      );
    }
    return ctx.json({ data: { id: deleted.id } });
  });

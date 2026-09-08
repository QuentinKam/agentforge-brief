// Agent Project CRUD — GET/POST/PATCH/DELETE /api/agent-projects
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { ApiError, sendApiError } from '../lib/errors';
import { zodHook } from '../lib/zod-hook';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../types';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  model: z.string().min(1).max(100).default('gpt-4o-mini'),
});

const updateSchema = createSchema.partial();

export const agentProjectRoutes = new Hono<AppEnv>()
  .use('*', authMiddleware)
  .get('/', async (ctx) => {
    const user = ctx.get('user');
    const rows = await db
      .select()
      .from(schema.agentProjects)
      .where(eq(schema.agentProjects.userId, user.id))
      .orderBy(schema.agentProjects.createdAt);
    return ctx.json({ data: rows });
  })
  .post('/', zValidator('json', createSchema, zodHook), async (ctx) => {
    const user = ctx.get('user');
    const body = ctx.req.valid('json');
    const [created] = await db
      .insert(schema.agentProjects)
      .values({
        userId: user.id,
        name: body.name,
        description: body.description,
        provider: body.provider,
        model: body.model,
      })
      .returning();
    return ctx.json({ data: created }, 201);
  })
  .get('/:id', async (ctx) => {
    const user = ctx.get('user');
    const id = ctx.req.param('id')!;
    const [row] = await db
      .select()
      .from(schema.agentProjects)
      .where(
        and(
          eq(schema.agentProjects.id, id),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .limit(1);
    if (!row) {
      return sendApiError(
        ctx,
        ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'),
      );
    }
    return ctx.json({ data: row });
  })
  .patch('/:id', zValidator('json', updateSchema, zodHook), async (ctx) => {
    const user = ctx.get('user');
    const id = ctx.req.param('id')!;
    const body = ctx.req.valid('json');
    const [updated] = await db
      .update(schema.agentProjects)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(
          eq(schema.agentProjects.id, id),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .returning();
    if (!updated) {
      return sendApiError(
        ctx,
        ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'),
      );
    }
    return ctx.json({ data: updated });
  })
  .delete('/:id', async (ctx) => {
    const user = ctx.get('user');
    const id = ctx.req.param('id')!;
    const [deleted] = await db
      .delete(schema.agentProjects)
      .where(
        and(
          eq(schema.agentProjects.id, id),
          eq(schema.agentProjects.userId, user.id),
        ),
      )
      .returning({ id: schema.agentProjects.id });
    if (!deleted) {
      return sendApiError(
        ctx,
        ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'),
      );
    }
    return ctx.json({ data: { id: deleted.id } });
  });

// RAG 路由 — PRD §3.4
// POST   /api/agent-projects/:agentId/rag/documents         上传文档（分块 + embedding + 入库）
// GET    /api/agent-projects/:agentId/rag/documents         列出文档
// DELETE /api/agent-projects/:agentId/rag/documents/:docId 删除文档
// POST   /api/agent-projects/:agentId/rag/search           检索（cosine + metadata 过滤）
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { ApiError, sendApiError } from '../lib/errors';
import { zodHook } from '../lib/zod-hook';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../types';
import {
  uploadDocument,
  retrieve,
  listDocuments,
  deleteDocument,
  type RetrieveFilters,
} from '../rag/service';

const uploadSchema = z.object({
  fileName: z.string().min(1).max(500),
  content: z.string().min(1).max(2_000_000),
});

const searchSchema = z.object({
  query: z.string().min(1).max(5000),
  topK: z.number().int().min(1).max(50).optional(),
  filters: z
    .object({
      fileType: z.string().max(50).optional(),
      heading: z.string().max(500).optional(),
      filePath: z.string().max(1000).optional(),
      documentId: z.string().uuid().optional(),
    })
    .optional(),
});

export const ragRoutes = new Hono<AppEnv>()
  .use('*', authMiddleware)
  // 上传文档
  .post(
    '/:agentId/rag/documents',
    zValidator('json', uploadSchema, zodHook),
    async (ctx) => {
      const user = ctx.get('user');
      const agentId = ctx.req.param('agentId')!;
      const body = ctx.req.valid('json');

      // 校验 Agent 归属
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

      try {
        const result = await uploadDocument(agentId, body.fileName, body.content);
        return ctx.json({ data: result }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return sendApiError(
          ctx,
          ApiError.internal('RAG_UPLOAD_FAILED', `文档上传失败: ${message}`),
        );
      }
    },
  )
  // 列出文档
  .get('/:agentId/rag/documents', async (ctx) => {
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

    const rows = await listDocuments(agentId);
    return ctx.json({ data: rows });
  })
  // 删除文档
  .delete('/:agentId/rag/documents/:docId', async (ctx) => {
    const user = ctx.get('user');
    const agentId = ctx.req.param('agentId')!;
    const docId = ctx.req.param('docId')!;

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

    const deleted = await deleteDocument(agentId, docId);
    if (!deleted) {
      return sendApiError(ctx, ApiError.notFound('DOCUMENT_NOT_FOUND', '文档不存在'));
    }
    return ctx.json({ data: { id: docId } });
  })
  // 检索
  .post(
    '/:agentId/rag/search',
    zValidator('json', searchSchema, zodHook),
    async (ctx) => {
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

      try {
        const results = await retrieve(agentId, body.query, {
          topK: body.topK,
          filters: body.filters as RetrieveFilters | undefined,
        });
        return ctx.json({ data: results });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return sendApiError(
          ctx,
          ApiError.internal('RAG_SEARCH_FAILED', `检索失败: ${message}`),
        );
      }
    },
  );

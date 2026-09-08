// Agent 运行路由 — POST /api/agent-runs 发起运行；GET /api/agent-runs 列表 + 详情
// M1 范围：单轮 LLM 调用；落库 agent_runs + agent_run_steps（单步 llm_call）
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { ApiError, sendApiError } from '../lib/errors';
import { zodHook } from '../lib/zod-hook';
import { authMiddleware } from '../middleware/auth';
import { getProviderFactory } from '../llm';
import type { ProviderFactory } from '../llm/provider';
import { retrieve, type RetrieveResult } from '../rag/service';
import type { AppEnv } from '../types';

const runSchema = z.object({
  agentId: z.string().uuid(),
  input: z.string().min(1).max(10000),
  // 可选 RAG 注入配置；不传则使用默认值
  ragOptions: z
    .object({
      enabled: z.boolean().optional(),
      topK: z.number().int().min(1).max(20).optional(),
    })
    .optional(),
});

/** 把 RAG 检索结果格式化为系统消息片段 */
function formatRagContext(results: RetrieveResult[]): string {
  if (results.length === 0) return '';
  const lines = results.map((r, i) => {
    const meta = r.chunk.metadata;
    const source = meta.filePath ?? r.document.fileName;
    const heading = meta.heading ? ` › ${meta.heading}` : '';
    const lineRange =
      meta.lineStart && meta.lineEnd ? ` (L${meta.lineStart}-${meta.lineEnd})` : '';
    return `### [${i + 1}] ${source}${heading}${lineRange}\n\n${r.chunk.content}`;
  });
  return [
    '# 知识库检索结果（按相似度排序）',
    '',
    '以下片段从你专属的知识库中检索得到，可用于回答用户问题：',
    '',
    lines.join('\n\n'),
  ].join('\n');
}

export function createAgentRunRoutes(factory: ProviderFactory = getProviderFactory()) {
  return new Hono<AppEnv>()
    .use('*', authMiddleware)
    .post('/', zValidator('json', runSchema, zodHook), async (ctx) => {
      const user = ctx.get('user');
      const { agentId, input, ragOptions } = ctx.req.valid('json');

      // 校验 Agent 归属
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
        return sendApiError(
          ctx,
          ApiError.notFound('PROJECT_NOT_FOUND', 'Agent 项目不存在'),
        );
      }

      // 落 pending run
      const [run] = await db
        .insert(schema.agentRuns)
        .values({
          agentId,
          userId: user.id,
          input,
          status: 'running',
        })
        .returning();
      if (!run) {
        return sendApiError(
          ctx,
          ApiError.internal('RUN_INSERT_FAILED', '运行记录写入失败'),
        );
      }

      const start = Date.now();
      try {
        // RAG 检索：默认启用（除非显式 enabled: false）
        const ragEnabled = ragOptions?.enabled !== false;
        const ragTopK = ragOptions?.topK ?? 5;
        let ragResults: RetrieveResult[] = [];
        let ragStepId: string | undefined;
        if (ragEnabled) {
          const ragStart = Date.now();
          try {
            ragResults = await retrieve(agentId, input, { topK: ragTopK });
          } catch {
            // 检索失败不阻塞主流程；落空 ragResults
            ragResults = [];
          }
          const ragDurationMs = Date.now() - ragStart;
          // 落 RAG 检索 step trace
          const [ragStep] = await db
            .insert(schema.agentRunSteps)
            .values({
              runId: run.id,
              stepType: 'rag_retrieval',
              stepInput: { query: input, topK: ragTopK },
              stepOutput: {
                hits: ragResults.length,
                results: ragResults.map((r) => ({
                  chunkId: r.chunk.id,
                  documentId: r.document.id,
                  fileName: r.document.fileName,
                  score: r.score,
                  contentPreview: r.chunk.content.slice(0, 200),
                })),
              },
              durationMs: ragDurationMs,
            })
            .returning({ id: schema.agentRunSteps.id });
          ragStepId = ragStep?.id;
        }

        // 组装 LLM 上下文：系统消息（含 RAG 注入）+ 用户输入
        const messages: Array<{
          role: 'system' | 'user' | 'assistant';
          content: string;
        }> = [];
        const ragContext = formatRagContext(ragResults);
        if (ragContext) {
          messages.push({ role: 'system', content: ragContext });
        }
        messages.push({ role: 'user', content: input });

        const provider = factory.get(project.provider);
        const result = await provider.chat({
          messages,
          model: project.model,
        });

        const durationMs = Date.now() - start;
        const [updated] = await db
          .update(schema.agentRuns)
          .set({
            output: result.content,
            status: 'success',
            tokenCount: result.tokens,
            durationMs,
          })
          .where(eq(schema.agentRuns.id, run.id))
          .returning();

        // 落 step trace
        await db.insert(schema.agentRunSteps).values({
          runId: run.id,
          stepType: 'llm_call',
          stepInput: {
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            model: project.model,
            ragStepId,
          },
          stepOutput: { content: result.content, tokens: result.tokens },
          durationMs: result.durationMs,
        });

        return ctx.json({ data: updated }, 201);
      } catch (err) {
        const durationMs = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        const [updated] = await db
          .update(schema.agentRuns)
          .set({
            status: 'failed',
            durationMs,
            errorMessage: message,
          })
          .where(eq(schema.agentRuns.id, run.id))
          .returning();
        return sendApiError(
          ctx,
          ApiError.internal('AGENT_RUN_FAILED', `Agent 运行失败: ${message}`, {
            run: updated,
          }),
        );
      }
    })
    .get('/', async (ctx) => {
      const user = ctx.get('user');
      const rows = await db
        .select({
          id: schema.agentRuns.id,
          agentId: schema.agentRuns.agentId,
          status: schema.agentRuns.status,
          input: schema.agentRuns.input,
          output: schema.agentRuns.output,
          tokenCount: schema.agentRuns.tokenCount,
          durationMs: schema.agentRuns.durationMs,
          errorMessage: schema.agentRuns.errorMessage,
          createdAt: schema.agentRuns.createdAt,
        })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.userId, user.id))
        .orderBy(desc(schema.agentRuns.createdAt))
        .limit(100);
      return ctx.json({ data: rows });
    })
    .get('/:id', async (ctx) => {
      const user = ctx.get('user');
      const id = ctx.req.param('id')!;
      const [run] = await db
        .select()
        .from(schema.agentRuns)
        .where(
          and(
            eq(schema.agentRuns.id, id),
            eq(schema.agentRuns.userId, user.id),
          ),
        )
        .limit(1);
      if (!run) {
        return sendApiError(
          ctx,
          ApiError.notFound('RUN_NOT_FOUND', '运行记录不存在'),
        );
      }
      const steps = await db
        .select()
        .from(schema.agentRunSteps)
        .where(eq(schema.agentRunSteps.runId, id))
        .orderBy(schema.agentRunSteps.createdAt);
      return ctx.json({ data: { run, steps } });
    });
}

export const agentRunRoutes = createAgentRunRoutes();

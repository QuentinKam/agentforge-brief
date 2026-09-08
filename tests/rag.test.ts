// RAG 服务集成测试 — TDD：PRD §3.4
// 覆盖：文档上传 → 分块 → embedding → 入库 → 检索 → metadata 过滤 → 删除
// 无 OPENAI_API_KEY 时自动降级到本地 hash embedding（流程闭环验证）
import { test, expect, describe, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, schema } from '../server/src/db';
import { truncateAll, registerTestUser } from './helpers';
import app from '../server/src/index';
import {
  uploadDocument,
  retrieve,
  listDocuments,
  deleteDocument,
} from '../server/src/rag/service';
import {
  LocalHashEmbeddingProvider,
  resetEmbeddingFactory,
} from '../server/src/llm/embedding';

const hashProvider = new LocalHashEmbeddingProvider();

async function seedProject(userId: string) {
  const [project] = await db
    .insert(schema.agentProjects)
    .values({ userId, name: 'P-RAG', provider: 'openai', model: 'gpt-4o-mini' })
    .returning();
  if (!project) throw new Error('project insert failed');
  return project;
}

const SAMPLE_MD = `# 第一章 概述

这是一个 AI Coding Agent 开发平台，包含沙箱、Skill 系统、RAG 知识库。

## 1.1 架构

后端 Hono + 前端 React + Vite，数据库 PostgreSQL + pgvector。

# 第二章 安装

使用 bun install 安装依赖。

# 第三章 API

提供 /api/agent-runs 路由发起 Agent 运行。
`;

describe('RAG 文档上传', () => {
  beforeEach(truncateAll);

  test('上传 Markdown 文档 → 分块 + 入库', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    const result = await uploadDocument(project.id, 'intro.md', SAMPLE_MD, {
      embeddingProvider: hashProvider,
    });

    expect(result.chunks).toBeGreaterThan(0);
    expect(result.document.fileName).toBe('intro.md');
    expect(result.document.fileType).toBe('markdown');
    expect(result.document.chunkCount).toBe(result.chunks);
    expect(result.embeddingProvider).toBe('local-hash');
  });

  test('相同内容 hash 跳过重复入库', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    const r1 = await uploadDocument(project.id, 'a.md', '重复内容', {
      embeddingProvider: hashProvider,
    });
    const r2 = await uploadDocument(project.id, 'b.md', '重复内容', {
      embeddingProvider: hashProvider,
    });

    expect(r1.chunks).toBeGreaterThan(0);
    expect(r2.chunks).toBe(0); // 跳过
    expect(r2.document.id).toBe(r1.document.id);
  });
});

describe('RAG 检索', () => {
  beforeEach(truncateAll);

  test('cosine 相似度返回 top-k 结果', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'intro.md', SAMPLE_MD, {
      embeddingProvider: hashProvider,
    });

    const results = await retrieve(project.id, '沙箱 沙盒 agent', {
      topK: 3,
      embeddingProvider: hashProvider,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    // score 在 [-1, 1] 区间
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(-1);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.chunk.content.length).toBeGreaterThan(0);
      expect(r.document.fileName).toBe('intro.md');
    }
  });

  test('不同 query 给出不同 score 排序', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'intro.md', SAMPLE_MD, {
      embeddingProvider: hashProvider,
    });

    const results = await retrieve(project.id, '安装 依赖 bun', {
      topK: 5,
      embeddingProvider: hashProvider,
    });
    // 至少有结果
    expect(results.length).toBeGreaterThan(0);
    // 结果按 score 降序
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  test('空 query 抛错', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);
    let threw = false;
    try {
      await retrieve(project.id, '', { embeddingProvider: hashProvider });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('metadata 过滤 fileType', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'a.md', '# 标题\n\n内容', {
      embeddingProvider: hashProvider,
    });
    await uploadDocument(project.id, 'b.ts', 'export function foo() { return 1; }', {
      embeddingProvider: hashProvider,
    });

    const mdOnly = await retrieve(project.id, 'foo', {
      topK: 10,
      filters: { fileType: 'markdown' },
      embeddingProvider: hashProvider,
    });
    expect(mdOnly.length).toBeGreaterThan(0);
    for (const r of mdOnly) {
      expect(r.document.fileType).toBe('markdown');
    }
  });

  test('metadata 过滤 filePath', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'a.md', '# A\n\n内容A', {
      embeddingProvider: hashProvider,
    });
    await uploadDocument(project.id, 'b.md', '# B\n\n内容B', {
      embeddingProvider: hashProvider,
    });

    const onlyA = await retrieve(project.id, '内容', {
      topK: 10,
      filters: { filePath: 'a.md' },
      embeddingProvider: hashProvider,
    });
    expect(onlyA.length).toBeGreaterThan(0);
    for (const r of onlyA) {
      expect(r.chunk.metadata.filePath).toBe('a.md');
    }
  });

  test('metadata 过滤 documentId', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    const r1 = await uploadDocument(project.id, 'a.md', '# A\n内容A', {
      embeddingProvider: hashProvider,
    });
    await uploadDocument(project.id, 'b.md', '# B\n内容B', {
      embeddingProvider: hashProvider,
    });

    const onlyDoc1 = await retrieve(project.id, '内容', {
      topK: 10,
      filters: { documentId: r1.document.id },
      embeddingProvider: hashProvider,
    });
    expect(onlyDoc1.length).toBeGreaterThan(0);
    for (const r of onlyDoc1) {
      expect(r.document.id).toBe(r1.document.id);
    }
  });

  test('未上传文档的 Agent 返回空', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);
    const results = await retrieve(project.id, '任意 query', {
      embeddingProvider: hashProvider,
    });
    expect(results.length).toBe(0);
  });
});

describe('RAG 文档列表与删除', () => {
  beforeEach(truncateAll);

  test('listDocuments 返回所有文档', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'a.md', '# A\n\n内容A', {
      embeddingProvider: hashProvider,
    });
    await uploadDocument(project.id, 'b.md', '# B\n\n内容B', {
      embeddingProvider: hashProvider,
    });

    const docs = await listDocuments(project.id);
    expect(docs.length).toBe(2);
  });

  test('deleteDocument 删除文档 + 关联 chunks', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    const r = await uploadDocument(project.id, 'a.md', '# A\n内容A', {
      embeddingProvider: hashProvider,
    });
    const ok = await deleteDocument(project.id, r.document.id);
    expect(ok).toBe(true);

    const docs = await listDocuments(project.id);
    expect(docs.length).toBe(0);

    // 关联 chunks 也应被清掉（按 documentId 查找）
    const chunks = await db
      .select()
      .from(schema.ragChunks)
      .where(eq(schema.ragChunks.documentId, r.document.id));
    expect(chunks.length).toBe(0);
  });

  test('deleteDocument 不存在返回 false', async () => {
    const { userId } = await registerTestUser(app);
    const project = await seedProject(userId);
    const ok = await deleteDocument(project.id, '00000000-0000-0000-0000-000000000000');
    expect(ok).toBe(false);
  });
});

describe('RAG 路由集成', () => {
  beforeEach(() => {
    // 防止其他测试套件污染的 _factory 单例，路由集成测试会走默认工厂
    resetEmbeddingFactory();
    return truncateAll();
  });

  test('POST /api/agent-projects/:id/rag/documents 上传', async () => {
    const { token, userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    const resp = await app.fetch(
      new Request(`http://test/api/agent-projects/${project.id}/rag/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileName: 'api.md', content: '# 测试\n内容' }),
      }),
    );
    expect(resp.ok).toBe(true);
    const body = (await resp.json()) as { data: { chunks: number; document: { id: string } } };
    expect(body.data.chunks).toBeGreaterThan(0);
    expect(body.data.document.id).toBeTruthy();
  });

  test('POST /api/agent-projects/:id/rag/search 检索', async () => {
    const { token, userId } = await registerTestUser(app);
    const project = await seedProject(userId);

    // 先上传
    await app.fetch(
      new Request(`http://test/api/agent-projects/${project.id}/rag/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileName: 'api.md', content: SAMPLE_MD }),
      }),
    );

    const resp = await app.fetch(
      new Request(`http://test/api/agent-projects/${project.id}/rag/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: '沙箱 agent', topK: 3 }),
      }),
    );
    expect(resp.ok).toBe(true);
    const body = (await resp.json()) as { data: Array<{ score: number }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('未鉴权访问返回 401', async () => {
    const resp = await app.fetch(
      new Request(`http://test/api/agent-projects/00000000-0000-0000-0000-000000000000/rag/documents`, {
        method: 'GET',
      }),
    );
    expect(resp.status).toBe(401);
  });

  test('他人项目访问返回 404', async () => {
    const { token, userId } = await registerTestUser(app);
    await seedProject(userId);
    // 第二个用户的项目
    const { userId: userId2 } = await registerTestUser(app);
    const project2 = await seedProject(userId2);

    const resp = await app.fetch(
      new Request(`http://test/api/agent-projects/${project2.id}/rag/documents`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(resp.status).toBe(404);
  });
});

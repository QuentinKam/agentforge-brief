// RAG 检索延迟压测 — PRD §M3-6：P95 < 200ms
// 压测脚本，不参与常规测试套件（手动执行：bun run bench:rag）
// 输出：检索延迟 P50/P95/P99 + 写入 README 的基准数据
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { uploadDocument, retrieve } from '../rag/service';
import { LocalHashEmbeddingProvider } from '../llm/embedding';

const hashProvider = new LocalHashEmbeddingProvider();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]!;
}

async function main() {
  console.log('[RAG bench] 准备：清空 + 创建项目 + 上传文档...');

  // 清空旧数据
  await db.execute(
    `TRUNCATE rag_chunks, rag_documents, agent_projects, users RESTART IDENTITY CASCADE`,
  );

  // 用户 + 项目
  const [user] = await db
    .insert(schema.users)
    .values({ email: 'bench@example.com', passwordHash: 'x', name: 'bench' })
    .returning();
  if (!user) throw new Error('user insert failed');
  const [project] = await db
    .insert(schema.agentProjects)
    .values({ userId: user.id, name: 'bench', provider: 'openai', model: 'gpt-4o-mini' })
    .returning();
  if (!project) throw new Error('project insert failed');

  // 上传 30 个文档（共 ~300 个 chunk）
  const docs: Array<{ name: string; content: string }> = [];
  const topics = ['安装', 'API', '沙箱', 'Skills', 'RAG', '数据库', '中间件', '前端', '部署', '安全'];
  for (let i = 0; i < 30; i++) {
    const topic = topics[i % topics.length]!;
    docs.push({ name: `doc-${i}-${topic}.md`, content: genMd(`${topic}-${i}`, 10) });
  }
  for (const d of docs) {
    await uploadDocument(project.id, d.name, d.content, { embeddingProvider: hashProvider });
  }

  // 总 chunk 数
  const chunks = await db
    .select({ id: schema.ragChunks.id })
    .from(schema.ragChunks)
    .where(eq(schema.ragChunks.agentId, project.id));
  console.log(`[RAG bench] 已上传 ${docs.length} 个文档，共 ${chunks.length} 个 chunk`);

  // 准备查询集
  const queries = [
    'bun 安装',
    'API 路由',
    '沙箱 安全',
    'Skill 工具',
    'RAG 检索',
    '数据库 连接',
    'Agent 运行',
    'pgvector',
    'Hono 中间件',
    'React 前端',
  ];

  // 预热 5 次（避免首次冷启动 + plan cache miss）
  for (let i = 0; i < 5; i++) {
    await retrieve(project.id, queries[i % queries.length]!, {
      topK: 5,
      embeddingProvider: hashProvider,
    });
  }

  // 正式压测 100 次
  const N = 100;
  const latencies: number[] = [];
  for (let i = 0; i < N; i++) {
    const q = queries[i % queries.length]!;
    const start = performance.now();
    await retrieve(project.id, q, { topK: 5, embeddingProvider: hashProvider });
    const ms = performance.now() - start;
    latencies.push(ms);
  }
  latencies.sort((a, b) => a - b);

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const max = latencies[latencies.length - 1]!;

  console.log(`[RAG bench] ${N} 次检索结果（${chunks.length} chunks，顺序扫描无索引）：`);
  console.log(`  avg: ${avg.toFixed(2)}ms`);
  console.log(`  P50: ${p50.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
  console.log(`  P99: ${p99.toFixed(2)}ms`);
  console.log(`  max: ${max.toFixed(2)}ms`);

  const pass = p95 < 200;
  console.log(
    `[RAG bench] P95 < 200ms 验收：${pass ? 'PASS ✓' : 'FAIL ✗'}（${p95.toFixed(2)}ms）`,
  );

  // 清理
  await db.execute(
    `TRUNCATE rag_chunks, rag_documents, agent_projects, users RESTART IDENTITY CASCADE`,
  );

  process.exit(pass ? 0 : 1);
}

function genMd(title: string, sections: number): string {
  const out: string[] = [`# ${title}`];
  for (let i = 1; i <= sections; i++) {
    out.push(`## ${i} 章节标题`);
    out.push(`这是 ${title} 的第 ${i} 段内容，用于 RAG 检索测试。包含关键词：${title}、bun、API。`);
    out.push('段落二：本平台基于 Hono + React + Bun 技术栈，使用 pgvector 做语义检索。');
    out.push('段落三：Agent 运行时通过 Bun.spawn 子进程沙箱执行代码，含超时控制。');
  }
  return out.join('\n\n');
}

main().catch((err) => {
  console.error('[RAG bench] 失败:', err);
  process.exit(1);
});

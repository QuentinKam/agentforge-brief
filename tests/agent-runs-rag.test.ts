// Agent 运行时 RAG 注入集成测试 — PRD §M3-5
// 验证：POST /api/agent-runs 时自动检索 RAG 知识库，注入到 LLM 上下文，并在 trace 中记录
import { test, expect, describe, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, schema } from '../server/src/db';
import { truncateAll, registerTestUser } from './helpers';
import fullApp from '../server/src/index';
import { createAgentRunRoutes } from '../server/src/routes/agent-runs';
import { uploadDocument } from '../server/src/rag/service';
import { LocalHashEmbeddingProvider, resetEmbeddingFactory } from '../server/src/llm/embedding';
import type { ProviderFactory, LLMProvider, ChatRequest, ChatResult } from '../server/src/llm/provider';

// Mock LLM Provider：记录每次 chat() 收到的 messages，避免外网调用
class MockLLM implements LLMProvider {
  readonly name = 'mock';
  public lastMessages: Array<{ role: string; content: string }> = [];
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.lastMessages = req.messages.map((m) => ({ role: m.role, content: m.content }));
    return {
      content: 'mock-response',
      tokens: 10,
      durationMs: 5,
      raw: null,
    };
  }
}

const mockLLM = new MockLLM();

// 自定义工厂：始终返回 mockLLM
const mockFactory: ProviderFactory = {
  get() {
    return mockLLM;
  },
  register() {
    /* no-op */
  },
};

const hashProvider = new LocalHashEmbeddingProvider();
const runApp = createAgentRunRoutes(mockFactory);

async function seedProject(userId: string) {
  const [project] = await db
    .insert(schema.agentProjects)
    .values({ userId, name: 'P-RAG-Run', provider: 'openai', model: 'gpt-4o-mini' })
    .returning();
  if (!project) throw new Error('project insert failed');
  return project;
}

async function callRun(
  token: string,
  agentId: string,
  input: string,
  ragOptions?: { enabled?: boolean; topK?: number },
) {
  const resp = await runApp.fetch(
    new Request('http://test/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agentId, input, ragOptions }),
    }),
  );
  if (!resp.ok) {
    const errBody = await resp.json();
    throw new Error(`run failed: ${JSON.stringify(errBody)}`);
  }
  return (await resp.json()) as { data: { id: string } };
}

describe('Agent 运行时 RAG 注入', () => {
  beforeEach(() => {
    mockLLM.lastMessages = [];
    resetEmbeddingFactory();
    return truncateAll();
  });

  test('有文档时 LLM 收到 system 消息（含 RAG 上下文）', async () => {
    const { token, userId } = await registerTestUser(fullApp);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'kb.md', '# 安装\n\n使用 bun install', {
      embeddingProvider: hashProvider,
    });

    await callRun(token, project.id, 'bun install');

    // mock LLM 应该收到 system + user 两条消息
    expect(mockLLM.lastMessages.length).toBe(2);
    expect(mockLLM.lastMessages[0]?.role).toBe('system');
    expect(mockLLM.lastMessages[0]?.content).toContain('知识库检索结果');
    expect(mockLLM.lastMessages[0]?.content).toContain('bun install');
    expect(mockLLM.lastMessages[1]?.role).toBe('user');
    expect(mockLLM.lastMessages[1]?.content).toBe('bun install');
  });

  test('无文档时不注入 system 消息', async () => {
    const { token, userId } = await registerTestUser(fullApp);
    const project = await seedProject(userId);

    await callRun(token, project.id, 'hello');

    // 无 RAG 上下文，只发送 user 消息
    expect(mockLLM.lastMessages.length).toBe(1);
    expect(mockLLM.lastMessages[0]?.role).toBe('user');
  });

  test('ragOptions.enabled=false 关闭注入', async () => {
    const { token, userId } = await registerTestUser(fullApp);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'kb.md', '# 安装\n\nbun install', {
      embeddingProvider: hashProvider,
    });

    await callRun(token, project.id, 'bun install', { enabled: false });

    expect(mockLLM.lastMessages.length).toBe(1);
    expect(mockLLM.lastMessages[0]?.role).toBe('user');
  });

  test('RAG 检索 + LLM 调用均落 step trace', async () => {
    const { token, userId } = await registerTestUser(fullApp);
    const project = await seedProject(userId);

    await uploadDocument(project.id, 'kb.md', '# 安装\n\nbun install', {
      embeddingProvider: hashProvider,
    });

    const { data } = await callRun(token, project.id, 'bun install');
    const steps = await db
      .select()
      .from(schema.agentRunSteps)
      .where(eq(schema.agentRunSteps.runId, data.id))
      .orderBy(schema.agentRunSteps.createdAt);

    // 应该有 rag_retrieval + llm_call 两条 step
    const types = steps.map((s) => s.stepType);
    expect(types).toContain('rag_retrieval');
    expect(types).toContain('llm_call');
    // rag_retrieval 应早于 llm_call
    const ragIdx = types.indexOf('rag_retrieval');
    const llmIdx = types.indexOf('llm_call');
    expect(ragIdx).toBeLessThan(llmIdx);

    // rag_retrieval step 的 output 应有 hits
    const ragStep = steps[ragIdx]!;
    const ragOut = ragStep.stepOutput as { hits: number; results: unknown[] };
    expect(ragOut.hits).toBeGreaterThan(0);
    expect(ragOut.results.length).toBeGreaterThan(0);

    // llm_call step 的 input 应记录 ragStepId 关联
    const llmStep = steps[llmIdx]!;
    const llmIn = llmStep.stepInput as { ragStepId?: string };
    expect(llmIn.ragStepId).toBeTruthy();
  });

  test('topK 限制 RAG 注入条数', async () => {
    const { token, userId } = await registerTestUser(fullApp);
    const project = await seedProject(userId);

    // 上传长文档产生多 chunk
    await uploadDocument(
      project.id,
      'long.md',
      `# A\n\n内容A\n\n# B\n\n内容B\n\n# C\n\n内容C\n\n# D\n\n内容D`,
      { embeddingProvider: hashProvider },
    );

    const { data } = await callRun(token, project.id, '内容', { topK: 2 });
    const steps = await db
      .select()
      .from(schema.agentRunSteps)
      .where(eq(schema.agentRunSteps.runId, data.id));
    const ragStep = steps.find((s) => s.stepType === 'rag_retrieval');
    const ragOut = ragStep?.stepOutput as { hits: number };
    expect(ragOut.hits).toBeLessThanOrEqual(2);
  });
});

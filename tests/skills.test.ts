// Skill 执行引擎测试 — TDD：关键词匹配 + 工具调用链 + JSON Schema 校验
import { test, expect, describe, beforeEach } from 'bun:test';
import { matchSkills, executeSkill } from '../server/src/skills/engine';
import { type ToolContext, registerTool, type ToolResult } from '../server/src/skills/registry';
import { db, schema } from '../server/src/db';
import { truncateAll, registerTestUser } from './helpers';
import app from '../server/src/index';
import type { AgentProject, Skill } from '../server/src/db/schema';

// 测试用 mock 工具，验证调用链
let lastCallInput: unknown = null;
let callCount = 0;

const mockToolHandler = async (input: unknown, _ctx: ToolContext): Promise<ToolResult> => {
  callCount++;
  lastCallInput = input;
  return { ok: true, data: { called: callCount, received: input } };
};

async function createProject(userId: string): Promise<AgentProject> {
  const [project] = await db
    .insert(schema.agentProjects)
    .values({ userId, name: 'P1', provider: 'openai', model: 'gpt-4o-mini' })
    .returning();
  if (!project) throw new Error('project insert failed');
  return project;
}

async function createSkill(
  agentId: string,
  overrides: Partial<NewSkillInput> = {},
): Promise<Skill> {
  const [skill] = await db
    .insert(schema.skills)
    .values({
      agentId,
      name: overrides.name ?? 'S1',
      triggerJson: overrides.triggerJson ?? { keywords: [] },
      toolChainJson: overrides.toolChainJson ?? [],
    })
    .returning();
  if (!skill) throw new Error('skill insert failed');
  return skill;
}

interface NewSkillInput {
  name?: string;
  triggerJson?: { keywords?: string[]; semantic?: string };
  toolChainJson?: Array<{ tool: string; description: string }>;
}

describe('Skill 关键词匹配', () => {
  beforeEach(truncateAll);

  test('关键词命中返回 Skill', async () => {
    const { userId } = await registerTestUser(app);
    const project = await createProject(userId);
    const skill = await createSkill(project.id, {
      name: '搜索',
      triggerJson: { keywords: ['搜索', 'grep'] },
      toolChainJson: [{ tool: 'mock_tool', description: '测试' }],
    });

    const matches = await matchSkills(project.id, '帮我搜索一下 foo');
    expect(matches.length).toBe(1);
    expect(matches[0]?.skill.id).toBe(skill.id);
    expect(matches[0]?.matchedKeyword).toBe('搜索');
  });

  test('未命中返回空', async () => {
    const { userId } = await registerTestUser(app);
    const project = await createProject(userId);
    await createSkill(project.id, {
      name: '搜索',
      triggerJson: { keywords: ['搜索'] },
    });
    const matches = await matchSkills(project.id, '不相关的文本');
    expect(matches.length).toBe(0);
  });
});

describe('Skill 工具调用链', () => {
  beforeEach(() => {
    callCount = 0;
    lastCallInput = null;
    registerTool('mock_tool', mockToolHandler);
    return truncateAll();
  });

  test('按 toolChain 顺序调用工具，输出传递给下一步', async () => {
    const { userId } = await registerTestUser(app);
    const project = await createProject(userId);
    const skill = await createSkill(project.id, {
      name: '链式',
      toolChainJson: [
        { tool: 'mock_tool', description: 'step1' },
        { tool: 'mock_tool', description: 'step2' },
      ],
    });

    const result = await executeSkill(skill, { initial: 'hello' }, { cwd: '/tmp', userId });

    expect(callCount).toBe(2);
    expect(result.steps.length).toBe(2);
    expect(result.steps[0]?.tool).toBe('mock_tool');
    expect(result.steps[1]?.tool).toBe('mock_tool');
    expect(lastCallInput).toEqual({ called: 1, received: { initial: 'hello' } });
  });

  test('工具不存在时返回错误并停止', async () => {
    const { userId } = await registerTestUser(app);
    const project = await createProject(userId);
    const skill = await createSkill(project.id, {
      name: '坏工具',
      toolChainJson: [{ tool: 'nonexistent_tool', description: 'x' }],
    });

    const result = await executeSkill(skill, 'input', { cwd: '/tmp', userId });
    expect(result.steps.length).toBe(1);
    expect(result.steps[0]?.result.ok).toBe(false);
    expect(result.steps[0]?.result.error).toContain('未注册');
  });

  test('工具 ok=false 时链路中断', async () => {
    const failingHandler = async (): Promise<ToolResult> => ({
      ok: false,
      data: null,
      error: 'mock 失败',
    });
    registerTool('failing_tool', failingHandler);
    let secondCalled = false;
    registerTool('second_tool', async () => {
      secondCalled = true;
      return { ok: true, data: 'second' };
    });

    const { userId } = await registerTestUser(app);
    const project = await createProject(userId);
    const skill = await createSkill(project.id, {
      name: '失败中断',
      toolChainJson: [
        { tool: 'failing_tool', description: 'step1' },
        { tool: 'second_tool', description: 'step2' },
      ],
    });

    const result = await executeSkill(skill, 'input', { cwd: '/tmp', userId });
    expect(result.steps.length).toBe(1);
    expect(secondCalled).toBe(false);
  });
});

describe('内置工具注册', () => {
  test('registerBuiltinTools 后 4 个工具可用', async () => {
    const { registerBuiltinTools, listTools } = await import('../server/src/skills/registry');
    registerBuiltinTools();
    const tools = listTools();
    expect(tools).toContain('code_search');
    expect(tools).toContain('file_io');
    expect(tools).toContain('shell_exec');
    expect(tools).toContain('http_request');
  });
});

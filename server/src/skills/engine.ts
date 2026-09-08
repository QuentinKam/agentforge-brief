// Skill 执行引擎 — PRD §3.2：LLM 决定调用 → 参数 Zod 校验 → 执行工具 → 结果返回 LLM → 下一步决策
// M2 简化版：
//   1. 不真调 LLM 做「tool 决策」（M3 加），而是按 skill.triggerJson 关键词匹配
//   2. 工具调用是同步的（M3 改为多步 LLM 决策循环）
//   3. 落 agent_run_steps 多条 step_type=tool_call
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  type ToolContext,
  type ToolResult,
  getTool,
  registerBuiltinTools,
} from './registry';

// 防止重复注册
let _initialized = false;
function ensureInit() {
  if (!_initialized) {
    registerBuiltinTools();
    _initialized = true;
  }
}

export interface SkillMatchResult {
  skill: typeof schema.skills.$inferSelect;
  matchedBy: 'keyword' | 'semantic';
  matchedKeyword?: string;
}

/** 按 input 文本匹配 Agent 的 Skills（关键词触发） */
export async function matchSkills(agentId: string, input: string): Promise<SkillMatchResult[]> {
  ensureInit();
  const skills = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.agentId, agentId));
  const results: SkillMatchResult[] = [];
  for (const skill of skills) {
    const trigger = skill.triggerJson as { keywords?: string[]; semantic?: string };
    if (trigger?.keywords) {
      for (const kw of trigger.keywords) {
        if (input.toLowerCase().includes(kw.toLowerCase())) {
          results.push({ skill, matchedBy: 'keyword', matchedKeyword: kw });
          break;
        }
      }
    }
    // M2 暂不实现 semantic 匹配（需 embedding，M3 RAG 上来后用）
  }
  return results;
}

/** 执行单个 Skill：按 toolChain 调用每个工具，参数从 input 中按 tool 名取 */
export async function executeSkill(
  skill: typeof schema.skills.$inferSelect,
  input: unknown,
  ctx: ToolContext,
): Promise<{
  steps: Array<{ tool: string; result: ToolResult; durationMs: number }>;
  finalOutput: string;
}> {
  ensureInit();
  const toolChain = (skill.toolChainJson as Array<{ tool: string; description: string }>) ?? [];
  const steps: Array<{ tool: string; result: ToolResult; durationMs: number }> = [];
  let lastData: unknown = input;

  for (const step of toolChain) {
    const handler = getTool(step.tool);
    const start = Date.now();
    if (!handler) {
      const result: ToolResult = {
        ok: false,
        data: null,
        error: `未注册的工具: ${step.tool}`,
      };
      steps.push({ tool: step.tool, result, durationMs: 0 });
      lastData = result;
      break;
    }
    // 简化：每步接收上一步输出作为输入（首步接收原始 input）
    const result = await handler(lastData, ctx);
    const durationMs = Date.now() - start;
    steps.push({ tool: step.tool, result, durationMs });
    lastData = result.data;
    if (!result.ok) break;
  }

  return {
    steps,
    finalOutput: typeof lastData === 'string' ? lastData : JSON.stringify(lastData),
  };
}

// Token 估算工具 — M2 上下文预览用
// 不依赖 tokenizer 库（避免引入 onnx 等 heavy 依赖）；用启发式估算：
// - 英文：~4 chars / token（OpenAI BPE 经验值）
// - 中文：~1.5 chars / token（CJK 编码后 token 较密）
// 误差 ±20%，足够预览展示，M5 可换精确 tokenizer
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    // CJK 统一汉字 + 假名 + 韩文
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

/** 计算最终发给 LLM 的完整上下文的 token 数 */
export interface ContextPreview {
  sections: Array<{ label: string; content: string; tokens: number }>;
  totalTokens: number;
}

export function buildContextPreview(input: {
  systemPrompt?: string | null;
  rules?: string[] | null;
  constraints?: Record<string, unknown> | null;
  userMessage?: string;
}): ContextPreview {
  const sections: ContextPreview['sections'] = [];
  let total = 0;

  if (input.systemPrompt) {
    const tokens = estimateTokens(input.systemPrompt);
    sections.push({ label: 'System Prompt', content: input.systemPrompt, tokens });
    total += tokens;
  }
  if (input.rules && input.rules.length > 0) {
    const joined = input.rules.map((r, i) => `## Rule ${i + 1}\n${r}`).join('\n\n');
    const tokens = estimateTokens(joined);
    sections.push({ label: `Rules (${input.rules.length})`, content: joined, tokens });
    total += tokens;
  }
  if (input.constraints && Object.keys(input.constraints).length > 0) {
    const json = JSON.stringify(input.constraints, null, 2);
    const tokens = estimateTokens(json);
    sections.push({ label: 'Constraints', content: json, tokens });
    total += tokens;
  }
  if (input.userMessage) {
    const tokens = estimateTokens(input.userMessage);
    sections.push({ label: 'User Message', content: input.userMessage, tokens });
    total += tokens;
  }

  return { sections, totalTokens: total };
}

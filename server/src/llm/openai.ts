// OpenAI 兼容 API Provider — POST /chat/completions
// 兼容官方 OpenAI + 任何 OpenAI 兼容端点（如本地 vLLM、第三方网关）
import 'dotenv/config';
import {
  type ChatRequest,
  type ChatResult,
  type LLMProvider,
  MissingApiKeyError,
  ProviderError,
} from './provider';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(
    private readonly opts: {
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
    } = {},
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const apiKey = this.opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError('openai');
    }
    const baseUrl = this.opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const model = req.model ?? this.opts.defaultModel ?? process.env.OPENAI_DEFAULT_MODEL ?? 'gpt-4o-mini';

    const start = Date.now();
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens,
        }),
      });
    } catch (err) {
      throw new ProviderError('openai', `OpenAI 请求失败: ${(err as Error).message}`, err);
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new ProviderError('openai', `OpenAI HTTP ${resp.status}: ${text}`, {
        status: resp.status,
        body: text,
      });
    }

    // JSON 结构来自上游 OpenAI API；类型不固定；AGENTS.md §3：any 需注释说明原因
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content ?? '';
    const tokens = data.usage?.total_tokens ?? 0;
    return {
      content,
      tokens,
      durationMs: Date.now() - start,
      raw: data,
    };
  }
}

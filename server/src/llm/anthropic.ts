// Anthropic Claude Provider — POST /v1/messages
import 'dotenv/config';
import {
  type ChatRequest,
  type ChatResult,
  type LLMProvider,
  MissingApiKeyError,
  ProviderError,
} from './provider';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly opts: {
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
    } = {},
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const apiKey = this.opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError('anthropic');
    }
    const baseUrl = this.opts.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';
    const model =
      req.model ??
      this.opts.defaultModel ??
      process.env.ANTHROPIC_DEFAULT_MODEL ??
      'claude-3-5-haiku-latest';

    // Anthropic 不在 messages 里混 system；单独走 system 字段
    const system = req.messages.find((m) => m.role === 'system')?.content;
    const userMessages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const start = Date.now();
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system,
          messages: userMessages,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.7,
        }),
      });
    } catch (err) {
      throw new ProviderError('anthropic', `Anthropic 请求失败: ${(err as Error).message}`, err);
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new ProviderError('anthropic', `Anthropic HTTP ${resp.status}: ${text}`, {
        status: resp.status,
        body: text,
      });
    }

    // Anthropic 响应结构；AGENTS.md §3：any 需注释说明原因
    const data = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const content = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    return {
      content,
      tokens: inputTokens + outputTokens,
      durationMs: Date.now() - start,
      raw: data,
    };
  }
}

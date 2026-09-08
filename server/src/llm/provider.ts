// AI Provider 抽象层 — PRD §M1 验收点⑤：支持多 provider 切换
// 设计：统一 chat() 接口，OpenAI / Anthropic 各自实现，工厂按 provider 名返回实例
// 真实 API key 缺失时返回明确错误，便于本地无 key 时仍可启动后端

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  /** 总 token 数（输入 + 输出），provider 不返回时为 0 */
  tokens: number;
  /** provider 调用耗时（毫秒） */
  durationMs: number;
  /** 原始响应（调试/日志用，类型不固定；AGENTS.md §3：any 需注释说明原因） */
  raw: unknown;
}

export interface LLMProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class MissingApiKeyError extends ProviderError {
  constructor(provider: string) {
    super(
      provider,
      `${provider} API key 未配置，请检查 .env 中的 *_API_KEY 是否填写`,
    );
    this.name = 'MissingApiKeyError';
  }
}

export interface ProviderFactory {
  get(name: string): LLMProvider;
  register(name: string, provider: LLMProvider): void;
}

/** 默认工厂实例，路由层用这个 */
export function createProviderFactory(): ProviderFactory {
  const registry = new Map<string, LLMProvider>();
  return {
    get(name: string): LLMProvider {
      const key = name.toLowerCase();
      const p = registry.get(key);
      if (!p) {
        throw new ProviderError(
          key,
          `未注册的 AI provider: ${name}。已注册: ${[...registry.keys()].join(', ') || '(空)'}`,
        );
      }
      return p;
    },
    register(name: string, provider: LLMProvider): void {
      registry.set(name.toLowerCase(), provider);
    },
  };
}

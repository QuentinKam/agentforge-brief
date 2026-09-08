// Embedding Provider 抽象层 — PRD §3.4
// 设计：统一 embed() 接口；OpenAI 主，本地降级（无 API key 时启用，仅用于流程闭环）
// 维度固定 1536（对齐 OpenAI text-embedding-3-small）
// 注意：本地降级为 hash-based 伪 embedding，无真实语义能力，仅供测试 / 无 key 启动验证流程
// 真实使用必须配置 OPENAI_API_KEY；M5 可替换为 bge-small 等本地模型

import 'dotenv/config';

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
  readonly dimension: number;
}

export class EmbeddingProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

/** OpenAI text-embedding-3-small：1536 维 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimension = 1536;

  constructor(
    private readonly opts: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    } = {},
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const apiKey = this.opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new EmbeddingProviderError('openai', 'OPENAI_API_KEY 未配置');
    }
    const baseUrl = this.opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const model = this.opts.model ?? process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';

    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
    } catch (err) {
      throw new EmbeddingProviderError('openai', `请求失败: ${(err as Error).message}`, err);
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new EmbeddingProviderError('openai', `HTTP ${resp.status}: ${text}`, {
        status: resp.status,
        body: text,
      });
    }
    // OpenAI 返回 { data: [{ embedding: number[] }] }
    const data = (await resp.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const result = data.data?.map((d) => d.embedding ?? []) ?? [];
    if (result.length !== texts.length) {
      throw new EmbeddingProviderError(
        'openai',
        `返回维度不匹配：期望 ${texts.length} 条，实际 ${result.length}`,
      );
    }
    return result;
  }
}

/**
 * 本地降级 Embedding：hash-based 伪向量
 * - 不具备语义能力，cosine 检索准确度低
 * - 仅用于：测试 / 无 API key 时验证 RAG 流程闭环
 * - 实现方式：对每个 token 取 hash → 投影到 1536 维 → L2 归一化
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local-hash';
  readonly dimension = 1536;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Array(this.dimension).fill(0);
    // 简单分词：小写 + 按非字母数字拆分
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/)
      .filter(Boolean);
    for (const token of tokens) {
      // 32 位 hash → 投影到 1536 维的某个位置
      let hash = 5381;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) + hash + token.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(hash) % this.dimension;
      const sign = hash < 0 ? -1 : 1;
      vec[idx] += sign;
    }
    // L2 归一化，使 cosine 可计算且范围 [-1, 1]
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }
    return vec;
  }
}

export interface EmbeddingFactory {
  /** 返回可用的 embedding provider：优先 OpenAI，无 key 时降级到本地 */
  get(): EmbeddingProvider;
}

/** 默认工厂：启动时根据 .env 决定使用哪个 provider */
export function createEmbeddingFactory(
  openai?: OpenAIEmbeddingProvider,
  localFallback = new LocalHashEmbeddingProvider(),
): EmbeddingFactory {
  let resolved: EmbeddingProvider | undefined;
  return {
    get() {
      if (resolved) return resolved;
      // 显式传入的 openai 优先（测试用），否则按 .env 配置决定
      if (openai) {
        resolved = openai;
        return resolved;
      }
      // 检测 OpenAI API key 是否配置（空字符串视为未配置）
      const raw = process.env.OPENAI_API_KEY;
      const hasKey = typeof raw === 'string' && raw.trim().length > 0;
      resolved = hasKey ? new OpenAIEmbeddingProvider() : localFallback;
      return resolved;
    },
  };
}

let _factory: EmbeddingFactory | undefined;

/** 单例工厂 */
export function getEmbeddingFactory(): EmbeddingFactory {
  if (_factory) return _factory;
  _factory = createEmbeddingFactory();
  return _factory;
}

/** 重置单例（测试用） */
export function resetEmbeddingFactory(): void {
  _factory = undefined;
}

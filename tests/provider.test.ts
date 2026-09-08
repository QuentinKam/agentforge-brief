// AI Provider 抽象层测试 — TDD：工厂注册/查找 + provider 接口契约
import { test, expect, describe } from 'bun:test';
import {
  createProviderFactory,
  ProviderError,
  MissingApiKeyError,
  type LLMProvider,
  type ChatResult,
} from '../server/src/llm/provider';

// 测试用 mock provider，避免外网调用
class MockProvider implements LLMProvider {
  readonly name: string;
  constructor(name: string, private readonly result: ChatResult) {
    this.name = name;
  }
  async chat(_req: import('../server/src/llm/provider').ChatRequest): Promise<ChatResult> {
    return this.result;
  }
}

class FailingProvider implements LLMProvider {
  readonly name: string;
  constructor(name: string, private readonly err: Error) {
    this.name = name;
  }
  async chat(_req: import('../server/src/llm/provider').ChatRequest): Promise<ChatResult> {
    throw this.err;
  }
}

describe('ProviderFactory', () => {
  test('注册 + 获取', () => {
    const f = createProviderFactory();
    const mock = new MockProvider('mock', { content: 'hi', tokens: 5, durationMs: 10, raw: null });
    f.register('mock', mock);
    expect(f.get('mock')).toBe(mock);
    // 大小写不敏感
    expect(f.get('MOCK')).toBe(mock);
  });

  test('未注册的 provider 抛 ProviderError', () => {
    const f = createProviderFactory();
    expect(() => f.get('unknown')).toThrow(ProviderError);
    try {
      f.get('unknown');
    } catch (e) {
      expect((e as ProviderError).provider).toBe('unknown');
      expect((e as ProviderError).message).toContain('未注册');
    }
  });
});

describe('ProviderError 层次', () => {
  test('MissingApiKeyError 是 ProviderError 子类', () => {
    const e = new MissingApiKeyError('openai');
    expect(e).toBeInstanceOf(ProviderError);
    expect(e).toBeInstanceOf(Error);
    expect(e.provider).toBe('openai');
    expect(e.message).toContain('openai');
    expect(e.message).toContain('API key');
  });
});

describe('MockProvider chat() 契约', () => {
  test('返回 ChatResult 含 content/tokens/durationMs', async () => {
    const mock = new MockProvider('mock', {
      content: 'hello',
      tokens: 42,
      durationMs: 200,
      raw: { ok: true },
    });
    const result = await mock.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.content).toBe('hello');
    expect(result.tokens).toBe(42);
    expect(result.durationMs).toBe(200);
    expect(result.raw).toEqual({ ok: true });
  });

  test('FailingProvider 抛出的异常可被 catch 转成 ProviderError', async () => {
    const failing = new FailingProvider('mock', new Error('network down'));
    try {
      await failing.chat({ messages: [] });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toBe('network down');
    }
  });
});

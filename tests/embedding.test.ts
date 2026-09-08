// Embedding Provider 测试 — TDD：PRD §3.4
import { test, expect, describe } from 'bun:test';
import {
  OpenAIEmbeddingProvider,
  LocalHashEmbeddingProvider,
  createEmbeddingFactory,
  getEmbeddingFactory,
  resetEmbeddingFactory,
} from '../server/src/llm/embedding';

describe('LocalHashEmbeddingProvider', () => {
  test('输出固定 1536 维向量', async () => {
    const p = new LocalHashEmbeddingProvider();
    const out = await p.embed(['hello world']);
    const vec = out[0]!;
    expect(vec.length).toBe(1536);
  });

  test('空文本返回全零向量（不报错）', async () => {
    const p = new LocalHashEmbeddingProvider();
    const out = await p.embed(['']);
    const vec = out[0]!;
    expect(vec.length).toBe(1536);
    const allZero = vec.every((v) => v === 0);
    expect(allZero).toBe(true);
  });

  test('相同文本 embedding 相同', async () => {
    const p = new LocalHashEmbeddingProvider();
    const a = (await p.embed(['same text']))[0]!;
    const b = (await p.embed(['same text']))[0]!;
    expect(a).toEqual(b);
  });

  test('批量 embedding 输出顺序匹配', async () => {
    const p = new LocalHashEmbeddingProvider();
    const vecs = await p.embed(['aaa', 'bbb', 'ccc']);
    expect(vecs.length).toBe(3);
    // 每个不同文本至少有一个非零项
    expect(vecs[0]).not.toEqual(vecs[1]);
    expect(vecs[1]).not.toEqual(vecs[2]);
  });

  test('L2 范数约为 1（归一化）', async () => {
    const p = new LocalHashEmbeddingProvider();
    const out = await p.embed(['a b c d e f g']);
    const vec = out[0]!;
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    // 浮点数比较
    expect(Math.abs(norm - 1)).toBeLessThan(0.01);
  });
});

describe('OpenAIEmbeddingProvider', () => {
  test('无 API key 抛错', async () => {
    const prevKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const p = new OpenAIEmbeddingProvider();
      let threw = false;
      try {
        await p.embed(['test']);
      } catch (e) {
        threw = true;
        expect((e as Error).message).toMatch(/OPENAI_API_KEY/);
      }
      expect(threw).toBe(true);
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
    }
  });
});

describe('EmbeddingFactory 工厂', () => {
  test('无 OPENAI_API_KEY 时降级到本地', () => {
    const prevKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetEmbeddingFactory();
    try {
      const factory = getEmbeddingFactory();
      const provider = factory.get();
      expect(provider.name).toBe('local-hash');
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
      resetEmbeddingFactory();
    }
  });

  test('有 OPENAI_API_KEY 时使用 OpenAI', () => {
    const prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    resetEmbeddingFactory();
    try {
      const factory = getEmbeddingFactory();
      const provider = factory.get();
      expect(provider.name).toBe('openai');
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
      resetEmbeddingFactory();
    }
  });

  test('createEmbeddingFactory 显式传入 provider 优先级', () => {
    const factory = createEmbeddingFactory(
      new OpenAIEmbeddingProvider({ apiKey: 'sk-test' }),
    );
    expect(factory.get().name).toBe('openai');
  });
});

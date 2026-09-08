// Token 估算工具测试 — TDD：上下文预览
import { test, expect, describe } from 'bun:test';
import { estimateTokens, buildContextPreview } from '../server/src/lib/tokens';

describe('estimateTokens', () => {
  test('空字符串返回 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('纯英文按 ~4 chars/token', () => {
    const text = 'hello world this is a test'; // 26 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(10);
  });

  test('纯中文按 ~1.5 chars/token', () => {
    const text = '你好世界这是一个测试'; // 10 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThanOrEqual(7); // 10/1.5 = 6.67 -> 7
    expect(tokens).toBeLessThanOrEqual(8);
  });

  test('中英混合按各自规则分别计算', () => {
    const text = 'hello 你好';
    const tokens = estimateTokens(text);
    // 5 英文 / 4 = 1.25 + 2 中文 / 1.5 = 1.33 = 2.58 -> 3
    expect(tokens).toBeGreaterThanOrEqual(2);
    expect(tokens).toBeLessThanOrEqual(4);
  });
});

describe('buildContextPreview', () => {
  test('空输入返回 0 tokens', () => {
    const result = buildContextPreview({});
    expect(result.sections.length).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  test('各段独立计入', () => {
    const result = buildContextPreview({
      systemPrompt: 'You are a helpful assistant.',
      rules: ['Rule 1: be concise.', 'Rule 2: use code blocks.'],
      constraints: { maxTokens: 1000 },
      userMessage: '帮我搜索 foo',
    });
    expect(result.sections.length).toBe(4);
    expect(result.sections[0]?.label).toBe('System Prompt');
    expect(result.sections[1]?.label).toContain('Rules');
    expect(result.sections[2]?.label).toBe('Constraints');
    expect(result.sections[3]?.label).toBe('User Message');
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  test('null/空数组字段不计入', () => {
    const result = buildContextPreview({
      systemPrompt: null,
      rules: [],
      constraints: {},
    });
    expect(result.sections.length).toBe(0);
  });
});

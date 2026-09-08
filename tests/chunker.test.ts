// Chunker 分块器测试 — TDD：PRD §3.4
import { test, expect, describe } from 'bun:test';
import { chunkDocument } from '../server/src/rag/chunker';

describe('Markdown 分块', () => {
  test('按 # 标题切分', () => {
    const content = `# 第一章

第一段内容。

## 第二节

第二段内容。

# 第二章

第三章内容。
`;
    const chunks = chunkDocument(content, 'markdown', 'test.md');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const headings = chunks.map((c) => c.metadata.heading);
    expect(headings).toContain('第一章');
    expect(headings).toContain('第二章');
    // 第二节作为第一章内的子标题，可能合并在第一章的 chunk 中
  });

  test('无标题的文档作为单个 section', () => {
    const content = 'just some text without any heading';
    const chunks = chunkDocument(content, 'markdown', 'noheading.md');
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.metadata.type).toBe('markdown');
  });

  test('chunk metadata 含 lineStart / lineEnd / filePath', () => {
    const content = `# Title

body line`;
    const chunks = chunkDocument(content, 'markdown', 'docs.md');
    const first = chunks[0]!;
    expect(first.metadata.filePath).toBe('docs.md');
    expect(first.metadata.lineStart).toBeGreaterThanOrEqual(1);
    expect(first.metadata.lineEnd).toBeGreaterThanOrEqual(first.metadata.lineStart!);
  });
});

describe('Code 分块（TypeScript）', () => {
  test('按 export function 切分', () => {
    const content = `import { x } from './y';

export function foo() {
  return 1;
}

export function bar() {
  return 2;
}

export const baz = 3;
`;
    const chunks = chunkDocument(content, 'typescript', 'test.ts');
    // 至少切出 foo / bar / baz 三块 + import 头
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.metadata.type).toBe('code');
      expect(c.metadata.filePath).toBe('test.ts');
    }
  });

  test('超长函数按行切分', () => {
    const long = 'export function big() {\n' + '  let s = 0;\n'.repeat(200) + '}\n';
    const chunks = chunkDocument(long, 'typescript', 'big.ts', {
      chunkSize: 500,
      overlap: 50,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('纯文本兜底', () => {
  test('无扩展名 / .txt 走纯文本策略', () => {
    const content = 'a'.repeat(2000);
    const chunks = chunkDocument(content, 'text', 'notes.txt', {
      chunkSize: 500,
      overlap: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.metadata.type).toBe('text');
  });
});

describe('JSON 文件', () => {
  test('按 chunkSize 切分 JSON', () => {
    const content = '{"a":1,"b":2,"c":3,"d":4,"e":5,"f":6,"g":7,"h":8,"i":9,"j":10}';
    const chunks = chunkDocument(content, 'json', 'config.json', {
      chunkSize: 30,
      overlap: 0,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

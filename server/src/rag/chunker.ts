// 文档分块器 — PRD §3.4：按语义边界分块（Markdown 按标题、代码按函数）
// 可配置 chunkSize（字符数上限）和 overlap（相邻块的重叠字符数）
// 输出：{ content, metadata } 数组，metadata 含 heading/lineStart/lineEnd/type

import type { RagChunkMetadata } from '../db/schema';

export interface ChunkResult {
  content: string;
  metadata: RagChunkMetadata;
}

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 200;

/** 主入口：根据 fileType 调度不同分块策略 */
export function chunkDocument(
  content: string,
  fileType: string,
  fileName: string,
  opts: ChunkOptions = {},
): ChunkResult[] {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  if (fileType === 'markdown' || fileName.endsWith('.md')) {
    return chunkMarkdown(content, fileName, chunkSize, overlap);
  }
  if (
    fileName.endsWith('.ts') ||
    fileName.endsWith('.tsx') ||
    fileName.endsWith('.js') ||
    fileName.endsWith('.jsx')
  ) {
    return chunkCode(content, fileName, 'typescript', chunkSize, overlap);
  }
  if (fileName.endsWith('.json')) {
    return chunkCode(content, fileName, 'json', chunkSize, overlap);
  }
  return chunkPlainText(content, fileName, chunkSize, overlap);
}

/** Markdown 分块：按 # / ## / ### 标题切分；过长再按段落补切 */
function chunkMarkdown(
  content: string,
  fileName: string,
  chunkSize: number,
  overlap: number,
): ChunkResult[] {
  const lines = content.split('\n');
  const sections: Array<{ heading: string; start: number; end: number }> = [];
  let curHeading = '';
  let curStart = -1;
  let hasOpen = false;

  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      if (hasOpen) {
        sections.push({ heading: curHeading, start: curStart, end: i - 1 });
      }
      curHeading = m[2] ?? `heading-${i}`;
      curStart = i;
      hasOpen = true;
    }
  });
  if (hasOpen) {
    sections.push({ heading: curHeading, start: curStart, end: lines.length - 1 });
  }
  // 无标题的文档 → 整篇当一个 section
  if (sections.length === 0) {
    sections.push({ heading: fileName, start: 0, end: lines.length - 1 });
  }

  const results: ChunkResult[] = [];
  let chunkIndex = 0;
  for (const sec of sections) {
    const body = lines.slice(sec.start, sec.end + 1).join('\n');
    // 超过 chunkSize 的 section 再按段落切
    if (body.length <= chunkSize) {
      results.push({
        content: body,
        metadata: {
          filePath: fileName,
          type: 'markdown',
          heading: sec.heading,
          lineStart: sec.start + 1,
          lineEnd: sec.end + 1,
        },
      });
      chunkIndex++;
    } else {
      const sub = chunkByParagraph(body, chunkSize, overlap);
      sub.forEach((s) => {
        results.push({
          content: `${sec.heading}\n${s.text}`,
          metadata: {
            filePath: fileName,
            type: 'markdown',
            heading: sec.heading,
            lineStart: sec.start + 1 + (s.offsetLines ?? 0),
            lineEnd: sec.start + 1 + (s.offsetLines ?? 0) + s.lineCount - 1,
          },
        });
        chunkIndex++;
      });
    }
  }
  return results;
}

/** 代码分块：按函数 / 类定义切分；过长再按行号切 */
function chunkCode(
  content: string,
  fileName: string,
  _lang: 'typescript' | 'json',
  chunkSize: number,
  overlap: number,
): ChunkResult[] {
  const lines = content.split('\n');
  // 关键边界：export function / export const / function / class / interface / type
  // 注：JSON 文件按括号深度切分（这里简化为直接按 chunkSize 切）
  const boundaryRe =
    /^(export\s+)?(async\s+)?(function|class|interface|type|const|let)\s+/;

  const boundaries: number[] = [0];
  lines.forEach((line, i) => {
    if (i > 0 && boundaryRe.test(line.trim())) {
      boundaries.push(i);
    }
  });

  const results: ChunkResult[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = i + 1 < boundaries.length ? boundaries[i + 1]! - 1 : lines.length - 1;
    const body = lines.slice(start, end + 1).join('\n');
    if (!body.trim()) continue;

    if (body.length <= chunkSize) {
      results.push({
        content: body,
        metadata: {
          filePath: fileName,
          type: 'code',
          lineStart: start + 1,
          lineEnd: end + 1,
        },
      });
    } else {
      // 超长：按行切分，保留 chunkSize
      const sub = chunkByLine(body, chunkSize, overlap);
      sub.forEach((s) => {
        results.push({
          content: s.text,
          metadata: {
            filePath: fileName,
            type: 'code',
            lineStart: start + 1 + s.offsetLines!,
            lineEnd: start + 1 + s.offsetLines! + s.lineCount - 1,
          },
        });
      });
    }
  }
  return results;
}

/** 纯文本兜底分块 */
function chunkPlainText(
  content: string,
  fileName: string,
  chunkSize: number,
  overlap: number,
): ChunkResult[] {
  const sub = chunkByLine(content, chunkSize, overlap);
  return sub.map((s) => ({
    content: s.text,
    metadata: {
      filePath: fileName,
      type: 'text',
      lineStart: 1 + (s.offsetLines ?? 0),
      lineEnd: 1 + (s.offsetLines ?? 0) + s.lineCount - 1,
    },
  }));
}

interface SubChunk {
  text: string;
  offsetLines?: number;
  lineCount: number;
}

/** 按段落 + chunkSize 切分（用于 section 过长时） */
function chunkByParagraph(text: string, chunkSize: number, overlap: number): SubChunk[] {
  const paragraphs = text.split(/\n\s*\n/);
  const results: SubChunk[] = [];
  let buf = '';
  let lineOffset = 0;
  let lineCount = 0;

  const push = () => {
    if (buf) {
      results.push({ text: buf, offsetLines: lineOffset, lineCount });
      lineOffset += lineCount + 1; // +1 for空行
      buf = '';
      lineCount = 0;
    }
  };

  for (const p of paragraphs) {
    const pLines = p.split('\n').length;
    if (buf.length + p.length > chunkSize && buf) {
      push();
      // overlap：保留上一段末尾
      if (overlap > 0) {
        const tail = buf.slice(-overlap);
        buf = tail + '\n\n' + p;
        lineCount = tail.split('\n').length + pLines;
      } else {
        buf = p;
        lineCount = pLines;
      }
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
      lineCount += pLines + (buf ? 1 : 0);
    }
  }
  push();
  return results;
}

/** 按行切分（用于 code/text 兜底） */
function chunkByLine(text: string, chunkSize: number, overlap: number): SubChunk[] {
  const lines = text.split('\n');
  const results: SubChunk[] = [];
  let i = 0;
  while (i < lines.length) {
    let buf = '';
    let start = i;
    while (i < lines.length && buf.length + lines[i]!.length + 1 <= chunkSize) {
      buf += (buf ? '\n' : '') + lines[i];
      i++;
    }
    if (!buf) {
      // 单行就超长：按 chunkSize 切分多段，每段前进 (chunkSize - overlap)
      const superLong = lines[i]!;
      const step = Math.max(1, chunkSize - overlap);
      let off = 0;
      while (off < superLong.length) {
        const piece = superLong.slice(off, off + chunkSize);
        results.push({
          text: piece,
          offsetLines: start,
          lineCount: 1,
        });
        off += step;
      }
      i++;
    } else {
      results.push({
        text: buf,
        offsetLines: start,
        lineCount: i - start,
      });
    }
    // overlap：回退若干行（仅在多行模式下生效）
    if (overlap > 0 && i < lines.length && results.length > 0) {
      const back = Math.max(1, Math.floor(overlap / 80));
      i = Math.max(start + 1, i - back);
    }
  }
  return results;
}

// RAG 服务 — PRD §3.4：文档上传 → 分块 → embedding → pgvector 入库；检索：cosine + metadata 过滤
// 对外暴露：
//   - uploadDocument(agentId, fileName, content, opts?): 文档入库
//   - retrieve(agentId, query, topK, filters?): 检索
//   - listDocuments(agentId)
//   - deleteDocument(agentId, documentId)

import { createHash } from 'node:crypto';
import { and, cosineDistance, desc, eq, sql } from 'drizzle-orm';
import { db, schema, type RagChunkMetadata } from '../db';
import { chunkDocument } from './chunker';
import { getEmbeddingFactory, type EmbeddingProvider } from '../llm/embedding';

export interface UploadResult {
  document: {
    id: string;
    fileName: string;
    fileType: string;
    contentHash: string;
    chunkCount: number;
  };
  chunks: number;
  embeddingProvider: string;
}

export interface RetrieveResult {
  chunk: {
    id: string;
    content: string;
    documentId: string;
    chunkIndex: number;
    metadata: RagChunkMetadata;
  };
  document: {
    id: string;
    fileName: string;
    fileType: string;
  };
  score: number;
}

export interface RetrieveFilters {
  fileType?: string;
  heading?: string;
  filePath?: string;
  documentId?: string;
}

/**
 * 上传文档：分块 + embedding + 入库
 * - 同 contentHash 的文档跳过（已上传）
 */
export async function uploadDocument(
  agentId: string,
  fileName: string,
  content: string,
  opts: { embeddingProvider?: EmbeddingProvider } = {},
): Promise<UploadResult> {
  const provider = opts.embeddingProvider ?? getEmbeddingFactory().get();
  const fileType = detectFileType(fileName);
  const contentHash = sha256(content);

  // 同 hash 已存在则跳过
  const [existing] = await db
    .select({ id: schema.ragDocuments.id })
    .from(schema.ragDocuments)
    .where(
      and(
        eq(schema.ragDocuments.agentId, agentId),
        eq(schema.ragDocuments.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      document: { id: existing.id, fileName, fileType, contentHash, chunkCount: 0 },
      chunks: 0,
      embeddingProvider: provider.name,
    };
  }

  // 分块
  const chunks = chunkDocument(content, fileType, fileName);
  if (chunks.length === 0) {
    throw new Error('文档分块后无结果');
  }

  // 批量 embedding（按 100 个一组）
  const texts = chunks.map((c) => c.content);
  const embeddings: number[][] = [];
  const BATCH = 100;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const vecs = await provider.embed(batch);
    embeddings.push(...vecs);
  }

  // 落库 rag_documents
  const [doc] = await db
    .insert(schema.ragDocuments)
    .values({
      agentId,
      fileName,
      fileType,
      contentHash,
      chunkCount: chunks.length,
    })
    .returning();
  if (!doc) throw new Error('rag_documents 写入失败');

  // 落库 rag_chunks（含 embedding vector）
  await db.insert(schema.ragChunks).values(
    chunks.map((chunk, idx) => ({
      documentId: doc.id,
      agentId,
      content: chunk.content,
      embedding: embeddings[idx] ?? [],
      metadataJson: chunk.metadata,
      chunkIndex: idx,
    })),
  );

  return {
    document: {
      id: doc.id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      contentHash: doc.contentHash,
      chunkCount: chunks.length,
    },
    chunks: chunks.length,
    embeddingProvider: provider.name,
  };
}

/**
 * 检索：cosine 相似度 + metadata 过滤，返回 top-k
 * - pgvector cosine_distance = 1 - cosine_sim；score = 1 - distance
 */
export async function retrieve(
  agentId: string,
  query: string,
  opts: { topK?: number; filters?: RetrieveFilters; embeddingProvider?: EmbeddingProvider } = {},
): Promise<RetrieveResult[]> {
  const topK = opts.topK ?? 5;
  const provider = opts.embeddingProvider ?? getEmbeddingFactory().get();

  if (!query.trim()) {
    throw new Error('查询不能为空');
  }

  const [queryVec] = await provider.embed([query]);
  if (!queryVec || queryVec.length === 0) {
    throw new Error('查询 embedding 失败');
  }

  // 构建 metadata 过滤（jsonb 字段筛选）
  const conditions = [eq(schema.ragChunks.agentId, agentId)];
  if (opts.filters?.fileType) {
    conditions.push(
      sql`${schema.ragChunks.metadataJson}->>'type' = ${opts.filters.fileType}`,
    );
  }
  if (opts.filters?.heading) {
    conditions.push(
      sql`${schema.ragChunks.metadataJson}->>'heading' = ${opts.filters.heading}`,
    );
  }
  if (opts.filters?.filePath) {
    conditions.push(
      sql`${schema.ragChunks.metadataJson}->>'filePath' = ${opts.filters.filePath}`,
    );
  }
  if (opts.filters?.documentId) {
    conditions.push(eq(schema.ragChunks.documentId, opts.filters.documentId));
  }

  // cosine_distance(vec, query) 越小越相似
  const distance = cosineDistance(schema.ragChunks.embedding, queryVec);
  const rows = await db
    .select({
      chunkId: schema.ragChunks.id,
      content: schema.ragChunks.content,
      documentId: schema.ragChunks.documentId,
      chunkIndex: schema.ragChunks.chunkIndex,
      metadata: schema.ragChunks.metadataJson,
      distance,
      docId: schema.ragDocuments.id,
      docFileName: schema.ragDocuments.fileName,
      docFileType: schema.ragDocuments.fileType,
    })
    .from(schema.ragChunks)
    .innerJoin(
      schema.ragDocuments,
      eq(schema.ragDocuments.id, schema.ragChunks.documentId),
    )
    .where(and(...conditions))
    .orderBy(distance)
    .limit(topK);

  return rows.map((r) => ({
    chunk: {
      id: r.chunkId,
      content: r.content,
      documentId: r.documentId,
      chunkIndex: r.chunkIndex,
      metadata: (r.metadata ?? {}) as RagChunkMetadata,
    },
    document: {
      id: r.docId,
      fileName: r.docFileName,
      fileType: r.docFileType,
    },
    score: 1 - Number(r.distance),
  }));
}

/** 列出 Agent 的所有文档 */
export async function listDocuments(agentId: string) {
  return db
    .select({
      id: schema.ragDocuments.id,
      fileName: schema.ragDocuments.fileName,
      fileType: schema.ragDocuments.fileType,
      contentHash: schema.ragDocuments.contentHash,
      chunkCount: schema.ragDocuments.chunkCount,
      createdAt: schema.ragDocuments.createdAt,
    })
    .from(schema.ragDocuments)
    .where(eq(schema.ragDocuments.agentId, agentId))
    .orderBy(desc(schema.ragDocuments.createdAt));
}

/** 删除文档（关联 chunk 也会被 ON DELETE CASCADE 清掉） */
export async function deleteDocument(agentId: string, documentId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(schema.ragDocuments)
    .where(
      and(
        eq(schema.ragDocuments.id, documentId),
        eq(schema.ragDocuments.agentId, agentId),
      ),
    )
    .returning({ id: schema.ragDocuments.id });
  return !!deleted;
}

// ===== 内部工具 =====

function detectFileType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.txt')) return 'text';
  if (lower.endsWith('.mdx')) return 'markdown';
  return 'text';
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// 重新导出 lte，避免 unused 警告（保留给未来 range 检索扩展）
// 当前未使用，移除占位导出

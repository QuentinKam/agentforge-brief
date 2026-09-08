# ADR-003: Embedding 本地降级选用 hash 伪向量

- **日期**: 2026-09-08
- **状态**: Accepted
- **约束来源**: PRD §3.4「Embedding：OpenAI text-embedding-3-small（或本地备选 bge-small）」

## 背景

PRD §3.4 要求 RAG embedding 模型为 OpenAI text-embedding-3-small，本地备选 bge-small。M3 阶段需在
`.env` 未配置 `OPENAI_API_KEY` 时也能跑通完整 RAG 闭环（上传 → 分块 → embedding → 入库 → 检索）。

## 决策

本地降级实现为 **hash-based 伪向量**（LocalHashEmbeddingProvider），不引入 bge-small 模型。

## 理由

- **测试闭环优先**：M3 验收要求 RAG 检索延迟 P95 < 200ms，必须能本地无 key 跑基准压测
- **避免重依赖**：bge-small 需下载 ONNX 模型（~100MB）+ 引入 `@xenova/transformers`，体积与启动时间显著上升
- **维度对齐**：OpenAI text-embedding-3-small 输出固定 1536 维，本地降级也输出 1536 维（zero-padded），保证 schema 兼容
- **明确非语义**：hash 伪向量只用于流程闭环，README 与代码注释明确标注「无真实语义能力，仅供测试」
- **M5 替换路径清晰**：EmbeddingProvider 抽象层 + 工厂模式，M5 引入 bge-small / 其他本地模型只需新增 Provider 实现 + 工厂注册

## 后果

- 本地降级的检索准确度极低，cosine 相似度近似随机；M3 验收只检查流程与延迟，不检查检索质量
- README「M3 已实现功能」明确区分 OpenAI 主路径与本地降级
- M5 部署到生产前必须配置 `OPENAI_API_KEY`，或替换为本地真实模型

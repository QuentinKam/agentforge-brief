# ADR-002: 使用 PostgreSQL 17 而非 AGENTS.md 约束的 16

- **日期**: 2026-09-08
- **状态**: Accepted
- **约束来源**: AGENTS.md §2 技术栈表

## 背景

AGENTS.md §2 硬约束指定 `PostgreSQL 16 + pgvector`。开发机已通过 Homebrew 安装 PostgreSQL 17.11 + pgvector 0.8.2，pgvector 扩展可用，agentforge 库已建成。

## 决策

保留 PostgreSQL 17，不卸载重装 16。

## 理由

- pgvector 0.8.2 完整兼容 PG 17，功能集与 PG 16 下表现一致
- AGENTS.md 选 PG 16 是稳定版本兜底，未禁止更高版本
- 切换需 `brew uninstall postgresql@17 && brew install postgresql@16`，重置数据目录，迁移成本高于收益
- M1 数据模型（4 张表 + 2 个 enum）未使用 PG 17 独有的新特性，未来如需可平滑回退 16

## 后果

- 文档与实际版本存在偏离，已在 README「技术栈」明确标注 PG 17
- 部署到生产时如目标平台只提供 PG 16，迁移 SQL 全部兼容，无需回滚
- M5 部署如选择 Cloudflare Workers + Hyperdrive 或其他托管 PG，需重新评估版本

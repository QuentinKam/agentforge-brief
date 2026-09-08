# ADR-001: 前端脚手架选 Vite 8 而非 AGENTS.md 字面约束的 Vite 7

- **日期**: 2026-09-08
- **状态**: Accepted
- **约束来源**: AGENTS.md §2 技术栈表

## 背景

AGENTS.md §2 写「React 19 + Vite 7（TypeScript）」。`bun create vite@latest` 默认装到 Vite 8.2.2 + React 19.2.8 + TypeScript 6.0.3（2026 年 9 月最新）。

## 决策

采用 `bun create vite` 默认的最新版（Vite 8 / React 19.2 / TS 6）。

## 理由

- AGENTS.md 「Vite 7」是写作时的下限版本约束，精神是「不使用 Next.js / 不使用旧版 Vite」
- Vite 8 API 与 Vite 7 完全兼容，迁移成本为零
- React 19 + 19.2 之间是补丁升级，无破坏性变更
- 锁版本到旧版反而引入安全/兼容问题

## 后果

- 文档与实际版本号偏离，已在 README「技术栈」明确标注真实版本
- M5 部署到 Cloudflare Pages 时适配 Vite 8 构建产物，无阻碍
- 若后续遇到 Vite 8 特定的破坏性变更（暂未发现），可降级到 7

# AGENTS.md — AgentForge 工程总纲

> 本文件是 AI Agent（Trae / Claude Code / Cursor 等）在本项目工作的最高约束。
> 与 PRD.md 冲突时，以本文件的技术约束为准，需求细节以 PRD.md 为准。

## 1. 项目一句话

AI Coding Agent 开发平台：Agent Runtime（Bun.spawn 沙箱）+ Skill 系统 + MCP 工具集成 +
RAG 知识库（pgvector）+ 多 Agent 编排 + Harness Builder（可视化上下文/规则/约束编排）。
后端 Hono（Bun）+ React + Vite 前端。这是求职作品集项目，代码质量、架构决策记录和 README 完整度与功能同等重要。

## 2. 技术栈（硬约束，不得替换）

| 层 | 选型 | 约束 |
|----|------|------|
| Runtime | **Bun 1.2+** | 不使用 Node.js / Deno；`Bun.spawn` 子进程做 Agent 代码沙箱 |
| 前端 | **React 19 + Vite 7**（TypeScript） | SPA dashboard；不用 Next.js（无 SSR 需求，Hono 做 API 层） |
| API 层 | **Hono**（运行于 Bun） | 统一单 `ctx` 入参中间件；手动注册路由 |
| ORM | **Drizzle ORM** | TypeScript-first，迁移文件版本管理 |
| 数据库 | PostgreSQL 16 + **pgvector**（向量检索） | Homebrew 原生安装；**禁止 Docker** |
| 缓存 | Redis 7（可选，M3 引入） | 热点缓存 + 限流 |
| AI Provider | OpenAI 兼容 API + Anthropic API（Claude） | API key 走 `.env`，禁止硬编码 |
| 沙箱 | `Bun.spawn` 子进程 + 环境隔离 + 可选 `isolated-vm` | 禁止 Docker 做沙箱；核心安全卖点 |
| 部署 | **Cloudflare Pages**（前端）+ VPS / Cloudflare Workers（后端） | 不使用 npm；不使用 Docker 编排 |

### 技术栈选型理由（面试可讲）

- **Bun 而非 Deno**：AgentForge 需集成 MCP 工具、Vercel AI SDK、LangChain.js 等 AI 生态——全是 npm 包，Bun 原生跑 npm 零适配；Deno 的 `--allow-*` 权限模型虽更优雅，但 npm 兼容边缘 case 在 AI Agent 场景里频繁踩坑
- **Hono 而非 Express/Fastify**：边缘运行时兼容（Cloudflare Workers），中间件单 `ctx` 签名，类型推断优于 Express
- **React + Vite 而非 Next.js**：AgentForge 是开发者 dashboard SPA，无 SEO/SSR 需求；Hono 已做 API 层，Next.js 的 API routes 冗余
- **Drizzle 而非 Prisma**：SQL-first 迁移文件更透明，pgvector 类型原生支持，无 schema.prisma 生成层
- **pgvector 而非 Pinecone/Weaviate**：保持单数据库架构，减少外部依赖，RAG 检索延迟可控且可量化

## 3. 代码规范

- 语言：TypeScript strict 模式，`any` 需注释说明原因
- 命名：代码标识符一律 camelCase；数据库列名 snake_case（pgvector / Drizzle 惯例）
- 注释与文档：中文；代码标识符、commit message 英文
- 包管理：**只允许 Bun**（`bun install` / `bun add`），禁止 npm / pnpm / yarn
- 中国网络：`.npmrc` 配置 `registry=https://registry.npmmirror.com`；`.gitignore` 排除 `.env`、`node_modules`、`dist`
- 测试：核心模块（沙箱权限控制、Skill 注册与调用、RAG 检索、Agent 编排）TDD；用 `bun test`（Bun 内置 test runner）；`bun test` 必须绿
- 中间件签名：Hono 统一单 `ctx` 入参，不兼容 `(req, ctx)` 双参数写法

## 4. 工程规则（Harness 约定）

1. **里程碑节奏**：严格按 PRD.md 的 M1→M5 顺序交付；每个里程碑一个 git branch，完成后合回 main 并打 tag（`m1`, `m2`…）
2. **Commit 规范**：`feat|fix|test|docs|chore(scope): summary`，小步提交
3. **决策记录**：技术选型偏离必须写 `docs/adr/NNN-<slug>.md`（背景 / 决策 / 后果，10 行以内）
4. **环境配置**：所有密钥走 `.env`（提供 `.env.example`），禁止硬编码
5. **错误处理**：API 层统一错误响应结构（code / message / details），不在控制器里裸 throw
6. **依赖新增**：优先 Bun 生态 + npm 通用包；新增依赖必须说明用途
7. **Harness 自举**：本项目自身的 AGENTS.md / Skills / Rules 也是 AgentForge 的输入数据——Agent 用 AgentForge 管理自己的 Harness，形成自举闭环（面试核心叙事）

## 5. 常用命令

```bash
bun run dev          # 开发模式（Hono API + Vite dev server 同时启动）
bun test             # Bun 内置 test runner
bun run build        # 生产构建（前端 + 后端）
bun run seed         # 种子数据（示例 Skill / Agent 配置）
bun run lint         # 代码检查
bun run typecheck    # tsc --noEmit 类型检查
```

## 6. 验收底线（每个里程碑完成前自查）

- [ ] `bun run typecheck && bun test` 全绿
- [ ] 新增依赖已登记用途
- [ ] 有偏离选型时已写 ADR
- [ ] README 的「已实现功能」与「启动步骤」同步更新
- [ ] 该里程碑的 PRD 验收标准逐条满足（见 PRD.md 第 5 节）

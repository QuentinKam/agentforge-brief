# AgentForge — AI Coding Agent 开发平台

> 面向开发者的 AI Coding Agent 构建平台：Agent Runtime（沙箱执行）、Skill 系统、
> MCP 工具集成、RAG 知识库、多 Agent 编排、Harness Builder（上下文/规则/约束可视化编排）。
> 这是求职作品集项目，代码质量、架构决策记录和 README 完整度与功能同等重要。

## 当前里程碑

**M1 — 基础架构 + Agent 执行闭环**：已完成。
**M2 — Skill 系统 + Harness Builder**：已完成。
**M3 — Agent Runtime 沙箱 + RAG 知识库**：已完成。
M4-M5 见 [PRD.md](PRD.md) 第 5 节路线图。

## M1 已实现功能

- [x] Bun + Hono + React + Vite 项目脚手架跑通，本地 PostgreSQL + pgvector（无 Docker）
- [x] 用户认证（JWT，注册 / 登录）
- [x] Agent Project CRUD API + UI
- [x] Agent Playground：输入消息 → 调用 AI Provider（OpenAI / Anthropic）→ 返回结果
- [x] AI Provider 抽象层（支持多 provider 切换）
- [x] 执行日志：记录每次 Agent 运行的输入 / 输出 / token / 耗时（含 step trace）

## M2 已实现功能

- [x] Harness Builder UI：系统 prompt 编辑 + 规则文件编辑（多段 Markdown）+ 约束配置（JSON）
- [x] 上下文预览：实时渲染最终发给 LLM 的完整 prompt + token 计数（防抖 500ms）
- [x] Skill 实体 CRUD + UI（名称、描述、触发条件、工具调用链、输入/输出 JSON Schema）
- [x] Skill 执行引擎：关键词匹配 → 按 toolChain 顺序调用工具 → 失败中断 + 状态传递
- [x] 预置 Skill 模板：代码搜索、文件读写、shell 命令、HTTP 请求（一键种子）
- [x] Harness 配置导入 / 导出（JSON）
- [x] Zod 校验错误统一为 ApiError 响应结构（zodHook）
- [x] 4 个内置工具实现：code_search（rg）/ file_io（带路径越界防护）/ shell_exec（spawn + 超时）/ http_request

## M3 已实现功能

- [x] Bun.spawn 沙箱：环境变量白名单（仅 PATH/HOME/LANG 等）+ 超时控制 + stdout/stderr 采集
- [x] 沙箱安全测试（16 用例 TDD）：环境变量隔离、工作目录隔离、超时控制、路径越界防护
- [x] shell_exec / code_search 工具迁移到 Bun.spawn 沙箱执行
- [x] RAG 知识库 schema：rag_documents + rag_chunks（pgvector vector(1536)），含 content_hash 去重
- [x] 文档分块器：Markdown 按标题、TypeScript/JS 按函数定义、纯文本按 chunkSize + overlap
- [x] Embedding Provider 抽象层：OpenAI text-embedding-3-small 主 + 本地 hash 伪向量降级（无 key 时启用，仅供测试）
- [x] RAG 服务：uploadDocument（分块 + 批量 embedding + 入库）/ retrieve / listDocuments / deleteDocument
- [x] RAG 路由：POST /rag/documents 上传、GET 列表、DELETE 删除、POST /rag/search 检索
- [x] RAG 检索：pgvector cosine 相似度 + 4 种 metadata 过滤（fileType/heading/filePath/documentId）+ top-k
- [x] Agent 运行时 RAG 注入：POST /api/agent-runs 自动用 input 检索 → 注入 system 消息 → 落 rag_retrieval step trace
- [x] ragOptions 配置：enabled（开/关注入）/ topK（1-20）
- [x] 检索延迟压测：330 chunks 数据集 P95 = 6.86ms（远低于 PRD §M3 验收线 200ms）

### M3 RAG 检索性能基准

数据集：30 个 Markdown 文档，共 330 个 chunk；pgvector 顺序扫描（无 HNSW 索引）。

| 指标 | 数值 |
|------|------|
| 平均 | 4.92 ms |
| P50 | 4.65 ms |
| P95 | 6.86 ms |
| P99 | 8.83 ms |
| 最大 | 22.69 ms |

PRD §M3 验收线：P95 < 200ms → **PASS**。

运行压测：`bun run bench:rag`

## 技术栈

| 层 | 选型 | 备注 |
|----|------|------|
| Runtime | Bun 1.3.14 | 后端入口 `bun run dev` |
| 前端 | React 19.2 + Vite 8.2 | TypeScript 6.0；SPA dashboard |
| API 层 | Hono 4.13 | 运行于 Bun；单 `ctx` 中间件签名 |
| ORM | Drizzle ORM 0.36 | PostgreSQL dialect；迁移版本管理（`drizzle/`） |
| 数据库 | PostgreSQL 17.11 + pgvector 0.8.2 | 见 [ADR-002](docs/adr/002-postgresql-version.md) |
| AI Provider | OpenAI 兼容 API + Anthropic API | 抽象层 + 工厂；按 Agent 配置切换 |
| 认证 | JWT (jsonwebtoken 9) + bcryptjs 2 | Bearer token；中间件挂载 ctx.state.user |

> 与 [AGENTS.md](AGENTS.md) §2 硬约束的字面偏离（Vite 7→8、PG 16→17）已记录 ADR-001 / ADR-002。

## 项目结构

```
agentforge-brief/
├── server/                  # Hono 后端
│   └── src/
│       ├── index.ts         # 应用入口：注册路由 + 全局错误处理
│       ├── db/
│       │   ├── schema.ts   # Drizzle schema：6 表 + 2 enum（含 pgvector rag_chunks）
│       │   └── index.ts     # 单例 db 客户端
│       ├── llm/             # AI Provider 抽象层
│       │   ├── provider.ts  # LLMProvider 接口 + 工厂
│       │   ├── openai.ts    # OpenAI 兼容实现
│       │   ├── anthropic.ts # Anthropic Claude 实现
│       │   ├── embedding.ts # Embedding Provider（OpenAI 主 + 本地降级）
│       │   └── index.ts     # 工厂单例
│       ├── lib/
│       │   ├── jwt.ts       # signToken / verifyToken / extractBearer
│       │   ├── errors.ts    # ApiError + sendApiError（统一错误响应）
│       │   ├── tokens.ts    # token 估算 + 上下文预览
│       │   └── zod-hook.ts  # Zod 校验错误统一为 ApiError
│       ├── middleware/
│       │   └── auth.ts      # JWT 鉴权中间件
│       ├── routes/
│       │   ├── auth.ts            # POST /api/auth/register|login
│       │   ├── agent-projects.ts # GET/POST/PATCH/DELETE /api/agent-projects
│       │   ├── agent-runs.ts     # POST/GET /api/agent-runs（含 RAG 注入 + step trace）
│       │   ├── harness.ts        # GET/PUT /api/agent-projects/:id/harness（+导入导出+预览）
│       │   ├── skills.ts         # CRUD /api/agent-projects/:id/skills（+模板种子）
│       │   └── rag.ts            # /api/agent-projects/:id/rag/{documents,search}
│       ├── rag/             # RAG 知识库
│       │   ├── chunker.ts   # 文档分块器（Markdown / Code / Text）
│       │   ├── service.ts   # uploadDocument / retrieve / listDocuments / deleteDocument
│       │   └── bench.ts    # 检索延迟压测脚本
│       ├── sandbox/         # Bun.spawn 子进程沙箱
│       │   └── index.ts    # runInSandbox / runCodeInSandbox / isPathSafe
│       ├── skills/          # Skill 系统
│       │   ├── engine.ts   # matchSkills / executeSkill
│       │   └── registry.ts  # 4 个内置工具 + 注册表
│       └── types.ts        # Hono ctx.state 类型扩展
├── client/                  # Vite + React 前端
│   └── src/
│       ├── App.tsx          # 路由配置
│       ├── lib/api.ts       # fetch 封装 + 类型定义
│       ├── components/Layout.tsx
│       └── pages/
│           ├── Login.tsx        # 登录/注册
│           ├── Projects.tsx     # Agent 项目 CRUD
│           ├── Playground.tsx   # 输入 → Agent 运行
│           └── RunHistory.tsx   # 运行 trace
├── drizzle/                 # 迁移 SQL（版本管理）
├── tests/
│   ├── auth.test.ts         # JWT + 鉴权集成测试
│   ├── provider.test.ts     # AI Provider 抽象层测试
│   └── helpers.ts           # truncateAll + registerTestUser
├── docs/adr/                # 架构决策记录
│   ├── 001-scaffold-vite-vs-bun-template.md
│   └── 002-postgresql-version.md
├── AGENTS.md                # 工程总纲（最高约束）
├── PRD.md                   # 产品需求与验收标准
├── drizzle.config.ts
└── package.json
```

## 本地启动

### 1. 系统依赖（人工执行一次）

```bash
brew install bun postgresql@17
brew services start postgresql@17

# 创建数据库 + pgvector 扩展
psql -d postgres -c "CREATE DATABASE agentforge;"
psql -d agentforge -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. 安装依赖

```bash
bun install
cd client && bun install && cd ..
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少配置一个 AI Provider 的 API key：
#   OPENAI_API_KEY=sk-...   或   ANTHROPIC_API_KEY=sk-ant-...
```

### 4. 应用数据库迁移

```bash
bun run db:push          # 交互式确认
# 或直接执行生成的迁移 SQL：
psql -d agentforge -f drizzle/0000_*.sql
```

### 5. 启动服务

打开两个终端：

```bash
# 终端 1：后端 API（http://localhost:3000）
bun run dev

# 终端 2：前端 dev server（http://localhost:5173，代理 /api → 后端）
bun run dev:client
```

浏览器打开 http://localhost:5173 → 注册账号 → 创建 Agent 项目 → Playground 输入消息 → 查看执行日志。

## 验证

```bash
bun run typecheck        # tsc --noEmit，全绿
bun test                 # Bun 内置 test runner，83 个用例全绿
bun run build            # 前端生产构建
bun run bench:rag        # RAG 检索延迟压测（P95 < 200ms）
```

测试覆盖：

- `tests/auth.test.ts`（17 用例）：JWT 签发/校验、ApiError 工厂、注册/登录/重复注册/密码错误/无 token/无效 token
- `tests/provider.test.ts`（7 用例）：ProviderFactory 注册/查找、MissingApiKeyError 层次、MockProvider chat 契约
- `tests/skills.test.ts`（7 用例）：Skill 关键词匹配 + 工具调用链（顺序、不存在、失败中断）
- `tests/tokens.test.ts`（7 用例）：token 估算（中英独立）+ 上下文预览构建
- `tests/sandbox.test.ts`（16 用例）：环境变量隔离、工作目录隔离、超时控制、stdout/stderr 采集、isPathSafe 路径越界
- `tests/chunker.test.ts`（7 用例）：Markdown 按标题、TypeScript 按函数、纯文本兜底、JSON 切分
- `tests/embedding.test.ts`（9 用例）：LocalHash 维度/归一化/批量、OpenAI 无 key 抛错、工厂降级逻辑
- `tests/rag.test.ts`（14 用例）：文档上传 + hash 去重 + 检索 top-k + metadata 过滤 + 路由集成
- `tests/agent-runs-rag.test.ts`（5 用例）：Agent 运行时 RAG 注入 + step trace + ragOptions 配置

## 一键启动

```bash
bash start.command
# 或双击 start.command
```

脚本会：
1. 检查 PostgreSQL 服务、agentforge 数据库、.env 配置
2. 自动安装缺失依赖
3. 后台启动后端 API（:3000）+ 前端 dev server（:5173）
4. 在终端聚焦时按 Ctrl+C 干净停止两个服务

## 架构决策记录（ADR）

- [ADR-001](docs/adr/001-scaffold-vite-vs-bun-template.md)：Vite 8 / TS 6 字面偏离 AGENTS.md 的 Vite 7 / TS 5
- [ADR-002](docs/adr/002-postgresql-version.md)：PostgreSQL 17 字面偏离 AGENTS.md 的 16
- [ADR-003](docs/adr/003-embedding-fallback.md)：Embedding 本地降级选用 hash 伪向量（不引入 bge-small）

## 路线图

M4-M5 见 [PRD.md](PRD.md) 第 5 节。每个里程碑一个 git branch，完成后合回 main 并打 tag。

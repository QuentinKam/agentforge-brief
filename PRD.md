# PRD — AgentForge AI Coding Agent 开发平台

> 需求与验收标准。工程约束见 AGENTS.md。里程碑顺序 M1→M5 不可跳。

## 1. 产品定位

AgentForge 是面向开发者的 AI Coding Agent 构建平台。开发者通过可视化 UI 编排 Agent 的上下文、Skills、工具调用和反馈循环，在安全沙箱中执行 Agent 生成的代码，并通过 RAG 知识库为 Agent 注入项目知识。

**核心价值**：把「构建一个可靠 AI Agent」从手工写 prompt + 调 API 变成可视化配置 + 代码生成 + 沙箱执行 + 测试反馈闭环。

**对标岗位**：佩美（Local First AI Work OS / Agent / 开源）、迈富时（Coding Agent Runtime + 容器 + 工具链）、英诺维信（multi-agent + Skill + MCP + RAG + Harness）。

## 2. 用户故事（主流程）

1. 开发者注册 / 登录后，创建一个 **Agent 项目**，配置基础信息（名称、描述、AI Provider、模型）
2. 在 **Harness Builder** 中可视化编排 Agent 上下文：系统 prompt、规则文件（CLAUDE.md / AGENTS.md 风格）、约束条件、Skills 列表
3. 在 **Skill 编辑器** 中定义 Skill（名称、描述、触发条件、工具调用链、输入/输出 Schema）
4. 在 **MCP 工具面板** 中注册 MCP Server 连接，将工具暴露给 Agent 调用
5. 在 **RAG 知识库** 中上传文档（Markdown / 代码文件），系统分块 + embedding + 入库，Agent 运行时可检索
6. 在 **Agent Playground** 中输入任务，Agent 执行：读取 harness 配置 → 组装上下文 → 调用 LLM → 调用工具 / 检索知识 → 执行代码（沙箱）→ 返回结果
7. 查看 **执行日志**：完整 trace（每步的输入/输出/耗时/token 消耗）
8. 在 **多 Agent 编排** 页面定义 Agent 协作图（DAG：A → B → C），指定路由策略
9. 导出 Agent 配置为可复现的 JSON / YAML，支持导入他人配置

## 3. 核心模块定义

### 3.1 Agent Runtime（沙箱执行）
- `Bun.spawn` 启动子进程执行 Agent 生成的代码
- 环境隔离：白名单环境变量、工作目录隔离、无继承父进程权限
- 可选 `isolated-vm`：对纯计算代码在 V8 Isolate 中执行（无 I/O 权限）
- 超时控制 + 资源限制（CPU / 内存）
- 执行日志：stdout / stderr 实时采集

### 3.2 Skill 系统
- Skill 实体：名称、描述、触发条件（关键词 / 语义匹配）、工具调用链、输入 Schema（Zod）、输出 Schema
- Skill 注册表：Agent 可挂载多个 Skill，运行时按触发条件匹配
- Skill 执行：LLM 决定调用 → 参数校验 → 工具调用 → 结果返回 LLM → 下一步决策
- Skill 模板库：预置常见模式（代码搜索、文件读写、shell 命令、HTTP 请求）

### 3.3 MCP 工具集成
- MCP Client：连接外部 MCP Server（stdio / SSE），发现并注册工具
- 工具桥接：将 MCP 工具封装为 Agent 可调用的统一接口
- 配置管理：MCP Server 连接配置（命令、参数、环境变量）
- 预置 MCP：文件系统、git、shell 三种基础 MCP Server 配置模板

### 3.4 RAG 知识库
- 文档上传：支持 Markdown / TypeScript / JSON / 纯文本
- 分块策略：按语义边界分块（代码按函数 / Markdown 按标题），可配置 chunk size / overlap
- Embedding：OpenAI text-embedding-3-small（或本地备选 bge-small）
- 检索：pgvector cosine 相似度 + metadata 过滤（文件路径、类型）
- 注入：Agent 运行时按需检索，将 top-k 结果注入上下文

### 3.5 多 Agent 编排
- 编排图：DAG（有向无环图），节点 = Agent，边 = 执行顺序 / 数据传递
- 路由策略：顺序 / 并行 / 条件分支（基于上一节点输出）
- 状态传递：上游 Agent 输出作为下游 Agent 输入
- 可视化：React Flow 画布拖拽编排

### 3.6 Harness Builder
- 可视化编辑 Agent 的「工作环境配置」
- 组成部分：系统 prompt、规则文件（支持 Markdown 编辑 + 语法高亮）、约束条件（JSON Schema）、Skills 挂载、MCP 工具挂载、RAG 知识库挂载
- 预览：实时渲染最终发送给 LLM 的完整上下文（token 计数）
- 导入 / 导出：JSON 格式，可版本管理

## 4. 数据模型草案

```
agent_project    (id, user_id, name, description, provider, model, created_at)
harness_config   (id, agent_id, system_prompt, rules_json, constraints_json, created_at, updated_at)
skill            (id, agent_id, name, description, trigger_json, tool_chain_json, input_schema, output_schema, created_at)
mcp_connection   (id, agent_id, name, transport_type, command_json, env_json, status, created_at)
rag_document     (id, agent_id, file_name, file_type, content_hash, chunk_count, created_at)
rag_chunk        (id, document_id, content, embedding(vector), metadata_json, chunk_index)
agent_run        (id, agent_id, input, output, status, token_count, duration_ms, created_at)
agent_run_step   (id, run_id, step_type, step_input, step_output, duration_ms, created_at)
orchestration    (id, user_id, name, graph_json, routing_json, created_at)
orchestration_run (id, orchestration_id, status, result_json, created_at)
```

种子数据：1 个示例 Agent（「代码审查 Agent」），含 2 个 Skill（代码搜索 + 代码分析）、1 个 RAG 文档（示例项目 README）、1 个 harness 配置。

## 5. 里程碑与验收标准

### M1 — 基础架构 + Agent 执行闭环

**目标**：从零搭建，跑通一个最简单的 Agent：输入任务 → 调 LLM → 返回结果

- [ ] Bun + Hono + React + Vite 项目脚手架跑通，本地 PostgreSQL + pgvector（无 Docker）
- [ ] 用户认证（JWT，注册 / 登录）
- [ ] Agent Project CRUD API + UI
- [ ] Agent Playground：输入消息 → 调用 AI Provider（OpenAI / Anthropic）→ 返回结果
- [ ] AI Provider 抽象层（支持多 provider 切换）
- [ ] 执行日志：记录每次 Agent 运行的输入 / 输出 / token / 耗时

### M2 — Skill 系统 + Harness Builder

**目标**：从「裸调 LLM」升级为「有上下文 + 有工具的 Agent」

- [ ] Harness Builder UI：系统 prompt 编辑 + 规则文件编辑（Markdown 高亮）+ 约束配置
- [ ] 上下文预览：实时渲染最终发给 LLM 的完整 prompt + token 计数
- [ ] Skill 实体 CRUD + UI（名称、描述、触发条件、输入 / 输出 Zod Schema）
- [ ] Skill 执行引擎：LLM 决定调用 → 参数 Zod 校验 → 执行工具 → 结果返回 LLM
- [ ] 预置 Skill 模板：代码搜索、文件读写、shell 命令、HTTP 请求
- [ ] Harness 配置导入 / 导出（JSON）
- [ ] Skill 执行链路有单元测试（TDD）

### M3 — Agent Runtime 沙箱 + RAG 知识库

**目标**：Agent 能安全执行代码 + 基于知识库回答

- [ ] `Bun.spawn` 沙箱：子进程执行 Agent 生成的代码，环境隔离 + 超时控制 + stdout/stderr 采集
- [ ] 沙箱安全测试：验证子进程无法访问父进程环境变量 / 工作目录越界
- [ ] RAG 知识库：文档上传 → 分块 → embedding → pgvector 入库
- [ ] RAG 检索 API：相似度搜索 + metadata 过滤，返回 top-k
- [ ] Agent 运行时 RAG 注入：Agent 自动检索相关知识并注入上下文
- [ ] 检索延迟 P95 < 200ms（本地压测记录写入 README）

### M4 — MCP 工具集成 + 多 Agent 编排

**目标**：Agent 能调用外部工具 + 多个 Agent 协作

- [ ] MCP Client：连接外部 MCP Server（stdio / SSE），自动发现工具
- [ ] 工具桥接：MCP 工具封装为 Skill 可调用的统一接口
- [ ] 预置 MCP 模板：文件系统、git、shell
- [ ] 多 Agent 编排 UI：React Flow 画布，拖拽定义 DAG
- [ ] 路由策略：顺序执行 + 条件分支
- [ ] 编排执行引擎：按 DAG 拓扑序执行，状态传递
- [ ] 编排执行有集成测试

### M5 — 部署 + 加固 + 量化

**目标**：可访问的线上 demo + 安全文档 + 量化数据

- [ ] 前端部署 Cloudflare Pages，后端部署 VPS（或 Cloudflare Workers 如兼容）
- [ ] GitHub Actions CI：push 时 typecheck + test + build，main 合并后自动部署
- [ ] 安全清单文档化：沙箱权限边界图、输入校验（Zod）、API 鉴权、SQL 参数化（Drizzle）
- [ ] Agent 执行成功率 / 平均耗时 / token 消耗统计 dashboard
- [ ] README 含：架构图（Mermaid）、技术决策摘要、本地启动步骤、demo 演示账号、示例 Agent 配置
- [ ] Lighthouse 前端 Performance ≥ 90（截图写入 README）

## 6. 明确不做（Scope Out）

- 不做 Agent 市场 / 社区分享（只做单用户本地工具）
- 不做模型微调 / 训练
- 不做实时流式 SSE 输出（M1 用轮询，M5 可选加）
- 不做计费 / 团队协作 / 多租户
- 不做 Docker 沙箱（核心架构决策，ADR 记录）
- 不做自研 LLM / embedding 模型（只用 API）

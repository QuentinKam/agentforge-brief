// API 调用层 — 统一 fetch 封装，自动带 Authorization Bearer + 错误响应结构解析
const API_BASE = '/api';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('agentforge_token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await resp.text();
  const body = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    const err = body as ApiError;
    throw new Error(err?.error?.message ?? `HTTP ${resp.status}`);
  }
  return body as T;
}

export function setToken(token: string) {
  localStorage.setItem('agentforge_token', token);
}

export function clearToken() {
  localStorage.removeItem('agentforge_token');
}

export function getToken(): string | null {
  return localStorage.getItem('agentforge_token');
}

// ===== 类型定义 =====
export interface User {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

export interface AgentProject {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  input: string;
  output?: string | null;
  tokenCount?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AgentRunStep {
  id: string;
  runId: string;
  stepType: 'llm_call' | 'tool_call' | 'rag_retrieval';
  stepInput: unknown;
  stepOutput: unknown;
  durationMs?: number | null;
  createdAt: string;
}

// ===== 认证 API =====
export async function register(email: string, password: string, name?: string) {
  return apiFetch<{ token: string; user: User }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ===== Agent Project API =====
export async function listProjects() {
  return apiFetch<{ data: AgentProject[] }>('/agent-projects');
}

export async function getProject(id: string) {
  return apiFetch<{ data: AgentProject }>(`/agent-projects/${id}`);
}

export async function createProject(input: {
  name: string;
  description?: string;
  provider: 'openai' | 'anthropic';
  model: string;
}) {
  return apiFetch<{ data: AgentProject }>('/agent-projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateProject(
  id: string,
  input: Partial<{ name: string; description?: string; provider: string; model: string }>,
) {
  return apiFetch<{ data: AgentProject }>(`/agent-projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteProject(id: string) {
  return apiFetch<{ data: { id: string } }>(`/agent-projects/${id}`, {
    method: 'DELETE',
  });
}

// ===== Agent Run API =====
export async function runAgent(agentId: string, input: string) {
  return apiFetch<{ data: AgentRun }>('/agent-runs', {
    method: 'POST',
    body: JSON.stringify({ agentId, input }),
  });
}

export async function listRuns() {
  return apiFetch<{ data: AgentRun[] }>('/agent-runs');
}

export async function getRun(id: string) {
  return apiFetch<{ data: { run: AgentRun & { errorMessage?: string | null }; steps: AgentRunStep[] } }>(
    `/agent-runs/${id}`,
  );
}

// ===== Harness API =====
export interface HarnessConfig {
  id: string;
  agentId: string;
  systemPrompt: string | null;
  rulesJson: string[] | null;
  constraintsJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export async function getHarness(agentId: string) {
  return apiFetch<{ data: HarnessConfig }>(`/agent-projects/${agentId}/harness`);
}

export async function updateHarness(agentId: string, input: {
  systemPrompt?: string | null;
  rules?: string[];
  constraints?: Record<string, unknown>;
}) {
  return apiFetch<{ data: HarnessConfig }>(`/agent-projects/${agentId}/harness`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export interface ContextPreview {
  sections: Array<{ label: string; content: string; tokens: number }>;
  totalTokens: number;
}

export async function previewContext(agentId: string, input: {
  systemPrompt?: string | null;
  rules?: string[];
  constraints?: Record<string, unknown>;
  userMessage?: string;
}) {
  return apiFetch<{ data: ContextPreview }>(`/agent-projects/${agentId}/harness/preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function exportHarness(agentId: string) {
  return apiFetch<{ data: unknown }>(`/agent-projects/${agentId}/harness/export`, {
    method: 'POST',
  });
}

export async function importHarness(agentId: string, data: {
  systemPrompt?: string | null;
  rules?: string[];
  constraints?: Record<string, unknown>;
}) {
  return apiFetch<{ data: HarnessConfig }>(`/agent-projects/${agentId}/harness/import`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ===== Skill API =====
export interface Skill {
  id: string;
  agentId: string;
  name: string;
  description: string | null;
  triggerJson: { keywords?: string[]; semantic?: string } | null;
  toolChainJson: Array<{ tool: string; description: string }> | null;
  inputSchema: unknown;
  outputSchema: unknown;
  isTemplate: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export async function listSkills(agentId: string) {
  return apiFetch<{ data: Skill[] }>(`/agent-projects/${agentId}/skills`);
}

export async function createSkill(agentId: string, input: {
  name: string;
  description?: string;
  trigger?: { keywords?: string[]; semantic?: string };
  toolChain?: Array<{ tool: string; description: string }>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}) {
  return apiFetch<{ data: Skill }>(`/agent-projects/${agentId}/skills`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSkill(agentId: string, skillId: string, input: Partial<{
  name: string;
  description?: string;
  trigger?: { keywords?: string[]; semantic?: string };
  toolChain?: Array<{ tool: string; description: string }>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}>) {
  return apiFetch<{ data: Skill }>(`/agent-projects/${agentId}/skills/${skillId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteSkill(agentId: string, skillId: string) {
  return apiFetch<{ data: { id: string } }>(`/agent-projects/${agentId}/skills/${skillId}`, {
    method: 'DELETE',
  });
}

export async function seedSkillTemplates(agentId: string) {
  return apiFetch<{ data: { inserted: number; skills?: Skill[] } }>(`/agent-projects/${agentId}/skills/seed-templates`, {
    method: 'POST',
  });
}

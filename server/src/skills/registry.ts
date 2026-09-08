// Skill 工具注册表 — Skill 执行引擎按 tool 名查找执行器
// M2 内置 4 个工具：code_search / file_io / shell_exec / http_request
// M3：shell_exec 改用 Bun.spawn 沙箱（环境隔离 + 超时 + stdout/stderr 采集）
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runInSandbox, isPathSafe } from '../sandbox';

export interface ToolContext {
  // 工作目录：默认项目根，但 file_io/shell 会限制只能在此目录及子目录
  cwd: string;
  // 调用方 user id（用于未来权限审计）
  userId: string;
}

export interface ToolResult {
  ok: boolean;
  // 工具返回的数据；类型不固定；AGENTS.md §3：any 需注释说明原因
  data: unknown;
  error?: string;
}

export type ToolHandler = (input: unknown, ctx: ToolContext) => Promise<ToolResult>;

const registry = new Map<string, ToolHandler>();

export function registerTool(name: string, handler: ToolHandler) {
  registry.set(name, handler);
}

export function getTool(name: string): ToolHandler | undefined {
  return registry.get(name);
}

export function listTools(): string[] {
  return [...registry.keys()];
}

// ===== 内置工具实现 =====

// 1. code_search —— 递归 grep，在沙箱中执行 rg
const codeSearch: ToolHandler = async (input, ctx) => {
  const opts = input as { pattern: string; cwd?: string; fileGlob?: string };
  if (!opts.pattern) return { ok: false, data: null, error: 'pattern 必填' };
  const cwd = opts.cwd && isPathSafe(opts.cwd, ctx.cwd) ? opts.cwd : ctx.cwd;
  try {
    const result = await runInSandbox('rg', ['-n', '--', opts.pattern, cwd], { cwd: ctx.cwd, timeoutMs: 5000 });
    const lines = result.stdout.split('\n').filter(Boolean).slice(0, 50);
    const matches = lines.map((l) => {
      const m = l.match(/^(.+?):(\d+):(.*)$/);
      return m ? { file: m[1], line: Number(m[2]), content: m[3] } : { file: l, line: 0, content: '' };
    });
    return { ok: result.exitCode === 0, data: { matches, exitCode: result.exitCode } };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
};

// 2. file_io —— 读/写/追加，路径越界防护
const fileIo: ToolHandler = async (input, ctx) => {
  const opts = input as { op: 'read' | 'write' | 'append'; path: string; content?: string };
  if (!opts.path) return { ok: false, data: null, error: 'path 必填' };
  if (!isPathSafe(opts.path, ctx.cwd)) {
    return { ok: false, data: null, error: '路径越界' };
  }
  const abs = path.resolve(ctx.cwd, opts.path);
  try {
    if (opts.op === 'read') {
      const content = await fs.readFile(abs, 'utf-8');
      return { ok: true, data: { content } };
    }
    if (opts.op === 'write') {
      await fs.writeFile(abs, opts.content ?? '');
      return { ok: true, data: { ok: true } };
    }
    if (opts.op === 'append') {
      await fs.appendFile(abs, opts.content ?? '');
      return { ok: true, data: { ok: true } };
    }
    return { ok: false, data: null, error: `未知 op: ${opts.op}` };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
};

// 3. shell_exec —— 用 Bun.spawn 沙箱执行 shell 命令
const shellExec: ToolHandler = async (input, ctx) => {
  const opts = input as { command: string; cwd?: string; timeoutMs?: number };
  if (!opts.command) return { ok: false, data: null, error: 'command 必填' };
  const cwd = opts.cwd && isPathSafe(opts.cwd, ctx.cwd) ? path.resolve(ctx.cwd, opts.cwd) : ctx.cwd;
  try {
    // 用 sh -c 执行命令字符串，沙箱隔离环境变量
    const result = await runInSandbox('sh', ['-c', opts.command], {
      cwd,
      timeoutMs: opts.timeoutMs ?? 5000,
    });
    return {
      ok: result.exitCode === 0,
      data: {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        killed: result.killed,
      },
    };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
};

// 4. http_request —— fetch URL
const httpRequest: ToolHandler = async (input) => {
  const opts = input as {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  };
  if (!opts.url) return { ok: false, data: null, error: 'url 必填' };
  try {
    const resp = await fetch(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
    });
    const body = await resp.text();
    const headers: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      ok: resp.ok,
      data: { status: resp.status, headers, body },
    };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
};

// 注册内置工具
export function registerBuiltinTools() {
  registerTool('code_search', codeSearch);
  registerTool('file_io', fileIo);
  registerTool('shell_exec', shellExec);
  registerTool('http_request', httpRequest);
}

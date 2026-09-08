// Skill 工具注册表 — Skill 执行引擎按 tool 名查找执行器
// M2 内置 4 个工具：code_search / file_io / shell_exec / http_request
// 这些是 M3 真正沙箱的前身；M2 先跑通链路，M3 替换为 Bun.spawn 隔离版
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

// 1. code_search —— 递归 grep
const codeSearch: ToolHandler = async (input, ctx) => {
  const opts = input as { pattern: string; cwd?: string; fileGlob?: string };
  if (!opts.pattern) return { ok: false, data: null, error: 'pattern 必填' };
  const cwd = opts.cwd && isPathSafe(opts.cwd, ctx.cwd) ? opts.cwd : ctx.cwd;
  try {
    const result = await runShell('rg', ['-n', '--', opts.pattern, cwd], ctx.cwd);
    const lines = result.stdout.split('\n').filter(Boolean).slice(0, 50);
    const matches = lines.map((l) => {
      // rg 输出格式 file:line:content
      const m = l.match(/^(.+?):(\d+):(.*)$/);
      return m ? { file: m[1], line: Number(m[2]), content: m[3] } : { file: l, line: 0, content: '' };
    });
    return { ok: true, data: { matches } };
  } catch (e) {
    return { ok: false, data: null, error: (e as Error).message };
  }
};

// 2. file_io —— 读/写/追加
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

// 3. shell_exec —— 在 cwd 下执行 shell，超时控制
const shellExec: ToolHandler = async (input, ctx) => {
  const opts = input as { command: string; cwd?: string; timeoutMs?: number };
  if (!opts.command) return { ok: false, data: null, error: 'command 必填' };
  const cwd = opts.cwd && isPathSafe(opts.cwd, ctx.cwd) ? path.resolve(ctx.cwd, opts.cwd) : ctx.cwd;
  try {
    const result = await runShell(opts.command, [], cwd, opts.timeoutMs ?? 5000);
    return {
      ok: result.exitCode === 0,
      data: {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
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

function isPathSafe(target: string, base: string): boolean {
  const resolved = path.resolve(base, target);
  const rel = path.relative(base, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function runShell(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 5000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ exitCode: -1, stdout, stderr: `timeout after ${timeoutMs}ms\n${stderr}` });
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout, stderr: err.message });
    });
  });
}

// 注册内置工具
export function registerBuiltinTools() {
  registerTool('code_search', codeSearch);
  registerTool('file_io', fileIo);
  registerTool('shell_exec', shellExec);
  registerTool('http_request', httpRequest);
}

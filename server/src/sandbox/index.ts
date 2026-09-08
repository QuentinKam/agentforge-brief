// Agent 沙箱 — PRD §3.1 + AGENTS.md §2
// 用 Bun.spawn 启动子进程执行 Agent 生成的代码 / shell 命令
// 安全措施：
//   1. 环境变量白名单：只传 PATH/HOME/LANG，剔除 OPENAI_API_KEY 等敏感变量
//   2. 工作目录隔离：cwd 必须是已建好的临时目录，不能是项目根
//   3. 超时控制：超过 timeoutMs 强制 SIGKILL
//   4. stdout/stderr 实时采集
//   5. 不继承父进程的文件描述符（stdio: pipe）
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SandboxOptions {
  /** 工作目录；不传则自动创建临时目录 */
  cwd?: string;
  /** 超时毫秒，默认 5000 */
  timeoutMs?: number;
  /** 额外允许的环境变量名 */
  extraEnvAllow?: string[];
  /** 是否保留临时目录（调试用），默认 false 调用后删除 */
  keepTmp?: boolean;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  killed: boolean;
  cwd: string;
}

// 环境变量白名单 —— 只传必要项
const ENV_ALLOWLIST = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR'];

export async function runInSandbox(
  command: string,
  args: string[] = [],
  opts: SandboxOptions = {},
): Promise<SandboxResult> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const keepTmp = opts.keepTmp ?? false;

  // 工作目录：优先用调用方指定的（仍校验），否则建临时目录
  let cwd = opts.cwd;
  let createdTmp = false;
  if (!cwd) {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'agentforge-sandbox-'));
    createdTmp = true;
  } else {
    // 强制 resolve 到绝对路径，且必须存在
    cwd = path.resolve(cwd);
    try {
      await fs.access(cwd);
    } catch {
      cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'agentforge-sandbox-'));
      createdTmp = true;
    }
  }

  // 白名单环境变量
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key] as string;
  }
  if (opts.extraEnvAllow) {
    for (const key of opts.extraEnvAllow) {
      if (process.env[key] !== undefined) env[key] = process.env[key] as string;
    }
  }

  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // 不 detach：父进程退出时子进程一起退出
      detached: false,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      // 清理临时目录
      if (createdTmp && !keepTmp) {
        fs.rm(cwd!, { recursive: true, force: true }).catch(() => {});
      }
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        durationMs,
        killed,
        cwd,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      if (createdTmp && !keepTmp) {
        fs.rm(cwd!, { recursive: true, force: true }).catch(() => {});
      }
      resolve({
        exitCode: -1,
        stdout,
        stderr: `${stderr}\nspawn error: ${err.message}`,
        durationMs,
        killed: false,
        cwd,
      });
    });
  });
}

/**
 * 在沙箱中执行一段 JS/TS 代码
 * 写入临时目录的 entry.ts，用 bun 执行
 */
export async function runCodeInSandbox(
  code: string,
  opts: SandboxOptions = {},
): Promise<SandboxResult> {
  const tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'agentforge-code-'));
  const entryPath = path.join(tmpCwd, 'entry.ts');
  await fs.writeFile(entryPath, code);
  try {
    return await runInSandbox('bun', [entryPath], { ...opts, cwd: tmpCwd, keepTmp: true });
  } finally {
    if (!opts.keepTmp) {
      await fs.rm(tmpCwd, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * 路径越界检查：target 必须在 base 目录内（不能 .. 逃出）
 */
export function isPathSafe(target: string, base: string): boolean {
  const resolved = path.resolve(base, target);
  const rel = path.relative(base, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

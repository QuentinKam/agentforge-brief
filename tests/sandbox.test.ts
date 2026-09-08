// 沙箱安全测试 — TDD：PRD §M3 验收点②
// 验证子进程无法访问父进程环境变量 / 工作目录越界
import { test, expect, describe } from 'bun:test';
import { runInSandbox, runCodeInSandbox, isPathSafe } from '../server/src/sandbox';

describe('沙箱环境变量隔离', () => {
  test('子进程看不到 OPENAI_API_KEY', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-secret-12345';
    try {
      // 用 printenv 输出所有环境变量，检查敏感变量是否泄漏
      const result = await runInSandbox('printenv');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('OPENAI_API_KEY');
      expect(result.stdout).not.toContain('sk-test-secret');
      expect(result.stdout).not.toContain('JWT_SECRET');
      expect(result.stdout).not.toContain('ANTHROPIC_API_KEY');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test('子进程能拿到 PATH/HOME', async () => {
    const result = await runInSandbox('printenv');
    expect(result.stdout).toContain('PATH');
    expect(result.stdout).toContain('HOME');
  });

  test('extraEnvAllow 允许显式传入变量', async () => {
    const result = await runInSandbox('printenv', [], {
      extraEnvAllow: ['USER'],
    });
    // macOS 默认 USER 不在白名单，但显式 allow 后应可见
    if (process.env.USER) {
      expect(result.stdout).toContain(process.env.USER);
    }
  });
});

describe('沙箱工作目录隔离', () => {
  test('默认创建临时目录，与项目根不同', async () => {
    const result = await runInSandbox('pwd');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).not.toContain('agentforge-brief');
    expect(result.stdout.trim()).toMatch(/agentforge-sandbox-/);
  });

  test('keepTmp 时不清理目录', async () => {
    const result = await runInSandbox('pwd', [], { keepTmp: true });
    expect(result.cwd).toMatch(/agentforge-sandbox-/);
  });

  test('显式 cwd 不存在时自动 fallback 到临时目录', async () => {
    const result = await runInSandbox('pwd', [], { cwd: '/nonexistent/path/xyz' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/agentforge-sandbox-/);
  });
});

describe('沙箱超时控制', () => {
  test('超过 timeoutMs 强制 SIGKILL', async () => {
    const start = Date.now();
    const result = await runInSandbox('sleep', ['10'], { timeoutMs: 200 });
    const elapsed = Date.now() - start;
    expect(result.killed).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  test('正常完成不受超时影响', async () => {
    const result = await runInSandbox('echo', ['hello'], { timeoutMs: 5000 });
    expect(result.killed).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });
});

describe('stdout/stderr 采集', () => {
  test('stdout 被采集', async () => {
    const result = await runInSandbox('echo', ['captured-stdout']);
    expect(result.stdout).toContain('captured-stdout');
  });

  test('stderr 被采集', async () => {
    const result = await runInSandbox('sh', ['-c', 'echo captured-stderr >&2']);
    expect(result.stderr).toContain('captured-stderr');
  });
});

describe('runCodeInSandbox 执行 TS 代码', () => {
  test('执行简单 TS 代码并采集输出', async () => {
    const code = `console.log("hello-from-bun-sandbox");`;
    const result = await runCodeInSandbox(code);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello-from-bun-sandbox');
  });

  test('子进程访问 process.env.OPENAI_API_KEY 时为 undefined', async () => {
    process.env.OPENAI_API_KEY = 'sk-leak-test';
    try {
      const code = `console.log("API_KEY=" + (process.env.OPENAI_API_KEY ?? "UNDEFINED"));`;
      const result = await runCodeInSandbox(code);
      expect(result.stdout).toContain('API_KEY=UNDEFINED');
      expect(result.stdout).not.toContain('sk-leak-test');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test('代码运行时无法访问父进程的工作目录文件（.env）', async () => {
    // 子进程 cwd 是临时目录，看不到项目根的 .env
    const code = `
import { readFileSync } from 'node:fs';
try {
  const content = readFileSync('.env', 'utf-8');
  console.log("FOUND:" + content.slice(0, 50));
} catch (e) {
  console.log("NOT_FOUND:" + e.message);
}
`;
    const result = await runCodeInSandbox(code);
    expect(result.stdout).toContain('NOT_FOUND');
    expect(result.stdout).not.toContain('OPENAI_API_KEY');
  });
});

describe('isPathSafe 路径越界检查', () => {
  test('相对路径合法', () => {
    expect(isPathSafe('foo/bar', '/tmp/base')).toBe(true);
    expect(isPathSafe('./foo', '/tmp/base')).toBe(true);
  });

  test('.. 逃出 base 视为越界', () => {
    expect(isPathSafe('../escape', '/tmp/base')).toBe(false);
    expect(isPathSafe('foo/../../../etc/passwd', '/tmp/base')).toBe(false);
  });

  test('绝对路径视为越界', () => {
    expect(isPathSafe('/etc/passwd', '/tmp/base')).toBe(false);
  });
});

// 预置 Skill 模板 — PRD §3.2 要求：代码搜索、文件读写、shell 命令、HTTP 请求
// JSON Schema 形式（standardSchema JSON），Skill 执行引擎按此校验输入

export interface SkillTemplate {
  name: string;
  description: string;
  trigger: { keywords?: string[]; semantic?: string };
  toolChain: Array<{ tool: string; description: string }>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    name: '代码搜索',
    description: '在指定目录中按正则或关键词搜索代码，返回匹配的文件路径和上下文行',
    trigger: { keywords: ['搜索', '查找', 'grep', 'find', 'search'], semantic: '搜索代码' },
    toolChain: [{ tool: 'code_search', description: '递归搜索文件内容' }],
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索的正则或关键词' },
        cwd: { type: 'string', description: '搜索根目录（默认项目根）' },
        fileGlob: { type: 'string', description: '文件名 glob（默认 *.ts）' },
      },
      required: ['pattern'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'number' },
              content: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: '文件读写',
    description: '读取或写入指定路径的文件',
    trigger: { keywords: ['读', '写', 'cat', 'read', 'write', 'edit'], semantic: '文件读写' },
    toolChain: [{ tool: 'file_io', description: '文件读/写' }],
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['read', 'write', 'append'] },
        path: { type: 'string' },
        content: { type: 'string', description: '写入的内容（op=read 时忽略）' },
      },
      required: ['op', 'path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        content: { type: 'string', description: '读到的内容（op=write 时无）' },
      },
    },
  },
  {
    name: 'Shell 命令',
    description: '在沙箱中执行 shell 命令并捕获 stdout/stderr',
    trigger: { keywords: ['shell', '执行', 'run', 'exec', 'bash'], semantic: '执行 shell 命令' },
    toolChain: [{ tool: 'shell_exec', description: '执行 shell 子进程' }],
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        cwd: { type: 'string', description: '工作目录' },
        timeoutMs: { type: 'number', description: '超时毫秒（默认 5000）' },
      },
      required: ['command'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        exitCode: { type: 'number' },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
      },
    },
  },
  {
    name: 'HTTP 请求',
    description: '发起 HTTP/HTTPS 请求，返回响应状态、头、正文',
    trigger: { keywords: ['http', 'request', 'curl', 'fetch'], semantic: 'HTTP 请求' },
    toolChain: [{ tool: 'http_request', description: 'HTTP 客户端调用' }],
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '请求 URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        headers: { type: 'object' },
        body: { type: 'string', description: '请求体（POST/PUT/PATCH 用）' },
      },
      required: ['url', 'method'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'number' },
        headers: { type: 'object' },
        body: { type: 'string' },
      },
    },
  },
];

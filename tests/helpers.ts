// 测试辅助：每个测试前清空业务表（dev 库专用）
import { sql } from 'drizzle-orm';
import { db } from '../server/src/db';

export async function truncateAll() {
  // 顺序：先子表后父表，避免外键约束
  await db.execute(sql`TRUNCATE rag_chunks RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE rag_documents RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE agent_run_steps RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE agent_runs RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE skills RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE harness_configs RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE agent_projects RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE users RESTART IDENTITY CASCADE`);
}

// Hono app fetch 签名（兼容 Bun.serve export default 风格）
export type AppFetch = (req: Request) => Response | Promise<Response>;

/** 注册一个测试用户，返回 token + userId */
export async function registerTestUser(
  app: { fetch: AppFetch },
  email = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
  password = 'password123',
): Promise<{ token: string; userId: string; email: string; password: string }> {
  const resp = await app.fetch(
    new Request('http://test/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Test User' }),
    }),
  );
  if (!resp.ok) {
    const body = await resp.json();
    throw new Error(`registerTestUser failed: ${JSON.stringify(body)}`);
  }
  const body = (await resp.json()) as { token: string; user: { id: string } };
  return { token: body.token, userId: body.user.id, email, password };
}

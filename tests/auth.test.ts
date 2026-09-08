// 认证模块测试 — TDD：JWT 工具 + 错误响应 + 注册/登录集成
import { test, expect, describe, beforeEach } from 'bun:test';
import { signToken, verifyToken, extractBearer } from '../server/src/lib/jwt';
import { ApiError } from '../server/src/lib/errors';
import { truncateAll, registerTestUser } from './helpers';
import app from '../server/src/index';

describe('JWT 工具', () => {
  test('signToken + verifyToken 闭环', () => {
    const token = signToken({ sub: 'user-123', email: 'a@b.com' });
    expect(token).toBeTruthy();
    const payload = verifyToken(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('a@b.com');
    expect(payload.exp).toBeGreaterThan(0);
  });

  test('verifyToken 拒绝篡改的 token', () => {
    const token = signToken({ sub: 'user-123', email: 'a@b.com' });
    const tampered = token.slice(0, -2) + 'XX';
    expect(() => verifyToken(tampered)).toThrow();
  });

  test('extractBearer 提取 Bearer token', () => {
    expect(extractBearer('Bearer abc123')).toBe('abc123');
    expect(extractBearer('bearer abc123')).toBe('abc123');
    expect(extractBearer('abc123')).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer(null)).toBeNull();
  });
});

describe('ApiError 统一响应结构', () => {
  test('工厂方法产生正确状态码', () => {
    expect(ApiError.badRequest('X', 'm').statusCode).toBe(400);
    expect(ApiError.unauthorized('X', 'm').statusCode).toBe(401);
    expect(ApiError.forbidden('X', 'm').statusCode).toBe(403);
    expect(ApiError.notFound('X', 'm').statusCode).toBe(404);
    expect(ApiError.conflict('X', 'm').statusCode).toBe(409);
    expect(ApiError.internal('X', 'm').statusCode).toBe(500);
  });

  test('details 可选', () => {
    const e = ApiError.notFound('X', 'm');
    expect(e.details).toBeUndefined();
    const e2 = ApiError.notFound('X', 'm', { field: 'id' });
    expect(e2.details).toEqual({ field: 'id' });
  });
});

describe('POST /api/auth/register + /login 集成', () => {
  beforeEach(truncateAll);

  test('注册成功返回 token + user', async () => {
    const { token, userId, email } = await registerTestUser(app);
    expect(token).toBeTruthy();
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(email).toContain('@');
  });

  test('重复注册 409', async () => {
    const { email, password } = await registerTestUser(app);
    const resp = await app.fetch(
      new Request('http://test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(resp.status).toBe(409);
    const body = (await resp.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_EMAIL_TAKEN');
  });

  test('密码短于 8 位 400', async () => {
    const resp = await app.fetch(
      new Request('http://test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 's@b.com', password: '123' }),
      }),
    );
    expect(resp.status).toBe(400);
  });

  test('登录成功返回 token', async () => {
    const { email, password } = await registerTestUser(app);
    const resp = await app.fetch(
      new Request('http://test/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { token: string };
    expect(body.token).toBeTruthy();
  });

  test('登录密码错误 401', async () => {
    const { email } = await registerTestUser(app);
    const resp = await app.fetch(
      new Request('http://test/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      }),
    );
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });
});

describe('authMiddleware 鉴权', () => {
  beforeEach(truncateAll);

  test('无 Authorization 头 401', async () => {
    const resp = await app.fetch(
      new Request('http://test/api/agent-projects', { method: 'GET' }),
    );
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
  });

  test('无效 token 401', async () => {
    const resp = await app.fetch(
      new Request('http://test/api/agent-projects', {
        method: 'GET',
        headers: { Authorization: 'Bearer not-a-jwt' },
      }),
    );
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_INVALID_TOKEN');
  });
});

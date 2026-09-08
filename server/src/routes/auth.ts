// 认证路由 — POST /api/auth/register、POST /api/auth/login
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { signToken } from '../lib/jwt';
import { ApiError, sendApiError } from '../lib/errors';
import { zodHook } from '../lib/zod-hook';
import type { AppEnv } from '../types';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, '密码至少 8 位').max(100),
  name: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(100),
});

export const authRoutes = new Hono<AppEnv>()
  .post('/register', zValidator('json', registerSchema, zodHook), async (ctx) => {
    const { email, password, name } = ctx.req.valid('json');

    // 唯一性冲突检查
    const existed = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existed.length > 0) {
      return sendApiError(
        ctx,
        ApiError.conflict('AUTH_EMAIL_TAKEN', '该邮箱已被注册'),
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [created] = await db
      .insert(schema.users)
      .values({ email, passwordHash, name })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
      });

    if (!created) {
      return sendApiError(
        ctx,
        ApiError.internal('AUTH_INSERT_FAILED', '用户写入失败'),
      );
    }

    const token = signToken({ sub: created.id, email: created.email });
    return ctx.json({ token, user: created }, 201);
  })
  .post('/login', zValidator('json', loginSchema, zodHook), async (ctx) => {
    const { email, password } = ctx.req.valid('json');

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!user) {
      return sendApiError(
        ctx,
        ApiError.unauthorized('AUTH_INVALID_CREDENTIALS', '邮箱或密码错误'),
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return sendApiError(
        ctx,
        ApiError.unauthorized('AUTH_INVALID_CREDENTIALS', '邮箱或密码错误'),
      );
    }

    const token = signToken({ sub: user.id, email: user.email });
    return ctx.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    });
  });

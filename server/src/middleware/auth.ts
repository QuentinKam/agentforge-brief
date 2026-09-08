// 鉴权中间件 — 校验 Bearer JWT，挂载 ctx.state.user
import type { Context, MiddlewareHandler } from 'hono';
import { verifyToken, extractBearer } from '../lib/jwt';
import { ApiError, sendApiError } from '../lib/errors';

// 通过 Hono Variables 类型扩展 ctx.state
// 在 server/src/types.ts 中已声明；这里仅运行时使用
export const authMiddleware: MiddlewareHandler = async (ctx, next) => {
  const token = extractBearer(ctx.req.header('authorization'));
  if (!token) {
    return sendApiError(
      ctx,
      ApiError.unauthorized('AUTH_MISSING_TOKEN', '缺少 Authorization Bearer 头'),
    );
  }
  try {
    const payload = verifyToken(token);
    ctx.set('user', { id: payload.sub, email: payload.email });
    await next();
  } catch {
    return sendApiError(
      ctx,
      ApiError.unauthorized('AUTH_INVALID_TOKEN', 'JWT 校验失败或已过期'),
    );
  }
};

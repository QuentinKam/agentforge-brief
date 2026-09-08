// Hono ctx.state 类型扩展
import type { Env, MiddlewareHandler } from 'hono';

// ctx.set('user', ...) / ctx.get('user')
type AuthState = {
  user: { id: string; email: string };
};

// 让 Hono 推断 ctx.state 的形状
export type AppEnv = Env & {
  Variables: AuthState;
};

// 工具类型：包装已知中间件链路的状态
export type WithAuth = MiddlewareHandler<{ Variables: AuthState }>;

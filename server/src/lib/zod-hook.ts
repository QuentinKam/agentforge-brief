// 统一 zod-validator 错误响应 hook
// zod-validator 默认返回 { success: false, error: ZodError } 结构，
// 不符合 AGENTS.md §4.5 的统一错误响应（code/message/details）
// 这个 hook 把 ZodError 转成 ApiError 统一结构
import type { Hook } from '@hono/zod-validator';
import { ApiError, sendApiError } from './errors';

export const zodHook: Hook<any, any, any> = (result, ctx) => {
  if (!result.success) {
    return sendApiError(
      ctx,
      ApiError.badRequest('VALIDATION_ERROR', '请求参数校验失败', {
        issues: result.error.issues.map((i: any) => ({
          path: i.path,
          message: i.message,
          code: i.code,
        })),
      }),
    );
  }
};

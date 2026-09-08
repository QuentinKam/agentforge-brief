// 统一错误响应结构 — AGENTS.md §4.5：API 层统一错误响应（code/message/details），不在控制器里裸 throw
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | unknown[];
  };
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown> | unknown[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown> | unknown[]) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(code: string, message: string, details?: Record<string, unknown> | unknown[]) {
    return new ApiError(401, code, message, details);
  }

  static forbidden(code: string, message: string, details?: Record<string, unknown> | unknown[]) {
    return new ApiError(403, code, message, details);
  }

  static notFound(code: string, message: string, details?: Record<string, unknown> | unknown[]) {
    return new ApiError(404, code, message, details);
  }

  static conflict(code: string, message: string, details?: Record<string, unknown> | unknown[]) {
    return new ApiError(409, code, message, details);
  }

  static internal(code: string, message: string, details?: Record<string, unknown> | unknown[]) {
    return new ApiError(500, code, message, details);
  }
}

/** 把 ApiError 序列化为统一响应体 */
export function sendApiError(ctx: Context, err: ApiError): Response {
  const body: ApiErrorBody = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
  return ctx.json(body, err.statusCode);
}

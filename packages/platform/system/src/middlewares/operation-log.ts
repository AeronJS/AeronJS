/**
 * @ventostack/system - 操作日志中间件
 * 记录写操作的审计日志，自动脱敏敏感字段，异步写入不阻塞响应
 */

import type { Middleware } from "@ventostack/core";
import type { AuditStore } from "@ventostack/observability";

/** 操作日志中间件配置 */
export interface OperationLogOptions {
  /** 排除的路径列表（不记录日志） */
  excludePaths?: string[];
  /** 需要脱敏的字段名（不区分大小写） */
  sensitiveFields?: string[];
}

/** 默认需要脱敏的字段 */
const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "token",
  "secret",
  "key",
  "cookie",
  "authorization",
  "phone",
  "email",
  "idcard",
  "mfaSecret",
];

/**
 * 递归脱敏对象中的敏感字段
 * @param obj 原始对象
 * @param sensitiveSet 敏感字段集合
 * @returns 脱敏后的对象
 */
function sanitize(obj: unknown, sensitiveSet: Set<string>): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item, sensitiveSet));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveSet.has(key.toLowerCase())) {
      result[key] = "******";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitize(value, sensitiveSet);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 创建操作日志中间件
 *
 * 跳过 GET / HEAD / OPTIONS 请求，仅记录写操作。
 * 读取请求中的用户、方法、URL、IP、Body 信息，
 * 对 Body 中的敏感字段进行脱敏后异步写入审计日志。
 *
 * @param auditLog 审计日志存储实例
 * @param options 配置选项
 * @returns Middleware 实例
 */
export function createOperationLogMiddleware(
  auditLog: AuditStore,
  options?: OperationLogOptions,
): Middleware {
  const excludePaths = new Set(options?.excludePaths ?? []);
  const sensitiveSet = new Set([
    ...DEFAULT_SENSITIVE_FIELDS,
    ...(options?.sensitiveFields ?? []).map((f) => f.toLowerCase()),
  ]);

  return async (ctx, next) => {
    const method = ctx.method.toUpperCase();

    // 跳过读操作
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }

    // 跳过排除路径
    if (excludePaths.has(ctx.path)) {
      return next();
    }

    // 提取请求信息
    const user = ctx.user as { id?: string; username?: string } | undefined;
    const actor = user?.username ?? user?.id ?? "anonymous";
    const startTime = Date.now();

    // 读取并脱敏请求体
    let sanitizedBody: unknown = null;
    try {
      const body = ctx.body;
      if (body && typeof body === "object" && Object.keys(body as Record<string, unknown>).length > 0) {
        sanitizedBody = sanitize(body, sensitiveSet);
      }
    } catch {
      sanitizedBody = null;
    }

    // 执行后续处理
    let responseStatus = 200;
    let errorMsg: string | null = null;
    try {
      const response = await next();
      responseStatus = response.status;
      return response;
    } catch (err) {
      responseStatus = 500;
      errorMsg = err instanceof Error ? err.message : "Unknown error";
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // 异步写入审计日志，不阻塞响应
      auditLog.append({
        actor,
        action: `${method} ${ctx.path}`,
        resource: "operation",
        result: responseStatus < 400 ? "success" : errorMsg ? "failure" : "failure",
        metadata: {
          method,
          url: ctx.path,
          duration,
          status: responseStatus,
          ...(sanitizedBody ? { body: sanitizedBody } : {}),
          ...(errorMsg ? { errorMsg } : {}),
        },
      }).catch(() => {
        // 审计日志写入失败不应影响已发出的响应
      });
    }
  };
}

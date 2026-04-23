import type { Middleware } from "@ventostack/core";
import { VentoStackError } from "@ventostack/core";
import type { Logger } from "@ventostack/observability";

/**
 * 请求日志中间件：记录请求方法、路径、状态码、耗时
 */
export function requestLogger(logger: Logger): Middleware {
  return async (ctx, next) => {
    const start = performance.now();
    const response = await next();
    const duration = (performance.now() - start).toFixed(2);

    logger.info("request", {
      method: ctx.method,
      path: ctx.path,
      status: response.status,
      duration: `${duration}ms`,
    });

    return response;
  };
}

/**
 * 全局错误处理中间件：捕获未处理的异常，返回统一错误格式
 */
export function errorHandler(logger: Logger): Middleware {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (error instanceof VentoStackError) {
        logger.error("unhandled error", {
          method: ctx.method,
          path: ctx.path,
          error: message,
        });
        return ctx.json({ error: error.errorCode, message: error.message }, error.code);
      }

      logger.error("unhandled error", {
        method: ctx.method,
        path: ctx.path,
        error: message,
      });

      return ctx.json({ error: "INTERNAL_ERROR", message: "Internal Server Error" }, 500);
    }
  };
}

// @aeron/core - 请求 ID 中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

/**
 * 创建请求 ID 中间件
 * 从请求头读取或自动生成 UUID，并注入到 ctx.state 与响应头中
 * @param headerName - 请求头名称，默认 X-Request-Id
 * @returns Middleware 实例
 */
export function requestId(headerName = "X-Request-Id"): Middleware {
  return async (ctx: Context, next) => {
    const id = ctx.headers.get(headerName) ?? crypto.randomUUID();
    ctx.state.requestId = id;

    const response = await next();
    const newHeaders = new Headers(response.headers);
    newHeaders.set(headerName, id);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

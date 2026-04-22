// @aeron/core - CORS 中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** CORS 配置选项 */
export interface CorsOptions {
  /** 允许的源：字符串、字符串数组或自定义判断函数 */
  origin?: string | string[] | ((origin: string) => boolean);
  /** 允许的 HTTP 方法 */
  methods?: string[];
  /** 允许的请求头 */
  allowedHeaders?: string[];
  /** 暴露给客户端的响应头 */
  exposedHeaders?: string[];
  /** 是否允许携带凭证 */
  credentials?: boolean;
  /** 预检请求缓存时间（秒） */
  maxAge?: number;
}

/**
 * 判断请求源是否被允许
 * @param requestOrigin - 请求中的 Origin
 * @param option - CORS 配置中的 origin
 * @returns 是否允许
 */
function normalizeOrigin(origin: string): string {
  // 去除尾部斜杠，避免 "http://localhost:4321/" 与 "http://localhost:4321" 不匹配
  return origin.replace(/\/$/, "");
}

function isOriginAllowed(requestOrigin: string, option: CorsOptions["origin"]): boolean {
  if (option === undefined) {
    return false; // 默认 deny
  }
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  if (typeof option === "string") {
    return normalizeOrigin(option) === normalizedRequestOrigin;
  }
  if (Array.isArray(option)) {
    return option.map(normalizeOrigin).includes(normalizedRequestOrigin);
  }
  return option(requestOrigin);
}

/**
 * 创建 CORS 中间件
 * @param options - CORS 配置选项
 * @returns Middleware 实例
 */
export function cors(options: CorsOptions = {}): Middleware {
  // 安全检查：禁止 credentials + wildcard origin
  if (options.credentials && options.origin === "*") {
    throw new Error("CORS credentials with wildcard origin is not allowed");
  }

  const methods = options.methods ?? ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"];
  const allowedHeaders = options.allowedHeaders;
  const exposedHeaders = options.exposedHeaders;
  const credentials = options.credentials ?? false;
  const maxAge = options.maxAge;

  return async (ctx: Context, next) => {
    const requestOrigin = ctx.headers.get("origin") ?? "";

    // 无 origin header 则不处理 CORS
    if (!requestOrigin) {
      return next();
    }

    const allowed = isOriginAllowed(requestOrigin, options.origin);

    if (!allowed) {
      // origin 不允许，不附加 CORS headers
      if (ctx.method === "OPTIONS") {
        return new Response(null, { status: 403 });
      }
      return next();
    }

    const corsHeaders = new Headers();
    corsHeaders.set("Access-Control-Allow-Origin", requestOrigin);

    if (credentials) {
      corsHeaders.set("Access-Control-Allow-Credentials", "true");
    }

    if (exposedHeaders && exposedHeaders.length > 0) {
      corsHeaders.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
    }

    // Preflight
    if (ctx.method === "OPTIONS") {
      corsHeaders.set("Access-Control-Allow-Methods", methods.join(", "));
      if (allowedHeaders && allowedHeaders.length > 0) {
        corsHeaders.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
      } else {
        // 反射请求头
        const requestHeaders = ctx.headers.get("access-control-request-headers");
        if (requestHeaders) {
          corsHeaders.set("Access-Control-Allow-Headers", requestHeaders);
        }
      }
      if (maxAge !== undefined) {
        corsHeaders.set("Access-Control-Max-Age", String(maxAge));
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 非预检请求：调用 next，在 response 上附加 CORS headers
    const response = await next();
    const newHeaders = new Headers(response.headers);
    corsHeaders.forEach((value, key) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

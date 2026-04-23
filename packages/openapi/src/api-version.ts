/**
 * @ventostack/openapi — API 版本管理（Header 版本）
 *
 * 提供基于 Accept header 或 X-API-Version header 的 API 版本解析与中间件。
 * 支持版本兼容性检查、废弃版本标记和默认版本回退。
 */

import type { Middleware } from "@ventostack/core";

/** API 版本中间件选项 */
export interface APIVersionOptions {
  /** 默认版本 */
  defaultVersion: string;
  /** 支持的版本列表 */
  supportedVersions: string[];
  /** 已废弃的版本列表 */
  deprecatedVersions?: string[];
  /** 自定义 Accept header vendor 前缀 */
  vendorPrefix?: string;
}

/**
 * 从 Accept header 解析 API 版本
 * @param accept - Accept header 值
 * @param vendorPrefix - vendor 前缀，默认 "api"
 * @returns 解析到的版本号字符串，解析失败返回 null
 */
export function parseVersionFromAccept(accept: string, vendorPrefix = "api"): string | null {
  const regex = new RegExp(`application\\/vnd\\.${vendorPrefix}\\+json;\\s*version=(\\d+)`);
  const match = regex.exec(accept);
  return match ? match[1]! : null;
}

/**
 * 创建 API 版本中间件
 * @param options - API 版本配置选项
 * @returns Middleware 中间件函数
 */
export function apiVersion(options: APIVersionOptions): Middleware {
  const {
    defaultVersion,
    supportedVersions,
    deprecatedVersions = [],
    vendorPrefix = "api",
  } = options;

  const supported = new Set(supportedVersions);
  const deprecated = new Set(deprecatedVersions);

  return async (ctx, next) => {
    // 从 Accept header 提取版本
    let version: string | null = null;
    const accept = ctx.headers.get("accept");
    if (accept) {
      version = parseVersionFromAccept(accept, vendorPrefix);
    }

    // 或从自定义 header
    if (!version) {
      version = ctx.headers.get("x-api-version");
    }

    // 使用默认版本
    if (!version) {
      version = defaultVersion;
    }

    // 检查是否支持
    if (!supported.has(version)) {
      return new Response(
        JSON.stringify({
          error: "UNSUPPORTED_VERSION",
          message: `API version ${version} is not supported. Supported: ${[...supported].join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    ctx.state.apiVersion = version;

    const response = await next();

    // 废弃版本返回 Deprecation header
    if (deprecated.has(version)) {
      const headers = new Headers(response.headers);
      headers.set("Deprecation", "true");
      headers.set("Sunset", "See documentation for migration guide");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  };
}

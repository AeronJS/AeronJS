/**
 * @ventostack/openapi — 旧版本兼容与废弃通知 + 向后兼容策略
 *
 * 提供 API 废弃声明管理、Sunset / Deprecation header 生成以及兼容性守卫能力。
 */

/** 废弃通知 */
export interface DeprecationNotice {
  /** API 路径 */
  path: string;
  /** HTTP 方法 */
  method: string;
  /** 开始废弃的版本 */
  version: string;
  /** 计划下线日期（ISO 8601） */
  sunsetDate?: string;
  /** 替代接口地址 */
  replacement?: string;
  /** 额外说明信息 */
  message?: string;
}

/** 废弃管理器，负责记录废弃接口并生成相关响应头 */
export interface DeprecationManager {
  /**
   * 注册废弃通知
   * @param notice - 废弃通知详情
   */
  deprecate(notice: DeprecationNotice): void;

  /**
   * 查询接口是否已废弃
   * @param method - HTTP 方法
   * @param path - API 路径
   * @returns 对应的废弃通知，未废弃返回 undefined
   */
  isDeprecated(method: string, path: string): DeprecationNotice | undefined;

  /** 列出所有已注册的废弃通知 */
  list(): DeprecationNotice[];

  /**
   * 生成 Sunset / Deprecation headers
   * @param method - HTTP 方法
   * @param path - API 路径
   * @returns 响应头键值对
   */
  headers(method: string, path: string): Record<string, string>;

  /**
   * 检查是否已过 sunset 日期
   * @param method - HTTP 方法
   * @param path - API 路径
   * @returns 是否已过期
   */
  isSunset(method: string, path: string): boolean;

  /**
   * 生成废弃通知 Markdown 文档
   * @returns Markdown 格式报告
   */
  report(): string;
}

/**
 * 创建废弃管理器实例
 * @returns DeprecationManager 实例
 */
export function createDeprecationManager(): DeprecationManager {
  const notices: DeprecationNotice[] = [];

  function find(method: string, path: string): DeprecationNotice | undefined {
    return notices.find((n) => n.method.toUpperCase() === method.toUpperCase() && n.path === path);
  }

  return {
    deprecate(notice: DeprecationNotice): void {
      // 去重
      const existing = find(notice.method, notice.path);
      if (existing) {
        Object.assign(existing, notice);
      } else {
        notices.push(notice);
      }
    },

    isDeprecated(method: string, path: string): DeprecationNotice | undefined {
      return find(method, path);
    },

    list(): DeprecationNotice[] {
      return [...notices];
    },

    headers(method: string, path: string): Record<string, string> {
      const notice = find(method, path);
      if (!notice) return {};

      const headers: Record<string, string> = {
        Deprecation: "true",
      };

      if (notice.sunsetDate) {
        headers.Sunset = new Date(notice.sunsetDate).toUTCString();
      }

      if (notice.replacement) {
        headers.Link = `<${notice.replacement}>; rel="successor-version"`;
      }

      return headers;
    },

    isSunset(method: string, path: string): boolean {
      const notice = find(method, path);
      if (!notice?.sunsetDate) return false;
      return new Date(notice.sunsetDate).getTime() < Date.now();
    },

    report(): string {
      const lines: string[] = [];
      lines.push("# Deprecated APIs\n");

      if (notices.length === 0) {
        lines.push("No deprecated APIs.\n");
        return lines.join("\n");
      }

      lines.push("| Method | Path | Since | Sunset | Replacement | Notes |");
      lines.push("|--------|------|-------|--------|-------------|-------|");

      for (const n of notices) {
        lines.push(
          `| ${n.method.toUpperCase()} | ${n.path} | ${n.version} | ${n.sunsetDate ?? "N/A"} | ${n.replacement ?? "N/A"} | ${n.message ?? ""} |`,
        );
      }

      return lines.join("\n");
    },
  };
}

/** 向后兼容策略配置 */
export interface CompatibilityPolicy {
  /** 版本兼容窗口（保留多少个旧版本） */
  versionWindow: number;
  /** 废弃后保留时间（天） */
  sunsetDays: number;
  /** 是否强制返回废弃 headers */
  enforceHeaders: boolean;
  /** 是否在 sunset 后拒绝请求 */
  blockAfterSunset: boolean;
}

/** 默认兼容性策略 */
export const DEFAULT_COMPATIBILITY_POLICY: CompatibilityPolicy = {
  versionWindow: 2,
  sunsetDays: 90,
  enforceHeaders: true,
  blockAfterSunset: false,
};

/**
 * 创建兼容性守卫
 * @param deprecationManager - 废弃管理器实例
 * @param policy - 可选的自定义兼容性策略
 * @returns 包含 check 方法的对象，用于在请求处理前判断接口可用性
 */
export function createCompatibilityGuard(
  deprecationManager: DeprecationManager,
  policy: Partial<CompatibilityPolicy> = {},
): {
  /**
   * 检查指定接口的兼容性状态
   * @param method - HTTP 方法
   * @param path - API 路径
   * @returns 兼容性检查结果
   */
  check(
    method: string,
    path: string,
  ): { allowed: boolean; headers: Record<string, string>; warning?: string };
} {
  const p = { ...DEFAULT_COMPATIBILITY_POLICY, ...policy };

  return {
    check(method: string, path: string) {
      const notice = deprecationManager.isDeprecated(method, path);
      if (!notice) {
        return { allowed: true, headers: {} };
      }

      const headers = p.enforceHeaders ? deprecationManager.headers(method, path) : {};
      const isSunset = deprecationManager.isSunset(method, path);

      if (isSunset && p.blockAfterSunset) {
        return {
          allowed: false,
          headers,
          warning: `API ${method} ${path} has been sunset since ${notice.sunsetDate}. Use ${notice.replacement ?? "a newer version"} instead.`,
        };
      }

      return {
        allowed: true,
        headers,
        warning: notice.message ?? `API ${method} ${path} is deprecated since ${notice.version}.`,
      };
    },
  };
}

/**
 * @ventostack/openapi — 文档版本管理
 *
 * 提供多版本 OpenAPI 规范的存储、查询和差异对比能力。
 */

/** 文档版本记录 */
export interface DocVersion {
  /** 版本号 */
  version: string;
  /** 记录日期（ISO 8601） */
  date: string;
  /** 版本描述 */
  description?: string;
  /** OpenAPI 规范对象 */
  spec: Record<string, unknown>;
}

/** 文档版本管理器 */
export interface DocVersionManager {
  /**
   * 添加版本记录
   * @param version - 版本号
   * @param spec - OpenAPI 规范对象
   * @param description - 可选的版本描述
   */
  addVersion(version: string, spec: Record<string, unknown>, description?: string): void;

  /**
   * 获取指定版本
   * @param version - 版本号
   * @returns 版本记录，不存在返回 undefined
   */
  getVersion(version: string): DocVersion | undefined;

  /**
   * 获取最新版本
   * @returns 最新版本记录，无记录返回 undefined
   */
  getLatest(): DocVersion | undefined;

  /** 列出所有版本记录 */
  list(): DocVersion[];

  /**
   * 对比两个版本的差异
   * @param v1 - 起始版本号
   * @param v2 - 目标版本号
   * @returns 差异结果，版本不存在返回 undefined
   */
  compare(v1: string, v2: string): VersionDiff | undefined;
}

/** 版本差异结果 */
export interface VersionDiff {
  /** 起始版本 */
  from: string;
  /** 目标版本 */
  to: string;
  /** 新增的路径列表 */
  added: string[];
  /** 移除的路径列表 */
  removed: string[];
  /** 修改的路径列表 */
  modified: string[];
}

/**
 * 创建文档版本管理器实例
 * @returns DocVersionManager 实例
 */
export function createDocVersionManager(): DocVersionManager {
  const versions: DocVersion[] = [];

  function extractPaths(spec: Record<string, unknown>): Set<string> {
    const paths = (spec as { paths?: Record<string, unknown> }).paths ?? {};
    const result = new Set<string>();
    for (const [path, methods] of Object.entries(paths)) {
      if (typeof methods === "object" && methods !== null) {
        for (const method of Object.keys(methods)) {
          result.add(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    return result;
  }

  return {
    addVersion(version: string, spec: Record<string, unknown>, description?: string): void {
      const entry: DocVersion = {
        version,
        date: new Date().toISOString(),
        spec,
      };
      if (description) {
        entry.description = description;
      }
      versions.push(entry);
    },

    getVersion(version: string): DocVersion | undefined {
      return versions.find((v) => v.version === version);
    },

    getLatest(): DocVersion | undefined {
      return versions.length > 0 ? versions[versions.length - 1] : undefined;
    },

    list(): DocVersion[] {
      return [...versions];
    },

    compare(v1: string, v2: string): VersionDiff | undefined {
      const doc1 = versions.find((v) => v.version === v1);
      const doc2 = versions.find((v) => v.version === v2);
      if (!doc1 || !doc2) return undefined;

      const paths1 = extractPaths(doc1.spec);
      const paths2 = extractPaths(doc2.spec);

      const added: string[] = [];
      const removed: string[] = [];
      const modified: string[] = [];

      for (const p of paths2) {
        if (!paths1.has(p)) added.push(p);
      }
      for (const p of paths1) {
        if (!paths2.has(p)) removed.push(p);
      }
      // 简单变更检测：在两边都存在的路径，比较 JSON
      for (const p of paths1) {
        if (paths2.has(p)) {
          const [method = "", path = ""] = p.split(" ", 2);
          const spec1Paths = (doc1.spec as { paths: Record<string, Record<string, unknown>> })
            .paths;
          const spec2Paths = (doc2.spec as { paths: Record<string, Record<string, unknown>> })
            .paths;
          const m = method.toLowerCase();
          if (
            spec1Paths[path] &&
            spec2Paths[path] &&
            JSON.stringify(spec1Paths[path][m]) !== JSON.stringify(spec2Paths[path][m])
          ) {
            modified.push(p);
          }
        }
      }

      return { from: v1, to: v2, added, removed, modified };
    },
  };
}

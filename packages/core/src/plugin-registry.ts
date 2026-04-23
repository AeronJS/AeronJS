// @ventostack/core - 插件注册表

/** 插件清单 */
export interface PluginManifest {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 关键词 */
  keywords?: string[];
  /** 依赖插件列表 */
  dependencies?: string[];
}

/** 插件注册表条目 */
export interface PluginRegistryEntry {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 注册时间戳 */
  installedAt: number;
}

/** 插件注册表接口 */
export interface PluginRegistry {
  /**
   * 注册插件清单
   * @param manifest - 插件清单
   */
  register(manifest: PluginManifest): void;
  /**
   * 注销插件
   * @param name - 插件名称
   * @returns 是否成功注销
   */
  unregister(name: string): boolean;
  /**
   * 获取插件条目
   * @param name - 插件名称
   * @returns 条目或 undefined
   */
  get(name: string): PluginRegistryEntry | undefined;
  /** 获取所有已注册条目 */
  list(): PluginRegistryEntry[];
  /**
   * 搜索插件
   * @param query - 搜索关键词
   * @returns 匹配的条目列表
   */
  search(query: string): PluginRegistryEntry[];
  /**
   * 判断是否已注册
   * @param name - 插件名称
   * @returns 是否已注册
   */
  has(name: string): boolean;
  /**
   * 检查插件依赖是否满足
   * @param name - 插件名称
   * @returns 依赖检查结果
   */
  checkDependencies(name: string): { satisfied: boolean; missing: string[] };
}

/**
 * 创建插件注册表
 * @returns PluginRegistry 实例
 */
export function createPluginRegistry(): PluginRegistry {
  const entries = new Map<string, PluginRegistryEntry>();

  return {
    register(manifest: PluginManifest): void {
      if (entries.has(manifest.name)) {
        throw new Error(`Plugin already registered: ${manifest.name}`);
      }
      entries.set(manifest.name, {
        manifest,
        installedAt: Date.now(),
      });
    },

    unregister(name: string): boolean {
      return entries.delete(name);
    },

    get(name: string): PluginRegistryEntry | undefined {
      return entries.get(name);
    },

    list(): PluginRegistryEntry[] {
      return Array.from(entries.values());
    },

    search(query: string): PluginRegistryEntry[] {
      const q = query.toLowerCase();
      return Array.from(entries.values()).filter((entry) => {
        const m = entry.manifest;
        return (
          m.name.toLowerCase().includes(q) ||
          (m.description?.toLowerCase().includes(q) ?? false) ||
          (m.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false)
        );
      });
    },

    has(name: string): boolean {
      return entries.has(name);
    },

    checkDependencies(name: string): { satisfied: boolean; missing: string[] } {
      const entry = entries.get(name);
      if (!entry) {
        return { satisfied: false, missing: [name] };
      }
      const deps = entry.manifest.dependencies ?? [];
      const missing = deps.filter((dep) => !entries.has(dep));
      return { satisfied: missing.length === 0, missing };
    },
  };
}

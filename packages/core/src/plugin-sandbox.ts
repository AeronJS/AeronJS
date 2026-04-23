// @ventostack/core - 插件隔离

import type { Plugin } from "./plugin";

/** 插件沙箱接口 */
export interface PluginSandbox {
  /** 注册插件（隔离执行） */
  register(plugin: Plugin): void;
  /** 获取已注册插件列表 */
  list(): PluginInfo[];
  /** 初始化所有插件 */
  initAll(context: unknown): Promise<PluginInitResult[]>;
  /** 销毁所有插件 */
  destroyAll(): Promise<void>;
}

/** 插件信息 */
export interface PluginInfo {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version?: string;
  /** 插件状态 */
  status: "registered" | "initialized" | "failed" | "destroyed";
  /** 错误信息 */
  error?: string;
}

/** 插件初始化结果 */
export interface PluginInitResult {
  /** 插件名称 */
  name: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 初始化耗时（毫秒） */
  duration: number;
}

/** 隔离插件定义 */
export interface IsolatedPlugin {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version?: string;
  /**
   * 安装钩子
   * @param context - 上下文
   */
  install?(context: unknown): void | Promise<void>;
  /** 销毁钩子 */
  destroy?(): void | Promise<void>;
}

/**
 * 创建插件沙箱，提供隔离的插件执行环境
 * 每个插件在独立的 try/catch 中执行，单个插件失败不影响其他插件
 * @returns PluginSandbox 实例
 */
export function createPluginSandbox(): PluginSandbox {
  const plugins: { plugin: IsolatedPlugin; info: PluginInfo }[] = [];

  return {
    register(plugin: IsolatedPlugin): void {
      const existing = plugins.find((p) => p.info.name === plugin.name);
      if (existing) {
        throw new Error(`Plugin already registered: ${plugin.name}`);
      }
      plugins.push({
        plugin,
        info: {
          name: plugin.name,
          ...(plugin.version ? { version: plugin.version } : {}),
          status: "registered",
        },
      });
    },

    list(): PluginInfo[] {
      return plugins.map((p) => ({ ...p.info }));
    },

    async initAll(context: unknown): Promise<PluginInitResult[]> {
      const results: PluginInitResult[] = [];

      for (const entry of plugins) {
        const start = performance.now();
        try {
          if (entry.plugin.install) {
            await entry.plugin.install(context);
          }
          entry.info.status = "initialized";
          results.push({
            name: entry.info.name,
            success: true,
            duration: performance.now() - start,
          });
        } catch (err) {
          entry.info.status = "failed";
          entry.info.error = err instanceof Error ? err.message : String(err);
          results.push({
            name: entry.info.name,
            success: false,
            error: entry.info.error,
            duration: performance.now() - start,
          });
        }
      }

      return results;
    },

    async destroyAll(): Promise<void> {
      for (const entry of plugins) {
        try {
          if (entry.plugin.destroy) {
            await entry.plugin.destroy();
          }
        } catch {
          // 忽略销毁错误
        }
        entry.info.status = "destroyed";
      }
    },
  };
}
